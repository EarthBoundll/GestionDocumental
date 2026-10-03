import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { rutas } from '../rutas';
import { CATEGORIAS, guardarSesion, paginaVacia, sesionDe, simularApi } from '../pruebas/api-simulada';

function abrirEn(ruta: string) {
  const enrutador = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(<RouterProvider router={enrutador} />);
  return enrutador;
}

const API_DE_EMPRESA = {
  'GET /auth/yo': ({ token }: { token: string | null }) => ({ cuerpo: token === 'token-master' ? perfil('master') : perfil('usuario') }),
  'GET /notificaciones': { cuerpo: { ...paginaVacia, noLeidas: 0 } },
  'GET /categorias': { cuerpo: CATEGORIAS },
  'GET /documentos': { cuerpo: { ...paginaVacia, tiempoRespuestaId: null } },
};

function perfil(rol: 'master' | 'usuario') {
  const { usuario, empresa } = sesionDe(rol);
  return { usuario, empresa };
}

describe('Sesión y rutas', () => {
  it('sin sesión, cualquier pantalla lleva a iniciar sesión', async () => {
    simularApi({});
    const enrutador = abrirEn('/documentos');

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(enrutador.state.location.pathname).toBe('/login');
    expect(screen.queryByText(/Tu sesión terminó/)).not.toBeInTheDocument();
  });

  it('al recargar con una sesión guardada, las primeras peticiones ya llevan el token', async () => {
    // Regresión: el token se conectaba en un efecto del proveedor, que React ejecuta después de los de
    // las pantallas. En producción, las primeras peticiones salían sin token y recibían 401.
    guardarSesion(sesionDe('usuario'));
    const { peticiones } = simularApi(API_DE_EMPRESA);
    abrirEn('/documentos/nuevo');

    expect(await screen.findByRole('option', { name: 'Contratos' })).toBeInTheDocument();
    await waitFor(() => expect(peticiones.some((p) => p.ruta === '/notificaciones')).toBe(true));
    expect(peticiones.filter((p) => p.token !== 'token-usuario')).toEqual([]);
  });

  it('si la API deja de aceptar la sesión, vuelve a iniciar sesión con un aviso y olvida el token', async () => {
    guardarSesion(sesionDe('usuario'));
    simularApi({
      ...API_DE_EMPRESA,
      'GET /documentos': { estado: 401, cuerpo: { error: { codigo: 'NO_AUTENTICADO', mensaje: 'La sesión terminó' } } },
    });
    const enrutador = abrirEn('/documentos');

    expect(await screen.findByText('Tu sesión terminó. Vuelve a iniciar sesión para continuar.')).toBeInTheDocument();
    expect(enrutador.state.location.pathname).toBe('/login');
    expect(enrutador.state.location.search).toBe('?motivo=sesion');
    expect(localStorage.getItem('gestion-documental.sesion')).toBeNull();
  });

  it.each([
    ['master', '/plataforma', 'Plataforma'],
    ['usuario', '/documentos', 'Documentos'],
  ] as const)('al iniciar sesión, el %s llega a su portada (%s)', async (rol, portada, titulo) => {
    simularApi({
      ...API_DE_EMPRESA,
      'POST /auth/login': { cuerpo: sesionDe(rol) },
      'GET /plataforma/metricas': { cuerpo: { empresas: 0, empresasActivas: 0, usuarios: 0, usuariosActivos: 0, documentos: 0, almacenamientoBytes: 0, ultimoAcceso: null } },
      'GET /plataforma/empresas': { cuerpo: { datos: [] } },
    });
    const enrutador = abrirEn('/login');

    await userEvent.type(screen.getByLabelText('Correo'), `${rol}@ejemplo.pe`);
    await userEvent.type(screen.getByLabelText('Contraseña'), 'una-clave-cualquiera');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: titulo, level: 1 })).toBeInTheDocument();
    expect(enrutador.state.location.pathname).toBe(portada);
  });

  it('las credenciales erróneas se muestran sin salir de la pantalla', async () => {
    simularApi({
      'POST /auth/login': { estado: 401, cuerpo: { error: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Correo o contraseña incorrectos' } } },
    });
    abrirEn('/login');

    await userEvent.type(screen.getByLabelText('Correo'), 'ana@ejemplo.pe');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'equivocada');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos');
  });

  it('con la sesión abierta, iniciar sesión lleva a la portada del rol', async () => {
    guardarSesion(sesionDe('master'));
    simularApi({
      ...API_DE_EMPRESA,
      'GET /plataforma/metricas': { cuerpo: { empresas: 0, empresasActivas: 0, usuarios: 0, usuariosActivos: 0, documentos: 0, almacenamientoBytes: 0, ultimoAcceso: null } },
      'GET /plataforma/empresas': { cuerpo: { datos: [] } },
    });
    const enrutador = abrirEn('/login');

    await screen.findByRole('heading', { name: 'Plataforma', level: 1 });
    expect(enrutador.state.location.pathname).toBe('/plataforma');
  });
});
