import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { simularApi } from '../../pruebas/api-simulada';
import { rutas } from '../../rutas';

const TOKEN = 'T'.repeat(43);

/** Abre un enlace del correo tal como llega: la ruta y el token tras el «#». */
function abrirEnlace(ruta: string, token: string | null, api: Parameters<typeof simularApi>[0] = {}) {
  window.history.replaceState(null, '', token ? `${ruta}#${token}` : ruta);
  const simulada = simularApi(api);
  render(<RouterProvider router={createMemoryRouter(rutas, { initialEntries: [ruta] })} />);
  return simulada;
}

describe('Activar la cuenta con la invitación (D41)', () => {
  it('lee el token del enlace, lo quita de la barra de direcciones y lo envía con la contraseña elegida', async () => {
    const { peticiones } = abrirEnlace('/activar-cuenta', TOKEN, {
      'POST /auth/activacion': { cuerpo: { email: 'ana@ejemplo.pe' } },
      'POST /auth/login': { estado: 401, cuerpo: { error: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Correo o contraseña incorrectos' } } },
    });
    const usuario = userEvent.setup();

    await screen.findByRole('heading', { name: 'Activa tu cuenta' });
    expect(window.location.hash).toBe('');
    await usuario.type(screen.getByLabelText('Contraseña nueva'), 'mi-clave-propia-1');
    await usuario.type(screen.getByLabelText('Repite la contraseña nueva'), 'mi-clave-propia-1');
    await usuario.click(screen.getByRole('button', { name: 'Activar mi cuenta' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Tu cuenta está activa y tu correo quedó confirmado');
    expect(peticiones.find((p) => p.ruta === '/auth/activacion')?.cuerpo).toEqual({ token: TOKEN, claveNueva: 'mi-clave-propia-1' });
    // Al ir a entrar, el correo ya está escrito: solo falta la contraseña.
    await usuario.click(screen.getByRole('link', { name: 'Iniciar sesión' }));
    expect(await screen.findByLabelText('Correo')).toHaveValue('ana@ejemplo.pe');
  });

  it('si las contraseñas no coinciden no gasta el enlace', async () => {
    const { peticiones } = abrirEnlace('/activar-cuenta', TOKEN);
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText('Contraseña nueva'), 'mi-clave-propia-1');
    await usuario.type(screen.getByLabelText('Repite la contraseña nueva'), 'otra-clave-1');
    await usuario.click(screen.getByRole('button', { name: 'Activar mi cuenta' }));

    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
    expect(peticiones.filter((p) => p.ruta === '/auth/activacion')).toHaveLength(0);
  });

  it('un enlace caducado o ya usado dice cómo pedir otro', async () => {
    abrirEnlace('/activar-cuenta', TOKEN, {
      'POST /auth/activacion': { estado: 400, cuerpo: { error: { codigo: 'ENLACE_INVALIDO', mensaje: 'El enlace no es válido, ya se usó o caducó.' } } },
    });
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText('Contraseña nueva'), 'mi-clave-propia-1');
    await usuario.type(screen.getByLabelText('Repite la contraseña nueva'), 'mi-clave-propia-1');
    await usuario.click(screen.getByRole('button', { name: 'Activar mi cuenta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El enlace no es válido, ya se usó o caducó.');
    expect(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute('href', '/recuperar-clave');
    expect(screen.queryByLabelText('Contraseña nueva')).not.toBeInTheDocument();
  });

  it('un enlace sin token ni siquiera muestra el formulario', async () => {
    abrirEnlace('/activar-cuenta', null);

    expect(await screen.findByRole('alert')).toHaveTextContent('El enlace está incompleto');
  });
});

describe('Confirmar el correo de una cuenta con contraseña (D41)', () => {
  it('no se confirma al abrir la página, sino con el botón: un filtro de correo que abra el enlace no lo gasta', async () => {
    const { peticiones } = abrirEnlace('/verificar-correo', TOKEN, { 'POST /auth/verificacion': { cuerpo: { email: 'ana@ejemplo.pe' } } });
    const usuario = userEvent.setup();

    const boton = await screen.findByRole('button', { name: 'Confirmar mi correo' });
    expect(peticiones.filter((p) => p.ruta === '/auth/verificacion')).toHaveLength(0);
    await usuario.click(boton);

    expect(await screen.findByRole('status')).toHaveTextContent('tu correo quedó confirmado');
    expect(peticiones.find((p) => p.ruta === '/auth/verificacion')?.cuerpo).toEqual({ token: TOKEN });
  });
});

describe('Iniciar sesión sin el correo confirmado (D41)', () => {
  it('lo dice como un paso pendiente, no como un error de contraseña', async () => {
    abrirEnlace('/login', null, {
      'POST /auth/login': {
        estado: 403,
        cuerpo: { error: { codigo: 'CORREO_SIN_VERIFICAR', mensaje: 'Antes de entrar, confirma que este correo es tuyo: te enviamos un enlace.' } },
      },
    });
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText('Correo'), 'ana@ejemplo.pe');
    await usuario.type(screen.getByLabelText('Contraseña'), 'mi-clave-propia-1');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('te enviamos un enlace');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
