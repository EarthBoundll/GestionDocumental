import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { PeticionRecibida } from '../../pruebas/api-simulada';
import { CATEGORIAS, guardarSesion, paginaVacia, sesionDe, simularApi } from '../../pruebas/api-simulada';
import { rutas } from '../../rutas';

const CONTRATO = {
  id: 'doc-1',
  nombre: 'Contrato de alquiler del local',
  fechaDocumento: '2026-09-15',
  categoria: { id: 'cat-contratos', nombre: 'Contratos' },
  subidoPor: { id: 'id-usuario', nombre: 'Ana Torres' },
  archivo: { tipoMime: 'application/pdf', pesoBytes: 482_133 },
  creadoEn: '2026-10-02T14:35:16Z',
};

function abrir(ruta: string, extra: Parameters<typeof simularApi>[0] = {}) {
  guardarSesion(sesionDe('usuario'));
  const api = simularApi({
    'GET /auth/yo': { cuerpo: { usuario: sesionDe('usuario').usuario, empresa: sesionDe('usuario').empresa } },
    'GET /notificaciones': { cuerpo: { ...paginaVacia, noLeidas: 0 } },
    'GET /categorias': { cuerpo: CATEGORIAS },
    'GET /documentos': ({ consulta }: PeticionRecibida) => ({
      cuerpo: {
        datos: consulta.get('q') === 'nada' ? [] : [CONTRATO],
        paginacion: { pagina: 1, porPagina: 20, total: consulta.get('q') === 'nada' ? 0 : 1 },
        tiempoRespuestaId: `medicion-${consulta.toString() || 'inicial'}`,
      },
    }),
    'PATCH /tiempos-respuesta/:id': { estado: 204 },
    ...extra,
  });
  const enrutador = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(<RouterProvider router={enrutador} />);
  return { ...api, enrutador };
}

describe('Documentos', () => {
  it('lista, busca por nombre y deja la búsqueda en la URL para poder compartirla o volver atrás', async () => {
    const { peticiones, enrutador } = abrir('/documentos');

    expect(await screen.findByRole('link', { name: 'Contrato de alquiler del local' })).toHaveAttribute('href', '/documentos/doc-1');
    await userEvent.type(screen.getByLabelText('Buscar por nombre'), 'contrato');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => expect(enrutador.state.location.search).toBe('?q=contrato'));
    expect(peticiones.filter((p) => p.ruta === '/documentos').at(-1)!.consulta.get('q')).toBe('contrato');
    // Ningún filtro lleva la empresa: la API la toma de la sesión (RN01).
    expect(peticiones.every((p) => !p.consulta.has('empresaId'))).toBe(true);
  });

  it('envía el tiempo que la persona esperó al listado, para el indicador 7', async () => {
    const { peticiones } = abrir('/documentos');

    await screen.findByRole('link', { name: 'Contrato de alquiler del local' });
    // Con el id que trajo este listado: la API une las dos mitades de la medición (servidor y navegador).
    const esLaDeEsteListado = (p: PeticionRecibida) => p.metodo === 'PATCH' && p.ruta === '/tiempos-respuesta/medicion-pagina=1';
    await waitFor(() => expect(peticiones.some(esLaDeEsteListado)).toBe(true));
    expect(peticiones.find(esLaDeEsteListado)!.cuerpo).toEqual({ duracionClienteMs: expect.any(Number) });
  });

  it('sin resultados, ofrece quitar los filtros', async () => {
    const { enrutador } = abrir('/documentos?q=nada');

    expect(await screen.findByText('Ningún documento coincide')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar los filtros' }));

    await waitFor(() => expect(enrutador.state.location.search).toBe(''));
    expect(screen.getByLabelText('Buscar por nombre')).toHaveValue('');
  });

  it('un documento de otra empresa se ve como inexistente (404), sin confirmar que existe', async () => {
    abrir('/documentos/de-otra-empresa', {
      'GET /documentos/:id': { estado: 404, cuerpo: { error: { codigo: 'NO_ENCONTRADO', mensaje: 'El documento no existe' } } },
    });

    expect(await screen.findByRole('heading', { name: 'Este documento no existe' })).toBeInTheDocument();
  });

  it('al subir, propone el nombre del archivo y lo envía con su categoría y fecha', async () => {
    let recibido: FormData | undefined;
    abrir('/documentos/nuevo', {
      'POST /documentos': ({ cuerpo }: PeticionRecibida) => {
        recibido = cuerpo as FormData;
        return { estado: 201, cuerpo: { ...CONTRATO, id: 'doc-2', nombre: String(recibido.get('nombre')) } };
      },
    });

    await screen.findByRole('option', { name: 'Contratos' });
    await userEvent.upload(screen.getByLabelText('Archivo del documento'), new File(['%PDF-1.7'], 'contrato_alquiler-local.pdf', { type: 'application/pdf' }));
    expect(screen.getByLabelText('Nombre del documento')).toHaveValue('Contrato alquiler local');
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'cat-contratos');
    await userEvent.click(screen.getByRole('button', { name: 'Subir documento' }));

    expect(await screen.findByText('«Contrato alquiler local» se subió correctamente. Puedes subir el siguiente.')).toBeInTheDocument();
    expect(recibido?.get('categoriaId')).toBe('cat-contratos');
    expect(recibido?.get('fechaDocumento')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((recibido?.get('archivo') as File).name).toBe('contrato_alquiler-local.pdf');
    expect(screen.getByLabelText('Nombre del documento')).toHaveValue('');
  });

  it('si la API rechaza un campo, el error aparece junto a él y recibe el foco', async () => {
    abrir('/documentos/nuevo', {
      'POST /documentos': {
        estado: 400,
        cuerpo: { error: { codigo: 'VALIDACION', mensaje: 'Revisa los datos', detalles: [{ campo: 'categoriaId', mensaje: 'Elige una categoría' }] } },
      },
    });

    await screen.findByRole('option', { name: 'Contratos' });
    await userEvent.upload(screen.getByLabelText('Archivo del documento'), new File(['%PDF-1.7'], 'factura.pdf', { type: 'application/pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Subir documento' }));

    expect(await screen.findByText('Elige una categoría', { selector: 'p' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Categoría')).toHaveFocus());
  });
});
