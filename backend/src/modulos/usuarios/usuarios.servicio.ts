import type pg from 'pg';
import { calcularCambios, valoresNuevos } from '../../compartido/cambios.js';
import { hashearClave } from '../../compartido/claves.js';
import { ErrorAplicacion, noEncontrado } from '../../compartido/errores.js';
import type { Pagina } from '../../compartido/paginacion.js';
import type { Actor } from '../../compartido/peticion.js';
import { violaRestriccion } from '../../db/errores-postgres.js';
import { conTransaccion } from '../../db/transaccion.js';
import { revocarSesionesDe } from '../auth/auth.repositorio.js';
import { autorDe, registrarAccion } from '../historial/historial.registro.js';
import type { CambiosUsuario, FiltroUsuarios, NuevoUsuario } from './usuarios.esquemas.js';
import { actualizarUsuario, buscarUsuario, insertarUsuario, listarUsuarios, type Usuario } from './usuarios.repositorio.js';

export type ServicioUsuarios = ReturnType<typeof crearServicioUsuarios>;

/** Gestión de usuarios (RF13, RF14). Solo llega aquí quien tiene GESTIONAR_USUARIOS: lo exige la ruta. */
export function crearServicioUsuarios(pool: pg.Pool) {
  async function usuarioDeLaOrganizacion(actor: Actor, id: string): Promise<Usuario> {
    const usuario = await buscarUsuario(pool, actor.autenticacion.usuario.organizacionId, id);
    if (!usuario) throw noEncontrado('El usuario no existe');
    return usuario;
  }

  /**
   * RN03: un administrador no cambia su propio rol ni se desactiva. Con eso basta para que la
   * organización nunca se quede sin administrador: para quitar a uno, tiene que actuar otro.
   */
  function exigirQueNoSeaElMismo(actor: Actor, id: string, accion: string): void {
    if (actor.autenticacion.usuario.id === id) {
      throw new ErrorAplicacion(409, 'OPERACION_SOBRE_SI_MISMO', `No puedes ${accion} tu propia cuenta: pídeselo a otro administrador`);
    }
  }

  return {
    async listar(actor: Actor, filtro: FiltroUsuarios): Promise<Pagina<Usuario>> {
      const { filas, total } = await listarUsuarios(pool, actor.autenticacion.usuario.organizacionId, filtro);
      return { datos: filas, paginacion: { pagina: filtro.pagina, porPagina: filtro.porPagina, total } };
    },

    async crear(actor: Actor, datos: NuevoUsuario): Promise<Usuario> {
      const { usuario: administrador } = actor.autenticacion;
      const claveHash = await hashearClave(datos.clave);
      try {
        return await conTransaccion(pool, async (cliente) => {
          const usuario = await insertarUsuario(cliente, { ...datos, claveHash, organizacionId: administrador.organizacionId });
          await registrarAccion(cliente, {
            accion: 'USUARIO_CREADO',
            autor: autorDe(administrador),
            contexto: actor.contexto,
            entidad: { tipo: 'usuario', id: usuario.id },
            detalle: { nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
          });
          return usuario;
        });
      } catch (error) {
        if (violaRestriccion(error, 'usuarios_email_unico')) {
          throw new ErrorAplicacion(409, 'EMAIL_EN_USO', 'Ya hay una cuenta con ese correo');
        }
        throw error;
      }
    },

    async editar(actor: Actor, id: string, { clave, ...propuesta }: CambiosUsuario): Promise<Usuario> {
      const actual = await usuarioDeLaOrganizacion(actor, id);
      const cambios = calcularCambios(actual, propuesta);
      if (cambios.rol) exigirQueNoSeaElMismo(actor, id, 'cambiar el rol de');
      if (Object.keys(cambios).length === 0 && clave === undefined) return actual;
      const claveHash = clave === undefined ? undefined : await hashearClave(clave);

      return conTransaccion(pool, async (cliente) => {
        await actualizarUsuario(cliente, actor.autenticacion.usuario.organizacionId, id, {
          ...valoresNuevos(cambios),
          ...(claveHash && { claveHash }),
        });
        // Si se restablece la contraseña es porque la anterior ya no es de fiar: sus sesiones se cierran.
        const sesionesCerradas = claveHash ? await revocarSesionesDe(cliente, id) : 0;
        await registrarAccion(cliente, {
          accion: 'USUARIO_EDITADO',
          autor: autorDe(actor.autenticacion.usuario),
          contexto: actor.contexto,
          entidad: { tipo: 'usuario', id },
          detalle: { cambios, ...(claveHash && { claveRestablecida: true, sesionesCerradas }) },
        });
        return { ...actual, ...valoresNuevos(cambios) } as Usuario;
      });
    },

    async cambiarEstado(actor: Actor, id: string, activo: boolean): Promise<Usuario> {
      const actual = await usuarioDeLaOrganizacion(actor, id);
      exigirQueNoSeaElMismo(actor, id, activo ? 'reactivar' : 'desactivar');
      if (actual.activo === activo) return actual;

      return conTransaccion(pool, async (cliente) => {
        await actualizarUsuario(cliente, actor.autenticacion.usuario.organizacionId, id, { activo });
        // RN04: quien se desactiva pierde el acceso en ese momento, no cuando caduque su sesión.
        const sesionesCerradas = activo ? 0 : await revocarSesionesDe(cliente, id);
        await registrarAccion(cliente, {
          accion: activo ? 'USUARIO_REACTIVADO' : 'USUARIO_DESACTIVADO',
          autor: autorDe(actor.autenticacion.usuario),
          contexto: actor.contexto,
          entidad: { tipo: 'usuario', id },
          detalle: { nombre: actual.nombre, sesionesCerradas },
        });
        return { ...actual, activo };
      });
    },
  };
}
