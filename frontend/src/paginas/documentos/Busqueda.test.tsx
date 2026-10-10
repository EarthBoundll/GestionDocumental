import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { PeticionRecibida } from '../../pruebas/api-simulada';
import { CATEGORIAS, guardarSesion, paginaVacia, sesionDe, simularApi } from '../../pruebas/api-simulada';
import { rutas } from '../../rutas';
import { atajoDelRango, rangoDeAtajo } from '../../utilidades/busqueda';
import { hoyEnLima } from '../../utilidades/formato';

const CONTRATO = {
  id: 'doc-1',
  nombre: 'Contrato de alquiler del local',
  fechaDocumento: '2026-09-15',
  categoria: { id: 'cat-contratos', nombre: 'Contratos' },
  subidoPor: { id: 'id-usuario', nombre: 'Ana Torres' },
  archivo: { tipoMime: 'application/pdf', pesoBytes: 482_133 },
  creadoEn: '2026-10-02T14:35:16Z',
};

function abrir(ruta: string, rol: 'usuario' | 'administrador' = 'usuario', listado: Partial<{ aproximada: boolean; coincidencia: string }> = {}) {
  guardarSesion(sesionDe(rol));
  const api = simularApi({
    'GET /auth/yo': { cuerpo: { usuario: sesionDe(rol).usuario, empresa: sesionDe(rol).empresa } },
    'GET /notificaciones': { cuerpo: { ...paginaVacia, noLeidas: 0 } },
    'GET /categorias': { cuerpo: CATEGORIAS },
    'GET /usuarios': { cuerpo: { datos: [{ id: 'id-ana', nombre: 'Ana Torres' }, { id: 'id-luis', nombre: 'Luis Quispe' }], paginacion: { pagina: 1, porPagina: 100, total: 2 } } },
    'GET /documentos': ({ consulta }: PeticionRecibida) => ({
      cuerpo: {
        datos: [{ ...CONTRATO, ...(consulta.get('q') && { coincidencia: listado.coincidencia ?? 'nombre_inicio' }) }],
        paginacion: { pagina: 1, porPagina: 20, total: 1 },
        aproximada: listado.aproximada ?? false,
        tiempoRespuestaId: null,
      },
    }),
    'GET /documentos/sugerencias': ({ consulta }: PeticionRecibida) => ({
      cuerpo: {
        datos: (consulta.get('q') ?? '').length < 2 ? [] : [
          { id: 'doc-1', nombre: 'Contrato de alquiler del local', categoria: 'Contratos', coincidencia: 'nombre_inicio' },
          { id: 'doc-2', nombre: 'Acta de reunión', categoria: 'Otros', coincidencia: 'descripcion' },
        ],
      },
    }),
    'POST /documentos/busquedas': { estado: 204 },
    'GET /documentos/:id': { estado: 404, cuerpo: { error: { codigo: 'NO_ENCONTRADO', mensaje: 'No existe' } } },
  });
  const enrutador = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(<RouterProvider router={enrutador} />);
  return { ...api, enrutador };
}

const parametrosDe = (enrutador: ReturnType<typeof abrir>['enrutador']) => Object.fromEntries(new URLSearchParams(enrutador.state.location.search));

