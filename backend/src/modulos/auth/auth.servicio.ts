import type pg from 'pg';
import { claveCoincide, hashearClave } from '../../compartido/claves.js';
import { ErrorAplicacion } from '../../compartido/errores.js';
import type { Actor, Contexto, UsuarioAutenticado } from '../../compartido/peticion.js';
import type { Rol } from '../../compartido/permisos.js';
import type { Firmador } from '../../compartido/tokens.js';
import { violaRestriccion } from '../../db/errores-postgres.js';
import { conTransaccion } from '../../db/transaccion.js';
import { CATEGORIAS_INICIALES } from '../categorias/categorias.iniciales.js';
import { autorDe, registrarAccion, SIN_AUTOR } from '../historial/historial.registro.js';
import {
  actualizarClaveHash, buscarClaveHash, buscarCuentaPorEmail, buscarOrganizacion, insertarCategorias,
  insertarOrganizacion, insertarSesion, insertarUsuario, revocarOtrasSesiones, revocarSesion, type Organizacion,
} from './auth.repositorio.js';
import type { DatosCambioClave, DatosInicioSesion, DatosRegistro } from './auth.esquemas.js';

const HORA = 3_600_000;

export interface Perfil {
  usuario: { id: string; nombre: string; email: string; rol: Rol };
  organizacion: Organizacion;
}

export interface SesionIniciada extends Perfil {
  token: string;
  expiraEn: string;
}

export interface DependenciasAuth {
  pool: pg.Pool;
  firmador: Firmador;
  duracionHoras: number;
  registroAbierto: boolean;
}

export type ServicioAuth = ReturnType<typeof crearServicioAuth>;

