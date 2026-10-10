import { calcularCambios, valoresNuevos, type Cambios } from '../../compartido/cambios.js';
import { hashearClave } from '../../compartido/claves.js';
import { ErrorAplicacion, noEncontrado } from '../../compartido/errores.js';
import type { Pagina } from '../../compartido/paginacion.js';
import { empresaDe, type Actor } from '../../compartido/peticion.js';
import { violaRestriccion } from '../../db/errores-postgres.js';
import { revocarSesionesDe } from '../auth/auth.repositorio.js';
import type { EnlacesDeCuenta, ResultadoDeEnvio } from '../auth/enlaces.js';
import { autorDe, registrarAccion, type Autor } from '../historial/historial.registro.js';
import type { CambiosUsuario, FiltroUsuarios, NuevoUsuario } from './usuarios.esquemas.js';
import {
  actualizarUsuario, buscarUsuario, correoEnLaEmpresa, insertarUsuario, listarUsuarios, type Usuario,
} from './usuarios.repositorio.js';

export type ServicioUsuarios = ReturnType<typeof crearServicioUsuarios>;

/**
 * El correo ya es de otra cuenta. La unicidad es de toda la plataforma (usuarios_email_unico), así que el
 * mensaje admite que existe, pero no dice en qué empresa: eso sí sería un dato ajeno.
 */
export const correoEnUso = () => new ErrorAplicacion(409, 'EMAIL_EN_USO', 'Ese correo ya tiene una cuenta en la plataforma. Usa otro');
const correoEnTuEmpresa = () => new ErrorAplicacion(409, 'EMAIL_EN_USO',
  'Esa persona ya tiene una cuenta en tu empresa. Si no le llegó la invitación, reenvíasela desde la lista');

/** Lo que se le responde a quien crea una cuenta o reenvía una invitación: si el correo salió. */
export const invitacionEnviada = (envio: ResultadoDeEnvio) => envio.enviado;

/**
 * Reenviar la invitación o la verificación de una cuenta ya comprobada como propia (D41). Si el correo no
 * sale, se dice: quien lo pidió puede volver a intentarlo.
 */
export async function reenviarEnlace(enlaces: EnlacesDeCuenta, usuario: { id: string; activo: boolean; estado: string }, autor: Autor, contexto: Actor['contexto']) {
  if (usuario.estado === 'verificado') throw new ErrorAplicacion(409, 'YA_VERIFICADO', 'Esa cuenta ya confirmó su correo: no necesita otro enlace');
  if (!usuario.activo) throw new ErrorAplicacion(409, 'USUARIO_INACTIVO', 'La cuenta está desactivada: reactívala antes de reenviarle el enlace');
  const envio = await enlaces.enviar(usuario.id, { autor, contexto, siHayLimite: 'error', esperarAlCorreo: true });
  if (!envio.enviado && envio.motivo === 'no_corresponde') {
    // Lo único que queda por comprobar aquí: la empresa, que el Master puede tener desactivada.
    throw new ErrorAplicacion(409, 'EMPRESA_INACTIVA', 'La empresa está desactivada: reactívala antes de reenviar el enlace');
  }
  if (!envio.enviado) {
    throw new ErrorAplicacion(502, 'CORREO_NO_ENVIADO', 'No se pudo enviar el correo. Vuelve a intentarlo en unos minutos');
  }
  return { enviado: true as const };
}

/** El historial anota que el DNI cambió, no cuál es: es un dato personal y para auditar no hace falta. */
export function cambiosParaElHistorial(cambios: Cambios): Cambios {
  if (!cambios.dni) return cambios;
  const oculto = (valor: unknown) => (valor ? '********' : null);
  return { ...cambios, dni: { antes: oculto(cambios.dni.antes), despues: oculto(cambios.dni.despues) } };
}

/** Gestión de usuarios (RF13, RF14). Solo llega aquí quien tiene GESTIONAR_USUARIOS: lo exige la ruta. */
export function crearServicioUsuarios({ enlaces }: { enlaces: EnlacesDeCuenta }) {
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

    /**
     * La cuenta nace pendiente y sin contraseña, y su dueño recibe la invitación (D41). Crearla y enviarla
     * son dos pasos: si el correo no sale, la cuenta queda creada y se reenvía desde la lista.
     */
    async crear(actor: Actor, datos: NuevoUsuario): Promise<Usuario & { invitacionEnviada: boolean }> {
      const { usuario: administrador } = actor.autenticacion;
      let usuario: Usuario;
      try {
        usuario = await actor.datos.ejecutar(async (cliente) => {
          const creado = await insertarUsuario(cliente, { ...datos, empresaId: empresaDe(actor) });
          await registrarAccion(cliente, {
            accion: 'USUARIO_CREADO',
            autor: autorDe(administrador),
            contexto: actor.contexto,
            entidad: { tipo: 'usuario', id: creado.id },
            detalle: { nombre: creado.nombre, email: creado.email, rol: creado.rol },
          });
          return creado;
        });
      } catch (error) {
        if (!violaRestriccion(error, 'usuarios_email_unico')) throw error;
        throw (await actor.datos.ejecutar((db) => correoEnLaEmpresa(db, datos.email))) ? correoEnTuEmpresa() : correoEnUso();
      }
      const envio = await enlaces.enviar(usuario.id, {
        autor: autorDe(administrador), contexto: actor.contexto, siHayLimite: 'callar', esperarAlCorreo: true,
      });
      return { ...usuario, invitacionEnviada: invitacionEnviada(envio) };
    },

    /** RF13: la invitación (o la verificación) otra vez. La cuenta se busca con el acceso de la empresa. */
    async reenviarInvitacion(actor: Actor, id: string) {
      const usuario = await usuarioDeLaEmpresa(actor, id);
      return reenviarEnlace(enlaces, usuario, autorDe(actor.autenticacion.usuario), actor.contexto);
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
