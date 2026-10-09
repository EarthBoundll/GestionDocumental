import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Cargando } from '../../componentes/Avisos';
import { rutas } from '../../rutas';
import { simularApi } from '../../pruebas/api-simulada';

function abrirElAcceso() {
  simularApi({});
  render(<RouterProvider router={createMemoryRouter(rutas, { initialEntries: ['/login'] })} />);
}

describe('El acceso, con movimiento y sin confundir a un lector de pantalla (D40)', () => {
  it('el titular que cambia de palabra se lee como una sola frase quieta; lo decorativo queda oculto', async () => {
    abrirElAcceso();

    await screen.findByRole('heading', { name: 'Iniciar sesión' });
    expect(screen.getByText('Los documentos de tu empresa, en orden y a la mano')).toHaveClass('sr-only');
    // Las palabras que rotan, los halos y las tarjetas de muestra no se anuncian: son adorno.
    for (const adorno of ['palabras-que-rotan', 'aurora', 'tarjetas-de-muestra']) {
      expect(screen.getByTestId(adorno).closest('[aria-hidden="true"]')).not.toBeNull();
    }
    // Las tarjetas de muestra no son botones ni enlaces: no se puede llegar a ellas con el teclado.
    expect(within(screen.getByTestId('tarjetas-de-muestra')).queryAllByRole('button', { hidden: true })).toHaveLength(0);
  });

  it('la contraseña se puede mostrar y volver a ocultar con el ojo, sin cambiar el nombre del botón', async () => {
    abrirElAcceso();
    const usuario = userEvent.setup();

    const clave = await screen.findByLabelText('Contraseña');
    await usuario.type(clave, 'una-clave-larga');
    const ojo = screen.getByRole('button', { name: 'Mostrar la contraseña' });
    expect(clave).toHaveAttribute('type', 'password');
    expect(ojo).toHaveAttribute('aria-pressed', 'false');

    await usuario.click(ojo);
    expect(clave).toHaveAttribute('type', 'text');
    expect(clave).toHaveValue('una-clave-larga');
    expect(ojo).toHaveAttribute('aria-pressed', 'true');

    await usuario.click(ojo);
    expect(clave).toHaveAttribute('type', 'password');
    // El correo no tiene ojo: solo las contraseñas.
    expect(screen.getAllByRole('button', { name: 'Mostrar la contraseña' })).toHaveLength(1);
  });

  it('mientras algo carga se ve su forma; el lector de pantalla oye qué se está cargando', () => {
    const { rerender } = render(<Cargando />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
    expect(screen.getByText('Cargando…')).toHaveClass('sr-only');

    // Un texto propio dice algo más que «cargando»: también se ve.
    rerender(<Cargando texto="Buscando documentos…" />);
    expect(screen.getByText('Buscando documentos…')).not.toHaveClass('sr-only');
  });
});
