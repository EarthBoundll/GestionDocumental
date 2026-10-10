import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { Usuario } from '../../api/tipos';
import { guardarSesion, paginaVacia, sesionDe, simularApi } from '../../pruebas/api-simulada';
import { rutas } from '../../rutas';

const ADMIN = sesionDe('administrador');
const persona = (id: string, nombre: string, cambios: Partial<Usuario> = {}): Usuario => ({
  id, nombre, email: `${id}@ejemplo.pe`, rol: 'usuario', dni: null, activo: true, estado: 'verificado', creadoEn: '2026-10-01T15:00:00Z', ...cambios,
});
const LISTA = [
  persona('ana', 'Ana Torres'),
  persona('luis', 'Luis Quispe', { estado: 'pendiente' }),
  persona('rosa', 'Rosa Díaz', { estado: 'sin_verificar' }),
  persona('jorge', 'Jorge Ramos', { estado: 'pendiente', activo: false }),
];

function abrirUsuarios(rutasExtra: Parameters<typeof simularApi>[0] = {}) {
  guardarSesion(ADMIN);
  const api = simularApi({
    'GET /auth/yo': { cuerpo: { usuario: ADMIN.usuario, empresa: ADMIN.empresa } },
    'GET /notificaciones': { cuerpo: { ...paginaVacia, noLeidas: 0 } },
    'GET /usuarios': { cuerpo: { datos: LISTA, paginacion: { pagina: 1, porPagina: 20, total: LISTA.length } } },
    ...rutasExtra,
  });
  render(<RouterProvider router={createMemoryRouter(rutas, { initialEntries: ['/admin/usuarios'] })} />);
  return api;
}

const filaDe = async (nombre: string) => (await screen.findByText(nombre)).closest('li')!;

describe('Usuarios: el estado del correo y la invitación (D41)', () => {
  it('cada cuenta dice si puede entrar, y solo las activas que no confirmaron su correo ofrecen reenviar', async () => {
    abrirUsuarios();

    const ana = within(await filaDe('Ana Torres'));
    const luis = within(await filaDe('Luis Quispe'));
    const rosa = within(await filaDe('Rosa Díaz'));
    const jorge = within(await filaDe('Jorge Ramos'));

    expect(ana.queryByText(/Pendiente de activar|Correo sin verificar/)).not.toBeInTheDocument();
    expect(ana.queryByRole('button', { name: /Reenviar/ })).not.toBeInTheDocument();
    expect(luis.getByText('Pendiente de activar')).toBeInTheDocument();
    expect(luis.getByRole('button', { name: 'Reenviar invitación' })).toBeInTheDocument();
    expect(rosa.getByText('Correo sin verificar')).toBeInTheDocument();
    expect(rosa.getByRole('button', { name: 'Reenviar verificación' })).toBeInTheDocument();
    // Desactivada, primero hay que reactivarla.
    expect(jorge.getByText('Desactivado')).toBeInTheDocument();
    expect(jorge.queryByRole('button', { name: /Reenviar/ })).not.toBeInTheDocument();
  });

  it('reenviar la invitación avisa a quién salió; si hay que esperar, lo dice la API', async () => {
    let veces = 0;
    const { peticiones } = abrirUsuarios({
      'POST /usuarios/:id/invitacion': () => (++veces === 1
        ? { cuerpo: { enviado: true } }
        : { estado: 429, cuerpo: { error: { codigo: 'ENVIO_LIMITADO', mensaje: 'Se envió un enlace hace muy poco. Espera 2 minuto(s) antes de reenviarlo' } } }),
    });
    const usuario = userEvent.setup();

    await usuario.click(within(await filaDe('Luis Quispe')).getByRole('button', { name: 'Reenviar invitación' }));
    expect(await screen.findByText('Le reenviamos el enlace a luis@ejemplo.pe. El anterior ya no sirve.')).toBeInTheDocument();
    expect(peticiones.at(-1)).toMatchObject({ metodo: 'POST', ruta: '/usuarios/luis/invitacion' });

    await usuario.click(within(await filaDe('Luis Quispe')).getByRole('button', { name: 'Reenviar invitación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Espera 2 minuto(s)');
  });

  it('una cuenta nueva se crea sin contraseña: la define su dueño al aceptar la invitación', async () => {
    const { peticiones } = abrirUsuarios({
      'POST /usuarios': ({ cuerpo }) => ({ estado: 201, cuerpo: { ...persona('nueva', 'Carla Rojas', { estado: 'pendiente' }), ...(cuerpo as object), invitacionEnviada: true } }),
    });
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByRole('button', { name: 'Nuevo usuario' }));
    const dialogo = within(screen.getByRole('dialog'));
    expect(dialogo.queryByLabelText(/Contraseña/)).not.toBeInTheDocument();
    await usuario.type(dialogo.getByLabelText('Nombre'), 'Carla Rojas');
    await usuario.type(dialogo.getByLabelText('Correo'), 'carla@ejemplo.pe');
    await usuario.click(dialogo.getByRole('button', { name: 'Crear usuario' }));

    expect(await screen.findByText(/Le enviamos a carla@ejemplo.pe una invitación/)).toBeInTheDocument();
    expect(peticiones.find((p) => p.metodo === 'POST' && p.ruta === '/usuarios')?.cuerpo).toEqual({
      nombre: 'Carla Rojas', email: 'carla@ejemplo.pe', dni: '', rol: 'usuario',
    });
  });

  it('si la invitación no salió, la cuenta queda creada y se pide reenviarla', async () => {
    abrirUsuarios({
      'POST /usuarios': { estado: 201, cuerpo: { ...persona('nueva', 'Carla Rojas', { estado: 'pendiente' }), invitacionEnviada: false } },
    });
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByRole('button', { name: 'Nuevo usuario' }));
    const dialogo = within(screen.getByRole('dialog'));
    await usuario.type(dialogo.getByLabelText('Nombre'), 'Carla Rojas');
    await usuario.type(dialogo.getByLabelText('Correo'), 'nueva@ejemplo.pe');
    await usuario.click(dialogo.getByRole('button', { name: 'Crear usuario' }));

    expect(await screen.findByText(/el correo de invitación no salió\. Reenvíaselo desde la lista/)).toBeInTheDocument();
  });

  it('a una cuenta pendiente no se le ofrece poner contraseña; a una que ya la tiene, sí cambiarla', async () => {
    abrirUsuarios();
    const usuario = userEvent.setup();

    await usuario.click(within(await filaDe('Luis Quispe')).getByRole('button', { name: 'Editar' }));
    expect(within(screen.getByRole('dialog')).queryByLabelText(/Contraseña/)).not.toBeInTheDocument();
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));

    await usuario.click(within(await filaDe('Rosa Díaz')).getByRole('button', { name: 'Editar' }));
    expect(within(screen.getByRole('dialog')).getByLabelText(/Contraseña nueva/)).toBeInTheDocument();
  });
});
