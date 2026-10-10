import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import { ErrorAplicacion } from '../../compartido/errores.js';
import type { Contexto } from '../../compartido/peticion.js';
import type { Correo, Mensaje } from '../../correo/correo.js';
import { conTransaccion } from '../../db/transaccion.js';
import { registrarAccion, type Autor } from '../historial/historial.registro.js';
import { correoDeCambioDeCorreo, correoDeInvitacion, correoDeVerificacion } from './auth.correos.js';
import {
  anularEnlacesDe, bloquearCuentaParaEnlace, enviosRecientes, insertarEnlace, type CuentaParaEnlace, type Proposito,
} from './auth.repositorio.js';

/** Una invitación o una verificación valen 72 horas: quien la recibe puede no mirar el correo en el día. */
export const HORAS_DE_INVITACION = 72;
/** El freno de los reenvíos (D41), contado en la base para que un reinicio de Render no lo ponga a cero. */
export const ENVIOS = { minutosEntreEnvios: 2, porDia: 5 } as const;

/** El token viaja en el enlace; en la base solo queda su huella, que no sirve para nada. */
export const huella = (token: string) => createHash('sha256').update(token).digest('hex');

export type ResultadoDeEnvio =
  | { enviado: true; proposito: Proposito }
  /** «limitado»: se envió hace poco; «no_corresponde»: verificada, desactivada o inexistente; «fallo»: el correo no salió. */
  | { enviado: false; motivo: 'limitado' | 'no_corresponde' | 'fallo' };

interface Opciones {
  autor: Autor;
  contexto: Contexto;
  /**
   * Si un reenvío pedido a mano choca con el freno, se le dice a quien lo pidió («error»). Los automáticos
   * (al iniciar sesión o pedir una recuperación) lo callan, para no revelar nada ni bloquear.
   */
  siHayLimite: 'error' | 'callar';
  /** Esperar al correo: sí cuando lo pide un administrador, que quiere saber si salió; no al iniciar sesión. */
  esperarAlCorreo: boolean;
}

export type EnlacesDeCuenta = ReturnType<typeof crearEnlacesDeCuenta>;

/**
 * Las invitaciones y las verificaciones del correo (D41). Corre con la conexión dueña de las tablas, como el
 * resto de la capa de identidad: quien lo llama desde una empresa ya comprobó, con su propio acceso y su RLS,
 * que la cuenta es de su empresa. Aquí no se decide quién puede pedirlo, solo cuándo y qué se envía.
 */
export function crearEnlacesDeCuenta({ pool, correo, urlFrontend }: { pool: pg.Pool; correo: Correo; urlFrontend: string }) {
  const base = urlFrontend.replace(/\/$/, '');

  async function entregar(mensaje: Mensaje, esperar: boolean): Promise<boolean> {
    const envio = correo.enviar(mensaje).then(() => true, (error: unknown) => {
      console.error(`[correo] no se pudo enviar «${mensaje.asunto}»:`, error);
      return false;
    });
    return esperar ? envio : true;
  }

  return {
    /**
     * Manda a la cuenta su enlace pendiente: una invitación si aún no tiene contraseña, una verificación si
     * ya la tiene. Anula los anteriores y queda en el historial. No hace nada con una cuenta ya verificada.
     */
    async enviar(usuarioId: string, { autor, contexto, siHayLimite, esperarAlCorreo }: Opciones): Promise<ResultadoDeEnvio> {
      const token = randomBytes(32).toString('base64url');
      type Preparado = { listo: true; cuenta: CuentaParaEnlace; proposito: Proposito } | { listo: false; motivo: 'limitado' | 'no_corresponde' };
      const preparado = await conTransaccion(pool, async (cliente): Promise<Preparado> => {
        const cuenta = await bloquearCuentaParaEnlace(cliente, usuarioId);
        if (!cuenta || cuenta.verificado || !cuenta.activo || !cuenta.empresaActiva) return { listo: false, motivo: 'no_corresponde' };

        const { ultimo, enUnDia } = await enviosRecientes(cliente, usuarioId, cuenta.email);
        const esperaMs = ultimo ? ultimo.getTime() + ENVIOS.minutosEntreEnvios * 60_000 - Date.now() : 0;
        if (esperaMs > 0 || enUnDia >= ENVIOS.porDia) {
          if (siHayLimite === 'callar') return { listo: false, motivo: 'limitado' };
          throw new ErrorAplicacion(429, 'ENVIO_LIMITADO', enUnDia >= ENVIOS.porDia
            ? `Ya se enviaron ${ENVIOS.porDia} enlaces a esta cuenta en las últimas 24 horas. Vuelve a intentarlo mañana`
            : `Se envió un enlace hace muy poco. Espera ${Math.ceil(esperaMs / 60_000)} minuto(s) antes de reenviarlo`);
        }

        const proposito: Proposito = cuenta.tieneClave ? 'verificacion' : 'invitacion';
        await anularEnlacesDe(cliente, usuarioId);
        await insertarEnlace(cliente, { usuarioId, tokenHash: huella(token), minutos: HORAS_DE_INVITACION * 60, proposito, enviadoA: cuenta.email });
        await registrarAccion(cliente, {
          accion: proposito === 'invitacion' ? 'INVITACION_ENVIADA' : 'VERIFICACION_ENVIADA',
          autor, contexto, entidad: { tipo: 'usuario', id: usuarioId }, detalle: { email: cuenta.email },
        });
        return { listo: true, cuenta, proposito };
      });
      if (!preparado.listo) return { enviado: false, motivo: preparado.motivo };

      const { cuenta, proposito } = preparado;
      // El token va en el fragmento (#): el navegador no lo manda a ningún servidor ni queda en registros.
      const mensaje = proposito === 'invitacion'
        ? correoDeInvitacion({ para: cuenta.email, nombre: cuenta.nombre, empresa: cuenta.empresa, enlace: `${base}/activar-cuenta#${token}`, horas: HORAS_DE_INVITACION })
        : correoDeVerificacion({ para: cuenta.email, nombre: cuenta.nombre, enlace: `${base}/verificar-correo#${token}`, horas: HORAS_DE_INVITACION });
      return (await entregar(mensaje, esperarAlCorreo)) ? { enviado: true, proposito } : { enviado: false, motivo: 'fallo' };
    },

    /** Avisa al correo anterior de que el de acceso cambió. Si no sale, el cambio sigue en pie. */
    async avisarCambioDeCorreo({ anterior, nombre, nuevo }: { anterior: string; nombre: string; nuevo: string }): Promise<void> {
      await entregar(correoDeCambioDeCorreo({ para: anterior, nombre, nuevo }), false);
    },
  };
}
