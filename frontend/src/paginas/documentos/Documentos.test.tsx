import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
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

function abrir(ruta: string, extra: Parameters<typeof simularApi>[0] = {}, rol: 'usuario' | 'administrador' = 'usuario') {
  guardarSesion(sesionDe(rol));
  const api = simularApi({
    'GET /auth/yo': { cuerpo: { usuario: sesionDe(rol).usuario, empresa: sesionDe(rol).empresa } },
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
  it('el administrador exporta el listado documental con los filtros de la pantalla (RF35); un usuario no ve el botón', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:listado');
    URL.revokeObjectURL = vi.fn();
    const { peticiones } = abrir('/documentos?q=contrato&categoriaId=cat-contratos&orden=nombre&pagina=2', {
      'GET /documentos/exportar': {
        cuerpo: 'id,nombre', cabeceras: { 'Content-Disposition': 'attachment; filename="listado-documental-2026-10-07.csv"' },
      },
    }, 'administrador');

    await userEvent.click(await screen.findByRole('button', { name: 'Exportar listado' }));

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    const pedida = peticiones.find((p) => p.ruta === '/documentos/exportar')!;
    // Los filtros, sin la página ni el orden: el inventario sale entero y ordenado por categoría.
    expect(Object.fromEntries(pedida.consulta)).toEqual({ q: 'contrato', categoriaId: 'cat-contratos' });
  });

  it('un usuario no ve «Exportar listado»: el inventario es del administrador', async () => {
    abrir('/documentos');

    await screen.findByRole('link', { name: 'Contrato de alquiler del local' });
    expect(screen.queryByRole('button', { name: 'Exportar listado' })).not.toBeInTheDocument();
  });

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

  it('la ficha cuenta la actividad del documento, lo más reciente primero (RF30)', async () => {
    const { peticiones } = abrir('/documentos/doc-1', {
      'GET /documentos/:id': {
        cuerpo: {
          ...CONTRATO,
          descripcion: null,
          archivo: { ...CONTRATO.archivo, nombreOriginal: 'contrato.pdf' },
          actualizadoEn: CONTRATO.creadoEn,
          ultimaSolicitud: null,
          permisos: { editar: true, eliminar: true, solicitarAprobacion: true, resolverSolicitud: false },
        },
      },
      'GET /documentos/:id/actividad': {
        cuerpo: {
          datos: [
            { id: '3', accion: 'SOLICITUD_APROBADA', usuario: { id: 'id-admin', nombre: 'Rosa Quispe' }, rolUsuario: 'administrador', detalle: { comentario: 'Conforme' }, esMovil: true, creadoEn: '2026-10-03T15:00:00Z' },
            { id: '2', accion: 'DOCUMENTO_EDITADO', usuario: { id: 'id-usuario', nombre: 'Ana Torres' }, rolUsuario: 'usuario', detalle: { cambios: { nombre: {} } }, esMovil: false, creadoEn: '2026-10-02T15:00:00Z' },
            { id: '1', accion: 'DOCUMENTO_SUBIDO', usuario: { id: 'id-usuario', nombre: 'Ana Torres' }, rolUsuario: 'usuario', detalle: { nombre: 'Contrato' }, esMovil: false, creadoEn: '2026-10-02T14:35:16Z' },
          ],
          paginacion: { pagina: 1, porPagina: 10, total: 3 },
        },
      },
    });

    const lista = await screen.findByRole('list', { name: 'Actividad del documento' });
    const pasos = Array.from(lista.querySelectorAll('li')).map((paso) => paso.textContent);
    expect(pasos[0]).toContain('Rosa Quispe lo aprobó');
    expect(pasos[0]).toContain('«Conforme»');
    expect(pasos[0]).toContain('desde un celular');
    expect(pasos[1]).toContain('Ana Torres lo editó');
    expect(pasos[1]).toContain('cambió nombre');
    expect(pasos[2]).toContain('Ana Torres subió el documento');
    // Una persona sin el historial no ve quién lo consultó: la pantalla no se lo promete.
    expect(screen.queryByText(/quién lo vio/)).not.toBeInTheDocument();
    expect(peticiones.find((p) => p.ruta === '/documentos/doc-1/actividad')!.consulta.get('porPagina')).toBe('10');
    expect(screen.queryByRole('button', { name: /Ver más/ })).not.toBeInTheDocument();
    // La ruta lleva de vuelta al listado, o al listado de su categoría (RF10).
    const ruta = screen.getByRole('navigation', { name: 'Ruta' });
    expect(within(ruta).getByRole('link', { name: 'Documentos' })).toHaveAttribute('href', '/documentos');
    expect(within(ruta).getByRole('link', { name: 'Contratos' })).toHaveAttribute('href', '/documentos?categoriaId=cat-contratos');
    expect(within(ruta).getByText('Contrato de alquiler del local')).toHaveAttribute('aria-current', 'page');
  });

  describe('vista previa (RF33)', () => {
    const fichaCon = (tipoMime: string, nombreOriginal: string) => ({
      'GET /documentos/:id': {
        cuerpo: {
          ...CONTRATO,
          descripcion: null,
          archivo: { tipoMime, pesoBytes: 1000, nombreOriginal },
          actualizadoEn: CONTRATO.creadoEn,
          ultimaSolicitud: null,
          permisos: { editar: false, eliminar: false, solicitarAprobacion: false, resolverSolicitud: false },
        },
      },
      'GET /documentos/:id/actividad': { cuerpo: { datos: [], paginacion: { pagina: 1, porPagina: 10, total: 0 } } },
      'GET /documentos/:id/archivo': { cuerpo: { url: 'https://archivos.ejemplo/firmado?token=1', expiraEn: '2026-10-07T10:05:00Z' } },
      'GET /documentos/:id/versiones': { cuerpo: { datos: [] } },
    });
    const pidioElArchivo = (peticiones: PeticionRecibida[]) => peticiones.filter((p) => p.ruta === '/documentos/doc-1/archivo');

    it('una imagen se ve dentro de la ficha; pedirla queda registrada como vista, abrir la ficha no', async () => {
      const { peticiones } = abrir('/documentos/doc-1', fichaCon('image/png', 'plano.png'));

      const boton = await screen.findByRole('button', { name: 'Vista previa' });
      expect(pidioElArchivo(peticiones)).toHaveLength(0);
      await userEvent.click(boton);

      const imagen = await screen.findByRole('img', { name: 'Contrato de alquiler del local' });
      expect(imagen).toHaveAttribute('src', 'https://archivos.ejemplo/firmado?token=1');
      // El mismo enlace que «Ver»: la API lo registra como DOCUMENTO_VISUALIZADO (indicador 3).
      expect(pidioElArchivo(peticiones).map((p) => p.consulta.get('modo'))).toEqual(['ver']);
      expect(screen.getByRole('link', { name: /Abrir en otra pestaña/ })).toHaveAttribute('href', 'https://archivos.ejemplo/firmado?token=1');

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar la vista previa' }));
      expect(screen.queryByRole('img', { name: 'Contrato de alquiler del local' })).not.toBeInTheDocument();
    });

    it('un PDF se incrusta si el navegador tiene visor', async () => {
      vi.stubGlobal('navigator', { ...navigator, pdfViewerEnabled: true });
      abrir('/documentos/doc-1', fichaCon('application/pdf', 'contrato.pdf'));

      await userEvent.click(await screen.findByRole('button', { name: 'Vista previa' }));

      expect(await screen.findByTitle('Vista previa de Contrato de alquiler del local')).toHaveAttribute('src', 'https://archivos.ejemplo/firmado?token=1');
    });

    it('sin visor de PDF (Chrome en Android) o con Word, solo queda «Ver»', async () => {
      vi.stubGlobal('navigator', { ...navigator, pdfViewerEnabled: false });
      abrir('/documentos/doc-1', fichaCon('application/pdf', 'contrato.pdf'));

      expect(await screen.findByRole('button', { name: 'Ver' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Vista previa' })).not.toBeInTheDocument();
    });

    it('un Word no tiene vista previa', async () => {
      abrir('/documentos/doc-1', fichaCon('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'acta.docx'));

      expect(await screen.findByRole('button', { name: 'Ver' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Vista previa' })).not.toBeInTheDocument();
    });
  });

  describe('versiones (RF34)', () => {
    const VERSIONES = [
      { numero: 2, archivo: { nombreOriginal: 'contrato-v2.pdf', tipoMime: 'application/pdf', pesoBytes: 2048 }, subidaPor: { id: 'id-usuario', nombre: 'Ana Torres' }, comentario: 'Corrige la cláusula 4', restauradaDe: null, creadaEn: '2026-10-05T10:00:00Z', vigente: true },
      { numero: 1, archivo: { nombreOriginal: 'contrato-v1.pdf', tipoMime: 'application/pdf', pesoBytes: 1024 }, subidaPor: { id: 'id-usuario', nombre: 'Ana Torres' }, comentario: null, restauradaDe: null, creadaEn: '2026-10-02T14:35:16Z', vigente: false },
    ];
    const ficha = (cambios: Record<string, unknown> = {}) => ({
      ...CONTRATO,
      descripcion: null,
      archivo: { ...CONTRATO.archivo, nombreOriginal: 'contrato-v2.pdf' },
      version: 2,
      actualizadoEn: CONTRATO.creadoEn,
      ultimaSolicitud: null,
      permisos: { editar: true, eliminar: true, solicitarAprobacion: true, resolverSolicitud: false, versionar: true },
      ...cambios,
    });
    const rutasBase = (documento = ficha()) => ({
      'GET /documentos/:id': { cuerpo: documento },
      'GET /documentos/:id/actividad': { cuerpo: { datos: [], paginacion: { pagina: 1, porPagina: 10, total: 0 } } },
      'GET /documentos/:id/versiones': { cuerpo: { datos: VERSIONES } },
    });

    it('lista las versiones, la vigente marcada, y una anterior se descarga con su número', async () => {
      const { peticiones } = abrir('/documentos/doc-1', {
        ...rutasBase(),
        'GET /documentos/:id/archivo': { cuerpo: { url: 'https://archivos.ejemplo/v1', expiraEn: '2026-10-07T10:05:00Z' } },
      });
      const asignar = vi.fn();
      vi.stubGlobal('location', { ...window.location, assign: asignar });

      const lista = await screen.findByRole('list', { name: 'Versiones del documento' });
      const filas = within(lista).getAllByRole('listitem');
      expect(filas[0]).toHaveTextContent('Versión 2Vigente');
      expect(filas[0]).toHaveTextContent('«Corrige la cláusula 4»');
      await userEvent.click(within(lista).getByRole('button', { name: 'Descargar la versión 1' }));

      await waitFor(() => expect(asignar).toHaveBeenCalledWith('https://archivos.ejemplo/v1'));
      const pedido = peticiones.find((p) => p.ruta === '/documentos/doc-1/archivo')!;
      expect([pedido.consulta.get('modo'), pedido.consulta.get('version')]).toEqual(['descargar', '1']);
    });

    it('subir una versión envía el archivo y qué cambió, y la ficha muestra la nueva', async () => {
      const { peticiones } = abrir('/documentos/doc-1', {
        ...rutasBase(),
        'POST /documentos/:id/versiones': { estado: 201, cuerpo: ficha({ version: 3 }) },
      });

      await userEvent.click(await screen.findByRole('button', { name: 'Subir versión nueva' }));
      const dialogo = screen.getByRole('dialog');
      await userEvent.upload(within(dialogo).getByLabelText('Archivo'), new File(['%PDF-1.4'], 'contrato-v3.pdf', { type: 'application/pdf' }));
      await userEvent.type(within(dialogo).getByLabelText(/Qué cambió/), 'Firma del arrendador');
      await userEvent.click(within(dialogo).getByRole('button', { name: 'Subir versión 3' }));

      expect(await screen.findByText(/Se subió la versión 3/)).toBeInTheDocument();
      const envio = peticiones.find((p) => p.metodo === 'POST')!.cuerpo as FormData;
      expect((envio.get('archivo') as File).name).toBe('contrato-v3.pdf');
      expect(envio.get('comentario')).toBe('Firma del arrendador');
    });

    it('restaurar pide la versión elegida; con una aprobación pendiente no se puede, y una aprobada en otra versión no cubre la vigente', async () => {
      const { peticiones } = abrir('/documentos/doc-1', {
        ...rutasBase(ficha({
          ultimaSolicitud: { id: 's1', estado: 'aprobada', version: 1, solicitante: { id: 'id-usuario', nombre: 'Ana Torres' }, revisor: { id: 'id-admin', nombre: 'Rosa Quispe' }, comentarioSolicitud: null, comentarioResolucion: null, creadaEn: '2026-10-03T10:00:00Z', resueltaEn: '2026-10-03T11:00:00Z' },
        })),
        'POST /documentos/:id/versiones/:numero/restauracion': { estado: 201, cuerpo: ficha({ version: 3 }) },
      });

      expect(await screen.findByText('Versión 2 sin revisar')).toBeInTheDocument();
      expect(screen.getByText(/Esta solicitud fue sobre la versión 1/)).toBeInTheDocument();
      await userEvent.click(await screen.findByRole('button', { name: 'Restaurar la versión 1' }));

      expect(await screen.findByText(/La versión 1 se restauró como versión 3/)).toBeInTheDocument();
      expect(peticiones.find((p) => p.metodo === 'POST')!.ruta).toBe('/documentos/doc-1/versiones/1/restauracion');
    });

    it('sin permiso para versionar, solo se ven y descargan', async () => {
      abrir('/documentos/doc-1', rutasBase(ficha({ permisos: { editar: false, eliminar: false, solicitarAprobacion: false, resolverSolicitud: false, versionar: false } })));

      await screen.findByRole('list', { name: 'Versiones del documento' });
      expect(screen.queryByRole('button', { name: 'Subir versión nueva' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Restaurar/ })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ver la versión 1' })).toBeInTheDocument();
    });
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
