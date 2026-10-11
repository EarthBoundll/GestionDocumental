import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PeticionRecibida } from '../../pruebas/api-simulada';
import { guardarSesion, paginaVacia, sesionDe, simularApi } from '../../pruebas/api-simulada';
import { rutas } from '../../rutas';

const ADMIN = sesionDe('administrador');

const ASIENTOS = [
  {
    id: '2', accion: 'DOCUMENTO_DESCARGADO', empresa: null, usuario: { id: 'u1', nombre: 'Ana Torres', email: 'ana@ejemplo.pe' },
    rolUsuario: 'usuario', entidad: { tipo: 'documento', id: 'd1' }, detalle: { nombre: 'Factura 001', version: 1 },
    userAgent: null, esMovil: true, creadoEn: '2026-10-05T15:10:00Z',
  },
  {
    id: '1', accion: 'BUSQUEDA_REALIZADA', empresa: null, usuario: { id: 'u1', nombre: 'Ana Torres', email: 'ana@ejemplo.pe' },
    rolUsuario: 'usuario', entidad: null, detalle: { filtros: { q: 'factura' }, resultados: 3 },
    userAgent: null, esMovil: false, creadoEn: '2026-10-05T15:09:00Z',
  },
];

function abrir(ruta: string, { total = 2 } = {}) {
  guardarSesion(ADMIN);
  const api = simularApi({
    'GET /auth/yo': { cuerpo: { usuario: ADMIN.usuario, empresa: ADMIN.empresa } },
    'GET /notificaciones': { cuerpo: { ...paginaVacia, noLeidas: 0 } },
    'GET /usuarios': { cuerpo: { datos: [{ id: 'u1', nombre: 'Ana Torres' }], paginacion: { pagina: 1, porPagina: 100, total: 1 } } },
    'GET /historial': { cuerpo: { datos: ASIENTOS, paginacion: { pagina: 1, porPagina: 20, total } } },
    'GET /historial/impresion': { cuerpo: { datos: ASIENTOS, total: ASIENTOS.length } },
  });
  const enrutador = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(<RouterProvider router={enrutador} />);
  return { ...api, enrutador };
}

describe('Historial imprimible (RF36)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('«Imprimir» lleva todo lo filtrado a una tabla, sin la página, y la imprime con el diálogo del navegador', async () => {
    const imprimir = vi.fn();
    vi.stubGlobal('print', imprimir);
    const { peticiones, enrutador } = abrir('/admin/historial?usuarioId=u1&desde=2026-10-05&hasta=2026-10-05&pagina=2');

    await userEvent.click(await screen.findByRole('link', { name: 'Imprimir' }));

    await waitFor(() => expect(enrutador.state.location.pathname).toBe('/admin/historial/impresion'));
    expect(enrutador.state.location.search).toBe('?usuarioId=u1&desde=2026-10-05&hasta=2026-10-05');
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getAllByRole('row')).toHaveLength(3);
    expect(within(tabla).getByRole('row', { name: /Documento descargado/ })).toHaveTextContent('«Factura 001» · versión 1');
    expect(within(tabla).getByRole('row', { name: /Búsqueda/ })).toHaveTextContent('Computadora');
    expect(screen.getByRole('heading', { name: 'Textiles Andinos SAC' })).toBeInTheDocument();
    expect(await screen.findByText('Ana Torres', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('del 05/10/2026 al 05/10/2026')).toBeInTheDocument();
    expect(screen.getByText(/Revisado por/)).toBeInTheDocument();
    // El nombre que propone el navegador al guardar el PDF.
    expect(document.title).toBe('Historial de Textiles Andinos SAC, del 05/10/2026 al 05/10/2026');
    const pedida = peticiones.find((p: PeticionRecibida) => p.ruta === '/historial/impresion')!;
    expect(pedida.consulta.get('usuarioId')).toBe('u1');
    expect(pedida.consulta.has('pagina')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Imprimir o guardar como PDF' }));
    expect(imprimir).toHaveBeenCalledOnce();
  });

  it('con más de 2.000 acciones no se ofrece imprimir, y se dice cómo acotar', async () => {
    abrir('/admin/historial', { total: 2001 });

    expect(await screen.findByRole('button', { name: 'Imprimir' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Imprimir' })).not.toBeInTheDocument();
    expect(screen.getByText(/acota las fechas o la persona hasta 2,000 acciones/)).toBeInTheDocument();
  });
});

describe('Historial: lo importante primero (D46)', () => {
  it('por defecto pide lo importante; «Mostrar» cambia a la rutina y las acciones ofrecidas son las de ese grupo', async () => {
    const { peticiones } = abrir('/admin/historial');
    const usuario = userEvent.setup();

    await screen.findAllByText('Ana Torres');
    expect(peticiones.find((peticion) => peticion.ruta === '/historial')!.consulta.get('grupo')).toBe('importante');
    const acciones = () => within(screen.getByLabelText('Acción')).getAllByRole('option').map((opcion) => opcion.textContent);
    expect(acciones()).not.toContain('Inicio de sesión');

    await usuario.selectOptions(screen.getByLabelText('Mostrar'), 'rutina');
    await waitFor(() => expect(peticiones.findLast((peticion) => peticion.ruta === '/historial')!.consulta.get('grupo')).toBe('rutina'));
    expect(acciones()).toEqual(['Todas', 'Inicio de sesión', 'Cierre de sesión', 'Documento visto', 'Búsqueda']);
  });

  it('una cuenta eliminada sigue nombrada, con la marca de que ya no existe', async () => {
    guardarSesion(ADMIN);
    simularApi({
      'GET /auth/yo': { cuerpo: { usuario: ADMIN.usuario, empresa: ADMIN.empresa } },
      'GET /notificaciones': { cuerpo: { ...paginaVacia, noLeidas: 0 } },
      'GET /usuarios': { cuerpo: { ...paginaVacia } },
      'GET /historial': { cuerpo: { datos: [{ ...ASIENTOS[0], usuario: { id: 'u9', nombre: 'Pepe Ruiz', email: null } }], paginacion: { pagina: 1, porPagina: 20, total: 1 } } },
    });
    render(<RouterProvider router={createMemoryRouter(rutas, { initialEntries: ['/admin/historial'] })} />);

    const fila = (await screen.findByText('Pepe Ruiz')).closest('li')!;
    expect(within(fila).getByText('cuenta eliminada')).toBeInTheDocument();
  });
});