describe('Buscador de documentos (D42)', () => {
  it('sugiere mientras se escribe con una sola petición tras la pausa, y no busca hasta confirmar (D36)', async () => {
    const { peticiones } = abrir('/documentos');
    const usuario = userEvent.setup();
    const buscador = await screen.findByRole('combobox', { name: 'Buscar documentos' });

    await usuario.type(buscador, 'contr');

    expect(await screen.findByRole('option', { name: /Contrato de alquiler del local/ })).toBeInTheDocument();
    expect(buscador).toHaveAttribute('aria-expanded', 'true');
    const sugeridas = peticiones.filter((p) => p.ruta === '/documentos/sugerencias');
    expect(sugeridas.map((p) => p.consulta.get('q'))).toEqual(['contr']);
    // Lo escrito no es una búsqueda: el listado sigue sin texto.
    expect(peticiones.filter((p) => p.ruta === '/documentos').every((p) => !p.consulta.has('q'))).toBe(true);
  });

  it('con el teclado: ↓ marca una sugerencia, Enter la abre y deja la búsqueda en el historial', async () => {
    const { peticiones, enrutador } = abrir('/documentos');
    const usuario = userEvent.setup();
    const buscador = await screen.findByRole('combobox', { name: 'Buscar documentos' });
    await usuario.type(buscador, 'contr');
    await screen.findByRole('option', { name: /Contrato de alquiler/ });

    await usuario.keyboard('{ArrowDown}');
    const marcada = screen.getByRole('option', { name: /Contrato de alquiler/ });
    expect(marcada).toHaveAttribute('aria-selected', 'true');
    expect(buscador).toHaveAttribute('aria-activedescendant', marcada.id);
    await usuario.keyboard('{Enter}');

    await waitFor(() => expect(enrutador.state.location.pathname).toBe('/documentos/doc-1'));
    expect(peticiones.find((p) => p.ruta === '/documentos/busquedas')).toMatchObject({ metodo: 'POST', cuerpo: { q: 'contr', documentoId: 'doc-1' } });
  });

  it('Esc cierra las sugerencias, y Enter sin ninguna marcada busca como siempre', async () => {
    const { enrutador } = abrir('/documentos');
    const usuario = userEvent.setup();
    const buscador = await screen.findByRole('combobox', { name: 'Buscar documentos' });
    await usuario.type(buscador, 'contr');
    await screen.findByRole('option', { name: /Contrato de alquiler/ });

    await usuario.keyboard('{Escape}');
    expect(buscador).toHaveAttribute('aria-expanded', 'false');
    await usuario.keyboard('{Enter}');

    await waitFor(() => expect(parametrosDe(enrutador)).toEqual({ q: 'contr' }));
  });

  it('los filtros quedan en la URL, se ven como etiquetas que se quitan una a una y se limpian de una vez', async () => {
    const { enrutador } = abrir('/documentos?q=contrato&tipo=pdf&estado=aprobada&categoriaId=cat-contratos&desde=2026-07-01&hasta=2026-09-30');
    const usuario = userEvent.setup();

    const activos = await screen.findByLabelText('Filtros activos');
    for (const texto of ['«contrato»', 'PDF', 'Aprobado', 'Contratos', 'Del 01/07/2026 al 30/09/2026']) {
      expect(within(activos).getByText(texto)).toBeInTheDocument();
    }
    await usuario.click(within(activos).getByRole('button', { name: 'Quitar el filtro Aprobado' }));
    await waitFor(() => expect(parametrosDe(enrutador)).not.toHaveProperty('estado'));
    await usuario.click(within(activos).getByRole('button', { name: 'Quitar el filtro Del 01/07/2026 al 30/09/2026' }));
    await waitFor(() => expect(parametrosDe(enrutador)).toEqual({ q: 'contrato', tipo: 'pdf', categoriaId: 'cat-contratos' }));

    await usuario.click(within(activos).getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => expect(enrutador.state.location.search).toBe(''));
    expect(screen.getByRole('combobox', { name: 'Buscar documentos' })).toHaveValue('');
    expect(screen.queryByLabelText('Filtros activos')).not.toBeInTheDocument();
  });

  it('elegir tipo, aprobación y un atajo de fechas actualiza la búsqueda; el atajo queda marcado', async () => {
    const { enrutador } = abrir('/documentos');
    const usuario = userEvent.setup();

    await usuario.selectOptions(await screen.findByLabelText('Tipo'), 'imagen');
    await usuario.selectOptions(screen.getByLabelText('Aprobación'), 'pendiente');
    await usuario.click(screen.getByRole('button', { name: 'Este año' }));

    const hoy = hoyEnLima();
    await waitFor(() => expect(parametrosDe(enrutador)).toEqual({ tipo: 'imagen', estado: 'pendiente', desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy }));
    expect(screen.getByRole('button', { name: 'Este año' })).toHaveAttribute('aria-pressed', 'true');
    await usuario.selectOptions(screen.getByLabelText('Las fechas son'), 'subida');
    await waitFor(() => expect(parametrosDe(enrutador)).toMatchObject({ fechaDe: 'subida' }));
    expect(within(screen.getByLabelText('Filtros activos')).getByText(/\(subida\)$/)).toBeInTheDocument();
  });

  it('dice dónde coincidió cada resultado, y avisa cuando solo hay parecidos', async () => {
    abrir('/documentos?q=contarto', 'usuario', { aproximada: true, coincidencia: 'parecido' });

    expect(await screen.findByText('No hay documentos con «contarto» tal cual. Estos se parecen: revisa si alguna palabra está mal escrita.')).toBeInTheDocument();
    expect(screen.getByText('Se parece')).toBeInTheDocument();
    expect(screen.getByLabelText('Ordenar por')).toHaveValue('relevancia');
  });

  it('un usuario filtra «los que subí yo» sin ver la lista de sus colegas; el administrador elige a la persona', async () => {
    const { enrutador, peticiones } = abrir('/documentos');
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByLabelText('Solo los que subí yo'));
    await waitFor(() => expect(parametrosDe(enrutador)).toEqual({ subidoPor: 'id-usuario' }));
    expect(screen.queryByLabelText('Subido por')).not.toBeInTheDocument();
    expect(peticiones.some((p) => p.ruta === '/usuarios')).toBe(false);
  });

  it('el administrador elige de una lista de su gente', async () => {
    const { enrutador } = abrir('/documentos', 'administrador');
    const usuario = userEvent.setup();

    const selector = await screen.findByLabelText('Subido por');
    await waitFor(() => expect(within(selector).getByRole('option', { name: 'Luis Quispe' })).toBeInTheDocument());
    await usuario.selectOptions(selector, 'id-luis');

    await waitFor(() => expect(parametrosDe(enrutador)).toEqual({ subidoPor: 'id-luis' }));
    expect(within(screen.getByLabelText('Filtros activos')).getByText('Luis Quispe')).toBeInTheDocument();
  });
});

describe('Atajos de fecha (D42)', () => {
  it('cuentan hasta hoy incluido, y el trimestre empieza en su primer mes', () => {
    expect(rangoDeAtajo('semana', '2026-10-10')).toEqual({ desde: '2026-10-04', hasta: '2026-10-10' });
    expect(rangoDeAtajo('mes', '2026-03-01')).toEqual({ desde: '2026-01-31', hasta: '2026-03-01' });
    expect(rangoDeAtajo('trimestre', '2026-10-10')).toEqual({ desde: '2026-10-01', hasta: '2026-10-10' });
    expect(rangoDeAtajo('trimestre', '2026-06-30')).toEqual({ desde: '2026-04-01', hasta: '2026-06-30' });
    expect(rangoDeAtajo('anio', '2026-10-10')).toEqual({ desde: '2026-01-01', hasta: '2026-10-10' });
  });

  it('reconocen el rango elegido, y no uno hecho a mano', () => {
    expect(atajoDelRango('2026-10-01', '2026-10-10', '2026-10-10')).toBe('trimestre');
    expect(atajoDelRango('2026-10-02', '2026-10-10', '2026-10-10')).toBeNull();
    expect(atajoDelRango(undefined, '2026-10-10', '2026-10-10')).toBeNull();
  });
});
