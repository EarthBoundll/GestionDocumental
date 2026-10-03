import { calcularCambios, valoresNuevos, type Cambios } from '../../compartido/cambios.js';
import { hashearClave } from '../../compartido/claves.js';
import { ErrorAplicacion, noEncontrado } from '../../compartido/errores.js';
import type { Pagina } from '../../compartido/paginacion.js';
import { empresaDe, type Actor } from '../../compartido/peticion.js';
import { violaRestriccion } from '../../db/errores-postgres.js';
import { revocarSesionesDe } from '../auth/auth.repositorio.js';
import { autorDe, registrarAccion } from '../historial/historial.registro.js';
import type { CambiosUsuario, FiltroUsuarios, NuevoUsuario } from './usuarios.esquemas.js';
import { actualizarUsuario, buscarUsuario, insertarUsuario, listarUsuarios, type Usuario } from './usuarios.repositorio.js';

export type ServicioUsuarios = ReturnType<typeof crearServicioUsuarios>;

export const correoEnUso = () => new ErrorAplicacion(409, 'EMAIL_EN_USO', 'Ya hay una cuenta con ese correo');

/** El historial anota que el DNI cambió, no cuál es: es un dato personal y para auditar no hace falta. */
export function cambiosParaElHistorial(cambios: Cambios): Cambios {
  if (!cambios.dni) return cambios;
  const oculto = (valor: unknown) => (valor ? '********' : null);
  return { ...cambios, dni: { antes: oculto(cambios.dni.antes), despues: oculto(cambios.dni.despues) } };
}

/** Gestión de usuarios (RF13, RF14). Solo llega aquí quien tiene GESTIONAR_USUARIOS: lo exige la ruta. */
export function crearServicioUsuarios() {
  async function usuarioDeLaEmpresa(actor: Actor, id: string): Promise<Usuario> {
    const usuario = await actor.datos.ejecutar((db) => buscarUsuario(db, empresaDe(actor), id));
    if (!usuario) throw noEncontrado('El usuario no existe');
    return usuario;
  }

  /**
   * RN03: un administrador no cambia su propio rol ni se desactiva. Con eso basta para que la
   * empresa nunca se quede sin administrador: para quitar a uno, tiene que actuar otro.
   */
  function exigirQueNoSeaElMismo(actor: Actor, id: string, accion: string): void {
    if (actor.autenticacion.usuario.id === id) {
      throw new ErrorAplicacion(409, 'OPERACION_SOBRE_SI_MISMO', `No puedes ${accion} tu propia cuenta: pídeselo a otro administrador`);
    }
  }

  return {
    async listar(actor: Actor, filtro: FiltroUsuarios): Promise<Pagina<Usuario>> {
      const { filas, total } = await actor.datos.ejecutar((db) => listarUsuarios(db, empresaDe(actor), filtro));
      return { datos: filas, paginacion: { pagina: filtro.pagina, porPagina: filtro.porPagina, total } };
    },

    async crear(actor: Actor, datos: NuevoUsuario): Promise<Usuario> {
      const { usuario: administrador } = actor.autenticacion;
      const claveHash = await hashearClave(datos.clave);
      try {
        return await actor.datos.ejecutar(async (cliente) => {
          const usuario = await insertarUsuario(cliente, { ...datos, claveHash, empresaId: empresaDe(actor) });
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
        if (violaRestriccion(error, 'usuarios_email_unico')) throw correoEnUso();
        throw error;
      }
    },

    async editar(actor: Actor, id: string, { clave, ...propuesta }: CambiosUsuario): Promise<Usuario> {
      const actual = await usuarioDeLaEmpresa(actor, id);
      const cambios = calcularCambios(actual, propuesta);
      if (cambios.rol) exigirQueNoSeaElMismo(actor, id, 'cambiar el rol de');
      if (Object.keys(cambios).length === 0 && clave === undefined) return actual;
      const claveHash = clave === undefined ? undefined : await hashearClave(clave);

      return actor.datos.ejecutar(async (cliente) => {
        await actualizarUsuario(cliente, empresaDe(actor), id, {
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
          detalle: { cambios: cambiosParaElHistorial(cambios), ...(claveHash && { claveRestablecida: true, sesionesCerradas }) },
        });
        return { ...actual, ...valoresNuevos(cambios) } as Usuario;
      });
    },

    async cambiarEstado(actor: Actor, id: string, activo: boolean): Promise<Usuario> {
      const actual = await usuarioDeLaEmpresa(actor, id);
      exigirQueNoSeaElMismo(actor, id, activo ? 'reactivar' : 'desactivar');
      if (actual.activo === activo) return actual;

      return actor.datos.ejecutar(async (cliente) => {
        await actualizarUsuario(cliente, empresaDe(actor), id, { activo });
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
