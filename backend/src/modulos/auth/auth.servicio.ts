import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import { claveCoincide, hashearClave, problemaDeClaveDelMaster } from '../../compartido/claves.js';
import { ErrorAplicacion } from '../../compartido/errores.js';
import type { Actor, Contexto, UsuarioAutenticado } from '../../compartido/peticion.js';
import type { Firmador } from '../../compartido/tokens.js';
import type { Correo } from '../../correo/correo.js';
import { conTransaccion } from '../../db/transaccion.js';
import { autorDe, registrarAccion, SIN_AUTOR } from '../historial/historial.registro.js';
import { correoDeRecuperacion } from './auth.correos.js';
import type { DatosCambioClave, DatosConfirmacionRecuperacion, DatosInicioSesion } from './auth.esquemas.js';
import {
  actualizarClaveHash, anularRecuperacionesDe, buscarClaveHash, buscarCuentaPorEmail, buscarDni, buscarPerfil,
  consumirRecuperacion, fallosRecientes, insertarRecuperacion, insertarSesion, revocarOtrasSesiones, revocarSesion,
  revocarSesionesDe, type Perfil,
} from './auth.repositorio.js';

const HORA = 3_600_000;
/** CLAUDE.md v2: el enlace de recuperación vale 60 minutos. */
export const MINUTOS_DE_RECUPERACION = 60;
/** RN27: cinco contraseñas incorrectas para un correo en 15 minutos lo bloquean hasta que pasen. */
export const BLOQUEO = { fallos: 5, minutos: 15 } as const;

export type { Perfil };

export interface SesionIniciada extends Perfil {
  token: string;
  expiraEn: string;
}

export interface DependenciasAuth {
  /** La conexión dueña de las tablas: la identidad se resuelve antes de conocer la empresa. */
  pool: pg.Pool;
  firmador: Firmador;
  duracionHoras: number;
  correo: Correo;
  /** Dónde vive el frontend: el enlace del correo de recuperación apunta allí. */
  urlFrontend: string;
}

type MotivoDeFallo = 'CORREO_DESCONOCIDO' | 'CLAVE_INCORRECTA' | 'USUARIO_INACTIVO' | 'EMPRESA_INACTIVA' | 'CUENTA_BLOQUEADA';

export type ServicioAuth = ReturnType<typeof crearServicioAuth>;

/** El token viaja en el enlace; en la base solo queda su huella, que no sirve para entrar. */
const huella = (token: string) => createHash('sha256').update(token).digest('hex');

