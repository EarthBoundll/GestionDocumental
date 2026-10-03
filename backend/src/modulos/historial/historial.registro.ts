import { ErrorAplicacion } from '../../compartido/errores.js';
import type { Actor, Contexto, UsuarioAutenticado } from '../../compartido/peticion.js';
import type { Permiso, Rol } from '../../compartido/permisos.js';
import type { Consultor } from '../../db/pool.js';

/** Las acciones auditables de docs/01-analisis.md §7. La base rechaza cualquier otra. */
export const ACCIONES = [
  'SESION_INICIADA', 'SESION_FALLIDA', 'SESION_CERRADA', 'CLAVE_CAMBIADA', 'RECUPERACION_SOLICITADA',
  'CLAVE_RESTABLECIDA', 'EMPRESA_CREADA', 'EMPRESA_EDITADA', 'EMPRESA_DESACTIVADA', 'EMPRESA_REACTIVADA',
  'USUARIO_CREADO', 'USUARIO_EDITADO', 'USUARIO_DESACTIVADO', 'USUARIO_REACTIVADO', 'CATEGORIA_CREADA',
  'CATEGORIA_EDITADA', 'DOCUMENTO_SUBIDO', 'DOCUMENTO_EDITADO', 'DOCUMENTO_ELIMINADO', 'DOCUMENTO_VISUALIZADO',
  'DOCUMENTO_DESCARGADO', 'BUSQUEDA_REALIZADA', 'SOLICITUD_CREADA', 'SOLICITUD_APROBADA',
  'SOLICITUD_RECHAZADA', 'ACCESO_DENEGADO', 'HISTORIAL_EXPORTADO',
] as const;

export type AccionAuditable = (typeof ACCIONES)[number];
export type TipoEntidad = 'empresa' | 'usuario' | 'sesion' | 'categoria' | 'documento' | 'solicitud';

/** Quién actuó y en qué empresa queda el asiento. Todo nulo solo en un acceso con un correo desconocido. */
export interface Autor {
  empresaId: string | null;
  usuarioId: string | null;
  rol: Rol | null;
}

export interface RegistroDeAccion {
  accion: AccionAuditable;
  autor: Autor;
  contexto: Contexto;
  entidad?: { tipo: TipoEntidad; id: string };
  detalle?: Record<string, unknown>;
}

export const SIN_AUTOR: Autor = { empresaId: null, usuarioId: null, rol: null };

/** El autor es el usuario, y el asiento queda en su empresa (en ninguna, si es el Master en su cuenta). */
export function autorDe(usuario: Pick<UsuarioAutenticado, 'id' | 'empresaId' | 'rol'>): Autor {
  return { empresaId: usuario.empresaId, usuarioId: usuario.id, rol: usuario.rol };
}

/**
 * El Master actuando sobre una empresa: el asiento queda en esa empresa, para que su administrador
 * vea qué hizo la plataforma con ella. La base lo admite solo para el Master (CLAUDE.md v2).
 */
export function autorDelMasterSobre(master: Pick<UsuarioAutenticado, 'id'>, empresaId: string): Autor {
  return { empresaId, usuarioId: master.id, rol: 'master' };
}

/**
 * Añade una acción al historial. Quien registra una operación debe pasar el cliente de su
 * transacción, no el pool: así la operación y su registro se confirman o se deshacen juntos (D7).
 */
export async function registrarAccion(db: Consultor, { accion, autor, contexto, entidad, detalle }: RegistroDeAccion): Promise<void> {
  await db.query(
    `INSERT INTO historial (empresa_id, usuario_id, rol_usuario, accion, entidad_tipo, entidad_id, detalle, user_agent, es_movil)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [autor.empresaId, autor.usuarioId, autor.rol, accion, entidad?.tipo ?? null, entidad?.id ?? null,
      detalle ?? {}, contexto.userAgent, contexto.esMovil],
  );
}

/**
 * Lo que se exigía y no se cumplió: un permiso de rol (docs/01-analisis.md §6) o una regla de
 * propiedad, que también es control de acceso: pedir la aprobación de un documento ajeno, o resolver
 * la propia solicitud (RN12, RN13).
 */
export type Exigencia = Permiso | 'SER_PROPIETARIO' | 'NO_SER_EL_SOLICITANTE';

/**
 * Registra un acceso denegado (indicador 6) y devuelve el 403 que hay que lanzar. Se registra con el
 * acceso a datos del propio actor, así que el asiento queda en su empresa. Si no se puede registrar, se
 * deniega igual: denegar es lo seguro, y el fallo queda en el registro del servidor.
 */
export async function denegarAcceso(
  actor: Actor,
  exigencia: Exigencia,
  { entidad, detalle }: Pick<RegistroDeAccion, 'entidad' | 'detalle'> = {},
): Promise<ErrorAplicacion> {
  try {
    await actor.datos.ejecutar((db) => registrarAccion(db, {
      accion: 'ACCESO_DENEGADO',
      autor: autorDe(actor.autenticacion.usuario),
      contexto: actor.contexto,
      ...(entidad && { entidad }),
      detalle: { permiso: exigencia, ...detalle },
    }));
  } catch (error) {
    console.error('[historial] no se pudo registrar un acceso denegado:', error);
  }
  return new ErrorAplicacion(403, 'SIN_PERMISO', 'No tienes permiso para hacer esto');
}
