import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Marca, Rol, SesionIniciada } from '../../api/tipos';
import { rutas } from '../../rutas';
import { guardarSesion, paginaVacia, sesionDe, simularApi } from '../../pruebas/api-simulada';
import { contrasteConBlanco, esColorHex } from '../../utilidades/color';

const raiz = document.documentElement;
const SIN_MARCA: Marca = { nombreComercial: null, colorPrimario: null, logoUrl: null };
const METRICAS = { usuarios: 3, usuariosActivos: 3, documentos: 0, almacenamientoBytes: 0, ultimoAcceso: null };

function sesionCon(rol: Rol, cambios: { tema?: SesionIniciada['usuario']['tema']; marca?: Marca } = {}): SesionIniciada {
  const sesion = sesionDe(rol);
  return {
    ...sesion,
    usuario: { ...sesion.usuario, tema: cambios.tema ?? 'sistema' },
    empresa: sesion.empresa && { ...sesion.empresa, marca: cambios.marca ?? SIN_MARCA },
  };
}

function abrir(sesion: SesionIniciada, ruta: string, extra: Parameters<typeof simularApi>[0] = {}) {
  guardarSesion(sesion);
  const api = simularApi({
    'GET /auth/yo': { cuerpo: { usuario: sesion.usuario, empresa: sesion.empresa } },
    'GET /notificaciones': { cuerpo: { ...paginaVacia, noLeidas: 0 } },
    ...extra,
  });
  render(<RouterProvider router={createMemoryRouter(rutas, { initialEntries: [ruta] })} />);
  return api;
}

/** jsdom no trae matchMedia: se simula un dispositivo en modo claro u oscuro, que puede cambiar. */
function dispositivoEnModo(oscuro: boolean) {
  const oyentes = new Set<() => void>();
  const consulta = {
    get matches() { return oscuro; },
    addEventListener: (_: string, oyente: () => void) => oyentes.add(oyente),
    removeEventListener: (_: string, oyente: () => void) => oyentes.delete(oyente),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => consulta));
  return {
    cambiarA(nuevo: boolean) {
      oscuro = nuevo;
      oyentes.forEach((oyente) => oyente());
    },
  };
}

describe('Contraste del color de marca', () => {
  it('mide como WCAG 2.1 y solo acepta #rrggbb', () => {
    expect(contrasteConBlanco('#000000')).toBeCloseTo(21, 5);
    expect(contrasteConBlanco('#ffffff')).toBeCloseTo(1, 5);
    expect(contrasteConBlanco('#0f766e')).toBeCloseTo(5.47, 2);
    expect(esColorHex('#0F766e')).toBe(true);
    expect(esColorHex('0f766e')).toBe(false);
    expect(esColorHex('#fff')).toBe(false);
  });
});

describe('Tema de cada persona (RF32)', () => {
  it('«del dispositivo» sigue al dispositivo, también si cambia con la sesión abierta', async () => {
    const dispositivo = dispositivoEnModo(true);
    abrir(sesionCon('usuario'), '/cuenta');

    await screen.findByRole('heading', { name: 'Mi cuenta' });
    expect(raiz.dataset.tema).toBe('oscuro');
    dispositivo.cambiarA(false);
    expect(raiz.dataset.tema).toBe('claro');
  });

  it('el elegido en la cuenta manda sobre el del dispositivo', async () => {
    dispositivoEnModo(false);
    abrir(sesionCon('usuario', { tema: 'oscuro' }), '/cuenta');

    await screen.findByRole('heading', { name: 'Mi cuenta' });
    expect(raiz.dataset.tema).toBe('oscuro');
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toBeChecked();
  });

  it('elegir un tema se ve al instante y se guarda en la cuenta', async () => {
    dispositivoEnModo(false);
    const { peticiones } = abrir(sesionCon('usuario'), '/cuenta', { 'PUT /auth/preferencias': { cuerpo: { tema: 'oscuro' } } });

    await userEvent.click(await screen.findByRole('radio', { name: 'Oscuro' }));

    expect(raiz.dataset.tema).toBe('oscuro');
    await waitFor(() => expect(peticiones.find((p) => p.ruta === '/auth/preferencias')?.cuerpo).toEqual({ tema: 'oscuro' }));
    // Y queda en la sesión guardada: al recargar, la primera pantalla ya sale en oscuro.
    expect(JSON.parse(localStorage.getItem('gestion-documental.sesion')!).usuario.tema).toBe('oscuro');
  });

  it('si la API no lo guarda, vuelve el anterior y lo dice', async () => {
    dispositivoEnModo(false);
    abrir(sesionCon('usuario', { tema: 'claro' }), '/cuenta', {
      'PUT /auth/preferencias': { estado: 503, cuerpo: { error: { codigo: 'ERROR', mensaje: 'Servicio no disponible' } } },
    });

    await userEvent.click(await screen.findByRole('radio', { name: 'Oscuro' }));

    expect(await screen.findByText(/No se pudo guardar el tema/)).toBeInTheDocument();
    expect(raiz.dataset.tema).toBe('claro');
    expect(screen.getByRole('radio', { name: 'Claro' })).toBeChecked();
  });

  it('una sesión guardada antes de esta versión, sin tema ni marca, sigue funcionando', async () => {
    dispositivoEnModo(false);
    const antigua = sesionDe('usuario') as unknown as { usuario: Record<string, unknown>; empresa: Record<string, unknown> };
    delete antigua.usuario.tema;
    delete antigua.empresa.marca;
    guardarSesion(antigua as unknown as SesionIniciada);
    simularApi({ 'GET /auth/yo': { estado: 503, cuerpo: { error: { codigo: 'ERROR', mensaje: 'No disponible' } } }, 'GET /notificaciones': { cuerpo: { ...paginaVacia, noLeidas: 0 } } });
    render(<RouterProvider router={createMemoryRouter(rutas, { initialEntries: ['/cuenta'] })} />);

    expect(await screen.findByRole('radio', { name: 'Del dispositivo' })).toBeChecked();
    expect(raiz.dataset.tema).toBe('claro');
  });
});

