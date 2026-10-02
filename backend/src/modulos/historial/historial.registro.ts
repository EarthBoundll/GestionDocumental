import { ErrorAplicacion } from '../../compartido/errores.js';
import type { Actor, Contexto, UsuarioAutenticado } from '../../compartido/peticion.js';
import type { Permiso, Rol } from '../../compartido/permisos.js';
import type { Consultor } from '../../db/pool.js';

/** Las 22 acciones auditables de docs/01-analisis.md §7. La base rechaza cualquier otra. */
export const ACCIONES = [
  'ORGANIZACION_REGISTRADA', 'SESION_INICIADA', 'SESION_FALLIDA', 'SESION_CERRADA', 'CLAVE_CAMBIADA',
  'USUARIO_CREADO', 'USUARIO_EDITADO', 'USUARIO_DESACTIVADO', 'USUARIO_REACTIVADO', 'CATEGORIA_CREADA',
  'CATEGORIA_EDITADA', 'DOCUMENTO_SUBIDO', 'DOCUMENTO_EDITADO', 'DOCUMENTO_ELIMINADO',
  'DOCUMENTO_VISUALIZADO', 'DOCUMENTO_DESCARGADO', 'BUSQUEDA_REALIZADA', 'SOLICITUD_CREADA',
  'SOLICITUD_APROBADA', 'SOLICITUD_RECHAZADA', 'ACCESO_DENEGADO', 'HISTORIAL_EXPORTADO',
] as const;

export type AccionAuditable = (typeof ACCIONES)[number];
export type TipoEntidad = 'organizacion' | 'usuario' | 'sesion' | 'categoria' | 'documento' | 'solicitud';

/** Quién actuó. Todo nulo solo en un inicio de sesión fallido con un correo que no existe. */
export interface Autor {
  organizacionId: string | null;
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

export const SIN_AUTOR: Autor = { organizacionId: null, usuarioId: null, rol: null };

export function autorDe(usuario: Pick<UsuarioAutenticado, 'id' | 'organizacionId' | 'rol'>): Autor {
  return { organizacionId: usuario.organizacionId, usuarioId: usuario.id, rol: usuario.rol };
}

/**
 * Añade una acción al historial. Quien registra una operación debe pasar el cliente de su
 * transacción, no el pool: así la operación y su registro se confirman o se deshacen juntos (D7).
 */
export async function registrarAccion(db: Consultor, { accion, autor, contexto, entidad, detalle }: RegistroDeAccion): Promise<void> {
  await db.query(
    `INSERT INTO historial (organizacion_id, usuario_id, rol_usuario, accion, entidad_tipo, entidad_id, detalle, user_agent, es_movil)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [autor.organizacionId, autor.usuarioId, autor.rol, accion, entidad?.tipo ?? null, entidad?.id ?? null,
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
 * Registra un acceso denegado (indicador 6) y devuelve el 403 que hay que lanzar. Si no se puede
 * registrar, se deniega igual: denegar es lo seguro, y el fallo queda en el registro del servidor.
 */
export async function denegarAcceso(
  db: Consultor,
  actor: Actor,
  exigencia: Exigencia,
  { entidad, detalle }: Pick<RegistroDeAccion, 'entidad' | 'detalle'> = {},
): Promise<ErrorAplicacion> {
  try {
    await registrarAccion(db, {
      accion: 'ACCESO_DENEGADO',
      autor: autorDe(actor.autenticacion.usuario),
      contexto: actor.contexto,
      ...(entidad && { entidad }),
      detalle: { permiso: exigencia, ...detalle },
    });
  } catch (error) {
    console.error('[historial] no se pudo registrar un acceso denegado:', error);
  }
  return new ErrorAplicacion(403, 'SIN_PERMISO', 'No tienes permiso para hacer esto');
}
