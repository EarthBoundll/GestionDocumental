import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guardarSesion, paginaVacia, sesionDe, simularApi } from '../../pruebas/api-simulada';
import { rutas } from '../../rutas';

function abrir(ruta: string) {
  simularApi({
    'GET /auth/yo': { cuerpo: { usuario: sesionDe('usuario').usuario, empresa: sesionDe('usuario').empresa } },
    'GET /notificaciones': { cuerpo: { ...paginaVacia, noLeidas: 0 } },
  });
  render(<RouterProvider router={createMemoryRouter(rutas, { initialEntries: [ruta] })} />);
}

describe('Contacto, términos y privacidad (D38)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('el inicio de sesión enlaza los términos y la privacidad; sin contacto configurado no ofrece pedir una cuenta', async () => {
    abrir('/login');

    const legal = await screen.findByRole('navigation', { name: 'Información legal' });
    expect(within(legal).getByRole('link', { name: 'Términos de uso' })).toHaveAttribute('href', '/terminos');
    expect(within(legal).getByRole('link', { name: 'Privacidad' })).toHaveAttribute('href', '/privacidad');
    expect(screen.queryByRole('link', { name: 'Solicita una cuenta' })).not.toBeInTheDocument();
    expect(within(legal).queryByRole('link', { name: 'Contacto' })).not.toBeInTheDocument();
  });

  it('con el contacto configurado, pedir una cuenta abre un correo ya redactado y, si hay WhatsApp, un mensaje', async () => {
    vi.stubEnv('VITE_CONTACTO_EMAIL', 'contacto@ejemplo.pe');
    vi.stubEnv('VITE_CONTACTO_WHATSAPP', '+51 987 654 321');
    abrir('/login');

    const correo = new URL((await screen.findByRole('link', { name: 'Solicita una cuenta' })).getAttribute('href')!);
    expect(correo.protocol).toBe('mailto:');
    expect(correo.pathname).toBe('contacto@ejemplo.pe');
    expect(correo.searchParams.get('subject')).toBe('Solicitud de cuenta para mi empresa');
    expect(correo.searchParams.get('body')).toContain('Nombre de quien la administrará:');
    expect(screen.getByRole('link', { name: 'escríbenos por WhatsApp' }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/51987654321\?text=/);
    expect(screen.getByRole('link', { name: 'Contacto' })).toHaveAttribute('href', 'mailto:contacto@ejemplo.pe');
  });

  it('los términos y la privacidad se leen sin sesión y con sesión, y nombran el contacto para ejercer los derechos', async () => {
    vi.stubEnv('VITE_CONTACTO_EMAIL', 'contacto@ejemplo.pe');
    abrir('/privacidad');
    expect(await screen.findByRole('heading', { name: 'Política de privacidad', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/transferencia internacional de datos/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'contacto@ejemplo.pe' }).length).toBeGreaterThan(0);

    guardarSesion(sesionDe('usuario'));
    abrir('/terminos');
    expect(await screen.findByRole('heading', { name: 'Términos de uso', level: 1 })).toBeInTheDocument();
  });
});
