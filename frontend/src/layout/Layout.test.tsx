import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Rol } from '../api/tipos';
import { rutas } from '../rutas';
import { CATEGORIAS, guardarSesion, paginaVacia, sesionDe, simularApi } from '../pruebas/api-simulada';

const METRICAS = { empresas: 0, empresasActivas: 0, usuarios: 0, usuariosActivos: 0, documentos: 0, almacenamientoBytes: 0, ultimoAcceso: null };

function abrirComo(rol: Rol, ruta: string, extra: Parameters<typeof simularApi>[0] = {}) {
  guardarSesion(sesionDe(rol));
  const api = simularApi({
    'GET /auth/yo': { cuerpo: { usuario: sesionDe(rol).usuario, empresa: sesionDe(rol).empresa } },
    'GET /notificaciones': { cuerpo: { ...paginaVacia, noLeidas: 0 } },
    'GET /documentos': { cuerpo: { ...paginaVacia, tiempoRespuestaId: null } },
    'GET /categorias': { cuerpo: CATEGORIAS },
    'GET /plataforma/metricas': { cuerpo: METRICAS },
    'GET /plataforma/empresas': { cuerpo: { datos: [] } },
    ...extra,
  });
  render(<RouterProvider router={createMemoryRouter(rutas, { initialEntries: [ruta] })} />);
  return api;
}

const enlacesDelMenu = () => within(screen.getAllByRole('navigation', { name: 'Principal' })[0]!).getAllByRole('link').map((enlace) => enlace.textContent);

describe('Marco común según el rol', () => {
  it('el Master solo ve la plataforma, sin documentos ni campana (decisión E)', async () => {
    const { peticiones } = abrirComo('master', '/plataforma');

    await screen.findByRole('heading', { name: 'Plataforma', level: 1 });
    expect(enlacesDelMenu()).toEqual(['Empresas', 'Auditoría', 'Respaldos']);
    expect(screen.queryByRole('button', { name: /Notificaciones/ })).not.toBeInTheDocument();
    // Su marco no pide notificaciones: la API le respondería 403 y lo registraría como acceso denegado.
    expect(peticiones.some((p) => p.ruta === '/notificaciones')).toBe(false);
  });

  it('el Master ve el espacio frente al límite gratuito y el último respaldo, sin ver el contenido de nadie', async () => {
    abrirComo('master', '/plataforma', {
      'GET /plataforma/metricas': { cuerpo: { ...METRICAS, almacenamientoBytes: 900 * 1024 ** 2 } },
      'GET /plataforma/respaldos': {
        cuerpo: {
          datos: [
            { nombre: 'respaldo-2026-10-04T08-00-00Z.json.gz', bytes: 2 * 1024 ** 2, creadoEn: '2026-10-04T08:00:01Z' },
            { nombre: 'respaldo-2026-10-03T08-00-00Z.json.gz', bytes: 2 * 1024 ** 2, creadoEn: '2026-10-03T08:00:01Z' },
          ],
          diasDeRetencion: 30,
        },
      },
    });

    const medidor = await screen.findByRole('meter', { name: 'Espacio de archivos usado' });
    // 900 MB de documentos y 4 MB de respaldos: el 88 % del GB gratuito, ya en zona de aviso.
    expect(medidor).toHaveAttribute('aria-valuenow', '88');
    expect(screen.getByText(/Conviene liberar espacio/)).toBeInTheDocument();
    expect(screen.getByText('04/10/2026 03:00')).toBeInTheDocument();
    expect(screen.getByText(/2 respaldos guardados/)).toBeInTheDocument();
  });

  it('si el depósito de respaldos no responde, el resumen del Master se muestra igual', async () => {
    abrirComo('master', '/plataforma', { 'GET /plataforma/respaldos': { estado: 503, cuerpo: { error: { codigo: 'ERROR', mensaje: 'No disponible' } } } });

    expect(await screen.findByText(/No se pudo consultar el depósito de respaldos/)).toBeInTheDocument();
    expect(screen.getByText(/los respaldos no se pudieron consultar/)).toBeInTheDocument();
  });

  it('cerrar sesión pide confirmación; al confirmar se despide, avisa a la API y el inicio de sesión lo confirma', async () => {
    // Un dispositivo sin «reducir movimiento»: la despedida se ve un instante antes de salir.
    vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: false, media: consulta, addEventListener() {}, removeEventListener() {} }));
    const { peticiones } = abrirComo('usuario', '/documentos', { 'POST /auth/logout': { estado: 204 } });
    const cierres = () => peticiones.filter((p) => p.ruta === '/auth/logout').length;

    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: '¿Cerrar sesión?' })).getByRole('button', { name: 'Cancelar' }));
    expect(cierres()).toBe(0);
    expect(screen.getByRole('heading', { name: 'Documentos', level: 1 })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, cerrar sesión' }));
    expect(screen.getByText('Cerrando sesión…')).toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('Cerraste tu sesión. Hasta pronto.')).toBeInTheDocument();
    expect(cierres()).toBe(1);
  });

  it('el usuario ve documentos y aprobaciones, pero no la administración', async () => {
    abrirComo('usuario', '/documentos');

    await screen.findByRole('heading', { name: 'Documentos', level: 1 });
    expect(enlacesDelMenu()).toEqual(['Buscar documentos', 'Subir documento', 'Solicitudes', 'Notificaciones']);
  });

  it('el administrador de empresa ve además usuarios, categorías e historial', async () => {
    abrirComo('administrador', '/documentos');

    await screen.findByRole('heading', { name: 'Documentos', level: 1 });
    expect(enlacesDelMenu()).toEqual(['Buscar documentos', 'Subir documento', 'Solicitudes', 'Notificaciones', 'Tablero', 'Usuarios', 'Categorías', 'Historial', 'Papelera', 'Identidad']);
  });

  it('si un usuario abre una pantalla de administración, la API decide y la pantalla lo explica (D8)', async () => {
    const { peticiones } = abrirComo('usuario', '/admin/usuarios', {
      'GET /usuarios': { estado: 403, cuerpo: { error: { codigo: 'SIN_PERMISO', mensaje: 'No tienes permiso' } } },
    });

    expect(await screen.findByText('No tienes permiso para ver esto')).toBeInTheDocument();
    expect(peticiones.filter((p) => p.ruta === '/usuarios')).toHaveLength(1);
  });

  it('la página que no existe ofrece volver a la portada del rol', async () => {
    abrirComo('master', '/no-existe');

    expect(await screen.findByRole('link', { name: 'Ir a la plataforma' })).toHaveAttribute('href', '/plataforma');
  });

  it('al marcar todas como leídas, la campana se actualiza sin cambiar de pantalla', async () => {
    let noLeidas = 2;
    abrirComo('usuario', '/notificaciones', {
      'GET /notificaciones': () => ({
        cuerpo: {
          datos: [{ id: 'n1', tipo: 'SOLICITUD_APROBADA', mensaje: 'Rosa aprobó «Factura»', leida: noLeidas === 0, creadaEn: '2026-10-02T15:00:00Z', solicitudId: 's1', documentoId: 'd1' }],
          paginacion: { pagina: 1, porPagina: 20, total: 1 },
          noLeidas,
        },
      }),
      'PATCH /notificaciones/leidas': () => {
        noLeidas = 0;
        return { estado: 204 };
      },
    });

    expect(await screen.findByRole('button', { name: 'Notificaciones: 2 sin leer' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar todas como leídas' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument());
  });
});