describe('Identidad de la empresa (RF31)', () => {
  const MARCA_GUARDADA: Marca = { nombreComercial: 'Textiles Andinos', colorPrimario: '#1d4ed8', logoUrl: 'https://archivos.ejemplo/logo.png?firma=1' };

  it('todos los de la empresa ven su color, su nombre comercial y su logo; al cerrar sesión vuelve el de la plataforma', async () => {
    dispositivoEnModo(false);
    abrir(sesionCon('usuario', { marca: MARCA_GUARDADA }), '/cuenta', { 'POST /auth/logout': { estado: 204 } });

    await screen.findByRole('heading', { name: 'Mi cuenta' });
    expect(raiz.style.getPropertyValue('--marca')).toBe('#1d4ed8');
    const menu = screen.getAllByRole('link', { name: /Textiles Andinos$/ })[0]!;
    expect(within(menu).getAllByRole('presentation')[0]).toHaveAttribute('src', MARCA_GUARDADA.logoUrl);

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, cerrar sesión' }));
    await screen.findByRole('heading', { name: 'Iniciar sesión' });
    expect(raiz.style.getPropertyValue('--marca')).toBe('');
  });

  it('si el enlace del logo ya no sirve, vuelve el icono en lugar de una imagen rota', async () => {
    dispositivoEnModo(false);
    abrir(sesionCon('usuario', { marca: MARCA_GUARDADA }), '/cuenta');

    const menu = (await screen.findAllByRole('link', { name: /Textiles Andinos$/ }))[0]!;
    within(menu).getAllByRole('presentation')[0]!.dispatchEvent(new Event('error'));

    await waitFor(() => expect(within(menu).getAllByRole('presentation')[0]).toHaveAttribute('src', '/icono.svg'));
  });

  it('un usuario no puede entrar a la pantalla de identidad', async () => {
    dispositivoEnModo(false);
    const { peticiones } = abrir(sesionCon('usuario'), '/admin/identidad');

    expect(await screen.findByText('No tienes permiso para ver esto')).toBeInTheDocument();
    expect(peticiones.some((p) => p.ruta === '/empresa/identidad')).toBe(false);
  });

  it('el administrador ve el color mientras lo elige, el sistema rechaza uno ilegible y guarda uno válido', async () => {
    dispositivoEnModo(false);
    const { peticiones } = abrir(sesionCon('administrador'), '/admin/identidad', {
      'GET /empresa/identidad': { cuerpo: SIN_MARCA },
      'PATCH /empresa/identidad': ({ cuerpo }) => ({ cuerpo: { ...SIN_MARCA, ...(cuerpo as object) } }),
    });
    const usuario = userEvent.setup();

    const color = await screen.findByRole('textbox', { name: /Color principal/ });
    await usuario.type(color, '#fde047');
    expect(await screen.findByText(/Con texto blanco encima se lee mal/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    expect(raiz.style.getPropertyValue('--marca')).toBe('');

    await usuario.clear(color);
    await usuario.type(color, '#7E22CE');
    // Toda la pantalla lo muestra antes de guardar.
    expect(raiz.style.getPropertyValue('--marca')).toBe('#7e22ce');
    await usuario.type(screen.getByRole('textbox', { name: /Nombre comercial/ }), 'Andinos');
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(/Identidad guardada/)).toBeInTheDocument();
    expect(peticiones.find((p) => p.metodo === 'PATCH')?.cuerpo).toEqual({ nombreComercial: 'Andinos', colorPrimario: '#7e22ce' });
    // El menú ya usa el nombre comercial, y el color queda como el de la sesión.
    expect(screen.getAllByText('Andinos').length).toBeGreaterThan(0);
    expect(raiz.style.getPropertyValue('--marca')).toBe('#7e22ce');
  });

  it('si sale sin guardar, vuelve el color que estaba', async () => {
    dispositivoEnModo(false);
    abrir(sesionCon('administrador', { marca: { ...SIN_MARCA, colorPrimario: '#1d4ed8' } }), '/admin/identidad', {
      'GET /empresa/identidad': { cuerpo: { ...SIN_MARCA, colorPrimario: '#1d4ed8' } },
      'GET /tablero': { estado: 503, cuerpo: { error: { codigo: 'ERROR', mensaje: 'No disponible' } } },
    });
    const usuario = userEvent.setup();

    const color = await screen.findByRole('textbox', { name: /Color principal/ });
    await usuario.clear(color);
    await usuario.type(color, '#b91c1c');
    expect(raiz.style.getPropertyValue('--marca')).toBe('#b91c1c');

    await usuario.click(screen.getAllByRole('link', { name: 'Tablero' })[0]!);
    await screen.findByRole('heading', { name: 'Tablero' });
    expect(raiz.style.getPropertyValue('--marca')).toBe('#1d4ed8');
  });

  it('el logo se comprueba antes de subirlo y se sube como archivo', async () => {
    dispositivoEnModo(false);
    const { peticiones } = abrir(sesionCon('administrador'), '/admin/identidad', {
      'GET /empresa/identidad': { cuerpo: SIN_MARCA },
      'PUT /empresa/identidad/logo': { cuerpo: { ...SIN_MARCA, logoUrl: 'https://archivos.ejemplo/nuevo.png?firma=2' } },
    });
    const usuario = userEvent.setup({ applyAccept: false });
    const entrada = await screen.findByLabelText('Archivo del logo');

    await usuario.upload(entrada, new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));
    expect(await screen.findByText('El logo debe ser una imagen PNG o JPG')).toBeInTheDocument();
    await usuario.upload(entrada, new File([new Uint8Array(300 * 1024)], 'logo.png', { type: 'image/png' }));
    expect(await screen.findByText('El logo supera los 256 KB')).toBeInTheDocument();
    expect(peticiones.some((p) => p.ruta === '/empresa/identidad/logo')).toBe(false);

    await usuario.upload(entrada, new File([new Uint8Array(1024)], 'logo.png', { type: 'image/png' }));
    expect(await screen.findByText('Logo actualizado.')).toBeInTheDocument();
    const subida = peticiones.find((p) => p.ruta === '/empresa/identidad/logo')!;
    expect((subida.cuerpo as FormData).get('archivo')).toBeInstanceOf(File);
    expect(screen.getByRole('img', { name: /Logo de/ })).toHaveAttribute('src', 'https://archivos.ejemplo/nuevo.png?firma=2');
  });

  it('el Master cambia la identidad de una empresa desde su ficha, sin tocar la suya', async () => {
    dispositivoEnModo(false);
    const { peticiones } = abrir(sesionCon('master'), '/plataforma/empresas/empresa-b', {
      'GET /plataforma/empresas/:id': {
        cuerpo: { id: 'empresa-b', nombre: 'Estudio Contable Lima SAC', ruc: null, activa: true, creadoEn: '2026-09-01T10:00:00Z', metricas: METRICAS, administradores: [], marca: SIN_MARCA },
      },
      'PATCH /plataforma/empresas/:id/identidad': ({ cuerpo }) => ({ cuerpo: { ...SIN_MARCA, ...(cuerpo as object) } }),
    });
    const usuario = userEvent.setup();

    const nombre = await screen.findByRole('textbox', { name: /Nombre comercial/ });
    expect(nombre).toHaveAttribute('placeholder', 'Estudio Contable Lima SAC');
    await usuario.type(nombre, 'Contadores Lima');
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(/Identidad guardada/)).toBeInTheDocument();
    const cambio = peticiones.find((p) => p.metodo === 'PATCH')!;
    expect(cambio.ruta).toBe('/plataforma/empresas/empresa-b/identidad');
    expect(cambio.cuerpo).toEqual({ nombreComercial: 'Contadores Lima', colorPrimario: '' });
    expect(screen.getAllByText('Administración de la plataforma').length).toBeGreaterThan(0);
  });
});