export function crearServicioAuth({ pool, firmador, duracionHoras, correo, urlFrontend }: DependenciasAuth) {
  async function perfilDe(usuarioId: string): Promise<Perfil> {
    const perfil = await buscarPerfil(pool, usuarioId);
    if (!perfil) throw new Error(`El usuario ${usuarioId} ya no existe`);
    return perfil;
  }

  async function registrarIntentoFallido(
    contexto: Contexto, email: string, motivo: MotivoDeFallo, cuenta: UsuarioAutenticado | null,
  ): Promise<void> {
    await registrarAccion(pool, {
      accion: 'SESION_FALLIDA', autor: cuenta ? autorDe(cuenta) : SIN_AUTOR, contexto, detalle: { email, motivo },
    });
  }

  /** La del Master tiene reglas propias, que se comprueban cada vez que la contraseña cambia. */
  async function comprobarClaveNueva(usuario: UsuarioAutenticado, claveNueva: string): Promise<void> {
    if (usuario.rol !== 'master') return;
    const problema = problemaDeClaveDelMaster(claveNueva, { email: usuario.email, dni: await buscarDni(pool, usuario.id) });
    if (problema) {
      throw new ErrorAplicacion(400, 'VALIDACION', problema, { detalles: [{ campo: 'claveNueva', mensaje: problema }] });
    }
  }

  return {
    async iniciarSesion({ email, clave }: DatosInicioSesion, contexto: Contexto): Promise<SesionIniciada> {
      const cuenta = await buscarCuentaPorEmail(pool, email);
      // El IP ya tiene su freno (RN20), pero desde otra red se podría seguir probando contra la misma cuenta.
      if (await fallosRecientes(pool, email, cuenta?.id ?? null, BLOQUEO.minutos) >= BLOQUEO.fallos) {
        await registrarIntentoFallido(contexto, email, 'CUENTA_BLOQUEADA', cuenta);
        throw new ErrorAplicacion(429, 'CUENTA_BLOQUEADA',
          `Demasiados intentos fallidos con este correo. Espera ${BLOQUEO.minutos} minutos o restablece tu contraseña`);
      }
      // Se compara aunque la cuenta no exista, para que la respuesta tarde lo mismo en ambos casos.
      const coincide = await claveCoincide(clave, cuenta?.claveHash ?? null);
      if (!cuenta || !coincide) {
        await registrarIntentoFallido(contexto, email, cuenta ? 'CLAVE_INCORRECTA' : 'CORREO_DESCONOCIDO', cuenta);
        throw new ErrorAplicacion(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos');
      }
      // Estos dos solo se revelan a quien conoce la contraseña.
      if (!cuenta.activo) {
        await registrarIntentoFallido(contexto, email, 'USUARIO_INACTIVO', cuenta);
        throw new ErrorAplicacion(403, 'USUARIO_INACTIVO', 'Tu cuenta está desactivada. Consulta con el administrador de tu empresa');
      }
      if (cuenta.empresa && !cuenta.empresa.activa) {
        await registrarIntentoFallido(contexto, email, 'EMPRESA_INACTIVA', cuenta);
        throw new ErrorAplicacion(403, 'EMPRESA_INACTIVA', 'Tu empresa está desactivada en la plataforma. Consulta con su administrador');
      }

      const expiraEn = new Date(Date.now() + duracionHoras * HORA);
      const sesionId = await conTransaccion(pool, async (cliente) => {
        const sesionId = await insertarSesion(cliente, cuenta.id, expiraEn);
        await registrarAccion(cliente, {
          accion: 'SESION_INICIADA', autor: autorDe(cuenta), contexto, entidad: { tipo: 'sesion', id: sesionId },
        });
        return sesionId;
      });
      // El token se firma después de confirmar: una sesión sin token no le sirve a nadie, un token sin sesión sí.
      const token = await firmador.firmar(
        { usuarioId: cuenta.id, sesionId, empresaId: cuenta.empresaId, rol: cuenta.rol },
        expiraEn,
      );
      return { token, expiraEn: expiraEn.toISOString(), ...(await perfilDe(cuenta.id)) };
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
      await comprobarClaveNueva(usuario, claveNueva);
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

    obtenerPerfil: ({ autenticacion }: Actor): Promise<Perfil> => perfilDe(autenticacion.usuario.id),

    /**
     * Pide un enlace de recuperación (CLAUDE.md v2). Responda lo que responda la base, quien llama no se
     * entera de nada: el controlador contesta siempre lo mismo y el correo sale después, sin esperarlo,
     * para que tampoco el tiempo de respuesta delate si la cuenta existe.
     */
    async solicitarRecuperacion(email: string, contexto: Contexto): Promise<void> {
      const cuenta = await buscarCuentaPorEmail(pool, email);
      const atendible = cuenta?.activo === true && (cuenta.empresa === null || cuenta.empresa.activa);
      if (!cuenta || !atendible) {
        await registrarAccion(pool, {
          accion: 'RECUPERACION_SOLICITADA',
          autor: cuenta ? autorDe(cuenta) : SIN_AUTOR,
          contexto,
          ...(cuenta && { entidad: { tipo: 'usuario', id: cuenta.id } }),
          detalle: { email, enviada: false, motivo: !cuenta ? 'CORREO_DESCONOCIDO' : !cuenta.activo ? 'USUARIO_INACTIVO' : 'EMPRESA_INACTIVA' },
        });
        return;
      }

      const token = randomBytes(32).toString('base64url');
      await conTransaccion(pool, async (cliente) => {
        await anularRecuperacionesDe(cliente, cuenta.id);
        await insertarRecuperacion(cliente, cuenta.id, huella(token), MINUTOS_DE_RECUPERACION);
        await registrarAccion(cliente, {
          accion: 'RECUPERACION_SOLICITADA',
          autor: autorDe(cuenta),
          contexto,
          entidad: { tipo: 'usuario', id: cuenta.id },
          detalle: { email, enviada: true },
        });
      });
      // El token va en el fragmento (#): el navegador no lo manda a ningún servidor ni queda en registros.
      const mensaje = correoDeRecuperacion({
        para: cuenta.email, nombre: cuenta.nombre, enlace: `${urlFrontend}/restablecer-clave#${token}`, minutos: MINUTOS_DE_RECUPERACION,
      });
      correo.enviar(mensaje).catch((error: unknown) => {
        console.error('[correo] no se pudo enviar el enlace de recuperación:', error);
      });
    },

    /** Define la contraseña nueva con un enlace vigente, que queda gastado, y cierra todas las sesiones. */
    async confirmarRecuperacion({ token, claveNueva }: DatosConfirmacionRecuperacion, contexto: Contexto): Promise<void> {
      // Fuera de la transacción: es lo más lento y no toca la base.
      const nuevoHash = await hashearClave(claveNueva);
      await conTransaccion(pool, async (cliente) => {
        const usuario = await consumirRecuperacion(cliente, huella(token));
        if (!usuario) {
          throw new ErrorAplicacion(400, 'ENLACE_INVALIDO', 'El enlace no es válido o ya caducó. Pide uno nuevo');
        }
        // Si la contraseña no cumple, la transacción se deshace y el enlace sigue sirviendo para otro intento.
        await comprobarClaveNueva(usuario, claveNueva);
        await actualizarClaveHash(cliente, usuario.id, nuevoHash);
        await anularRecuperacionesDe(cliente, usuario.id);
        const sesionesCerradas = await revocarSesionesDe(cliente, usuario.id);
        await registrarAccion(cliente, {
          accion: 'CLAVE_RESTABLECIDA',
          autor: autorDe(usuario),
          contexto,
          entidad: { tipo: 'usuario', id: usuario.id },
          detalle: { sesionesCerradas },
        });
      });
    },
  };
}