export function crearServicioAuth({ pool, firmador, duracionHoras, registroAbierto }: DependenciasAuth) {
  /** Crea la sesión y registra su inicio con el cliente de la transacción en curso. */
  async function abrirSesion(cliente: pg.PoolClient, usuario: UsuarioAutenticado, contexto: Contexto) {
    const expiraEn = new Date(Date.now() + duracionHoras * HORA);
    const sesionId = await insertarSesion(cliente, usuario.id, expiraEn);
    await registrarAccion(cliente, {
      accion: 'SESION_INICIADA', autor: autorDe(usuario), contexto, entidad: { tipo: 'sesion', id: sesionId },
    });
    return { sesionId, expiraEn };
  }

  // El token se firma después de confirmar: una sesión sin token no le sirve a nadie, un token sin sesión sí.
  async function emitir(
    usuario: UsuarioAutenticado,
    organizacion: Organizacion,
    { sesionId, expiraEn }: { sesionId: string; expiraEn: Date },
  ): Promise<SesionIniciada> {
    const token = await firmador.firmar({ usuarioId: usuario.id, sesionId }, expiraEn);
    return { token, expiraEn: expiraEn.toISOString(), usuario: datosPublicos(usuario), organizacion };
  }

  async function registrarIntentoFallido(
    contexto: Contexto,
    email: string,
    motivo: 'CORREO_DESCONOCIDO' | 'CLAVE_INCORRECTA' | 'USUARIO_INACTIVO',
    cuenta: UsuarioAutenticado | null,
  ): Promise<void> {
    await registrarAccion(pool, {
      accion: 'SESION_FALLIDA', autor: cuenta ? autorDe(cuenta) : SIN_AUTOR, contexto, detalle: { email, motivo },
    });
  }

  return {
    async registrarOrganizacion(datos: DatosRegistro, contexto: Contexto): Promise<SesionIniciada> {
      if (!registroAbierto) {
        throw new ErrorAplicacion(403, 'REGISTRO_CERRADO', 'El registro de nuevas organizaciones está cerrado');
      }
      // Fuera de la transacción: es lo más lento y no toca la base.
      const claveHash = await hashearClave(datos.administrador.clave);
      try {
        const { usuario, organizacion, sesion } = await conTransaccion(pool, async (cliente) => {
          const organizacion = await insertarOrganizacion(cliente, datos.organizacion);
          const usuario = await insertarUsuario(cliente, {
            organizacionId: organizacion.id,
            nombre: datos.administrador.nombre,
            email: datos.administrador.email,
            claveHash,
            rol: 'administrador',
          });
          await insertarCategorias(cliente, organizacion.id, CATEGORIAS_INICIALES);
          await registrarAccion(cliente, {
            accion: 'ORGANIZACION_REGISTRADA',
            autor: autorDe(usuario),
            contexto,
            entidad: { tipo: 'organizacion', id: organizacion.id },
            detalle: { nombre: organizacion.nombre },
          });
          const sesion = await abrirSesion(cliente, usuario, contexto);
          return { usuario, organizacion, sesion };
        });
        return emitir(usuario, organizacion, sesion);
      } catch (error) {
        if (violaRestriccion(error, 'usuarios_email_unico')) {
          throw new ErrorAplicacion(409, 'EMAIL_EN_USO', 'Ya hay una cuenta con ese correo');
        }
        throw error;
      }
    },

    async iniciarSesion({ email, clave }: DatosInicioSesion, contexto: Contexto): Promise<SesionIniciada> {
      const cuenta = await buscarCuentaPorEmail(pool, email);
      // Se compara aunque la cuenta no exista, para que la respuesta tarde lo mismo en ambos casos.
      const coincide = await claveCoincide(clave, cuenta?.claveHash ?? null);
      if (!cuenta || !coincide) {
        await registrarIntentoFallido(contexto, email, cuenta ? 'CLAVE_INCORRECTA' : 'CORREO_DESCONOCIDO', cuenta);
        throw new ErrorAplicacion(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos');
      }
      if (!cuenta.activo) {
        await registrarIntentoFallido(contexto, email, 'USUARIO_INACTIVO', cuenta);
        throw new ErrorAplicacion(403, 'USUARIO_INACTIVO', 'Tu cuenta está desactivada. Consulta con el administrador de tu organización');
      }
      const sesion = await conTransaccion(pool, (cliente) => abrirSesion(cliente, cuenta, contexto));
      return emitir(cuenta, cuenta.organizacion, sesion);
    },

    async cerrarSesion({ autenticacion, contexto }: Actor): Promise<void> {
      await conTransaccion(pool, async (cliente) => {
        await revocarSesion(cliente, autenticacion.sesionId);
        await registrarAccion(cliente, {
          accion: 'SESION_CERRADA',
          autor: autorDe(autenticacion.usuario),
          contexto,
          entidad: { tipo: 'sesion', id: autenticacion.sesionId },
        });
      });
    },

    async cambiarClave({ autenticacion, contexto }: Actor, { claveActual, claveNueva }: DatosCambioClave): Promise<void> {
      const { usuario, sesionId } = autenticacion;
      if (!(await claveCoincide(claveActual, await buscarClaveHash(pool, usuario.id)))) {
        throw new ErrorAplicacion(400, 'VALIDACION', 'La contraseña actual no es correcta', {
          detalles: [{ campo: 'claveActual', mensaje: 'No coincide con tu contraseña actual' }],
        });
      }
      const nuevoHash = await hashearClave(claveNueva);
      await conTransaccion(pool, async (cliente) => {
        await actualizarClaveHash(cliente, usuario.id, nuevoHash);
        // RN06: si alguien más conocía la contraseña anterior, pierde el acceso en ese momento.
        const sesionesCerradas = await revocarOtrasSesiones(cliente, usuario.id, sesionId);
        await registrarAccion(cliente, {
          accion: 'CLAVE_CAMBIADA',
          autor: autorDe(usuario),
          contexto,
          entidad: { tipo: 'usuario', id: usuario.id },
          detalle: { sesionesCerradas },
        });
      });
    },

    async obtenerPerfil({ autenticacion }: Actor): Promise<Perfil> {
      const { usuario } = autenticacion;
      const organizacion = await buscarOrganizacion(pool, usuario.organizacionId);
      if (!organizacion) throw new Error(`El usuario ${usuario.id} pertenece a una organización que no existe`);
      return { usuario: datosPublicos(usuario), organizacion };
    },
  };
}

function datosPublicos({ id, nombre, email, rol }: UsuarioAutenticado): Perfil['usuario'] {
  return { id, nombre, email, rol };
}
