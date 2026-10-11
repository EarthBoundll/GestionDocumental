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

  it('reenviar la invitación lo confirma en la misma fila, con la hora; si hay que esperar, lo dice la API', async () => {
    let veces = 0;
    const { peticiones } = abrirUsuarios({
      'POST /usuarios/:id/invitacion': () => (++veces === 1
        ? { cuerpo: { enviado: true } }
        : { estado: 429, cuerpo: { error: { codigo: 'ENVIO_LIMITADO', mensaje: 'Se envió un enlace hace muy poco. Espera 2 minuto(s) antes de reenviarlo' } } }),
    });
    const usuario = userEvent.setup();

    await usuario.click(within(await filaDe('Luis Quispe')).getByRole('button', { name: 'Reenviar invitación' }));
    // Donde se está mirando: en su fila, no arriba de la página.
    expect(await within(await filaDe('Luis Quispe')).findByRole('status'))
      .toHaveTextContent(/Enlace nuevo enviado a las \d{2}:\d{2}\. Los anteriores ya no sirven/);
    expect(peticiones.at(-1)).toMatchObject({ metodo: 'POST', ruta: '/usuarios/luis/invitacion' });

    await usuario.click(within(await filaDe('Luis Quispe')).getByRole('button', { name: 'Reenviar invitación' }));
    expect(await within(await filaDe('Luis Quispe')).findByRole('alert')).toHaveTextContent('Espera 2 minuto(s)');
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

describe('Usuarios: desactivar y eliminar, siempre con confirmación (D46)', () => {
  it('desactivar pide confirmación; cancelar no cambia nada', async () => {
    const { peticiones } = abrirUsuarios();
    const usuario = userEvent.setup();

    await usuario.click(within(await filaDe('Ana Torres')).getByRole('button', { name: 'Desactivar' }));
    const dialogo = within(screen.getByRole('dialog'));
    expect(dialogo.getByText('Ana Torres')).toBeInTheDocument();
    expect(dialogo.getByText(/se cerrarán sus sesiones abiertas/)).toBeInTheDocument();
    await usuario.click(dialogo.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(peticiones.filter((peticion) => peticion.metodo !== 'GET')).toEqual([]);
  });

  it('eliminar nombra a la persona, explica que es para siempre y que su traza se conserva; al confirmar, la quita', async () => {
    let eliminada = false;
    const { peticiones } = abrirUsuarios({
      'GET /usuarios': () => ({ cuerpo: { datos: LISTA.filter((p) => !(eliminada && p.id === 'ana')), paginacion: { pagina: 1, porPagina: 20, total: 3 } } }),
      'DELETE /usuarios/:id': () => { eliminada = true; return { estado: 204 }; },
    });
    const usuario = userEvent.setup();

    await usuario.click(within(await filaDe('Ana Torres')).getByRole('button', { name: 'Eliminar a Ana Torres' }));
    const dialogo = within(screen.getByRole('dialog', { name: 'Eliminar la cuenta' }));
    expect(dialogo.getByText('ana@ejemplo.pe', { exact: false })).toBeInTheDocument();
    expect(dialogo.getByText('No se puede deshacer.')).toBeInTheDocument();
    expect(dialogo.getByText(/Sus documentos, sus solicitudes y el historial se conservan con su nombre/)).toBeInTheDocument();
    await usuario.click(dialogo.getByRole('button', { name: 'Eliminar para siempre' }));

    expect(await screen.findByText(/Se eliminó la cuenta de Ana Torres/)).toBeInTheDocument();
    expect(peticiones.find((peticion) => peticion.metodo === 'DELETE')).toMatchObject({ ruta: '/usuarios/ana' });
    expect(screen.queryByText('Ana Torres')).not.toBeInTheDocument();
  });

  it('si la API lo rechaza, el diálogo lo dice y no se cierra', async () => {
    abrirUsuarios({
      'DELETE /usuarios/:id': { estado: 404, cuerpo: { error: { codigo: 'NO_ENCONTRADO', mensaje: 'El usuario no existe' } } },
    });
    const usuario = userEvent.setup();

    await usuario.click(within(await filaDe('Ana Torres')).getByRole('button', { name: 'Eliminar a Ana Torres' }));
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar para siempre' }));

    expect(await within(screen.getByRole('dialog')).findByText('El usuario no existe')).toBeInTheDocument();
  });

  it('las desactivadas se ven aparte, en «Desactivados», y también se pueden eliminar', async () => {
    const { peticiones } = abrirUsuarios();
    const usuario = userEvent.setup();

    await filaDe('Ana Torres');
    expect(peticiones.find((peticion) => peticion.ruta === '/usuarios')!.consulta.get('activo')).toBe('true');
    await usuario.click(screen.getByRole('button', { name: 'Desactivados' }));

    expect(screen.getByRole('button', { name: 'Desactivados' })).toHaveAttribute('aria-pressed', 'true');
    expect(peticiones.findLast((peticion) => peticion.ruta === '/usuarios')!.consulta.get('activo')).toBe('false');
    expect(within(await filaDe('Jorge Ramos')).getByRole('button', { name: 'Eliminar a Jorge Ramos' })).toBeInTheDocument();
  });
});
