import { desplazamiento, type Paginacion } from '../../compartido/paginacion.js';
import type { Consultor } from '../../db/pool.js';

export type TipoNotificacion = 'SOLICITUD_CREADA' | 'SOLICITUD_APROBADA' | 'SOLICITUD_RECHAZADA';

export interface Notificacion {
  id: string;
  tipo: TipoNotificacion;
  mensaje: string;
  leida: boolean;
  creadaEn: Date;
  solicitudId: string;
  /** A dónde lleva al pulsarla: la ficha del documento muestra la solicitud (docs/04-api.md §6). */
  documentoId: string;
}

export interface NotificacionNueva {
  usuarioId: string;
  solicitudId: string;
  tipo: TipoNotificacion;
  mensaje: string;
}

/** Las notificaciones de una acción, en una sola sentencia: se insertan dentro de su transacción. */
export async function insertarNotificaciones(db: Consultor, empresaId: string, notificaciones: NotificacionNueva[]): Promise<void> {
  if (notificaciones.length === 0) return;
  await db.query(
    `INSERT INTO notificaciones (empresa_id, usuario_id, solicitud_id, tipo, mensaje)
     SELECT $1, * FROM unnest($2::uuid[], $3::uuid[], $4::text[], $5::text[])`,
    [
      empresaId,
      notificaciones.map((n) => n.usuarioId),
      notificaciones.map((n) => n.solicitudId),
      notificaciones.map((n) => n.tipo),
      notificaciones.map((n) => n.mensaje),
    ],
  );
}

export async function listarNotificaciones(
  db: Consultor,
  usuarioId: string,
  { soloNoLeidas, ...paginacion }: Paginacion & { soloNoLeidas: boolean },
): Promise<{ filas: Notificacion[]; total: number; noLeidas: number }> {
  const { rows: [conteo] } = await db.query<{ total: number; no_leidas: number }>(
    `SELECT count(*) FILTER (WHERE NOT $2 OR leida_en IS NULL)::int AS total,
            count(*) FILTER (WHERE leida_en IS NULL)::int AS no_leidas
     FROM notificaciones WHERE usuario_id = $1`,
    [usuarioId, soloNoLeidas],
  );
  const { rows } = await db.query<Notificacion>(
    `SELECT n.id, n.tipo, n.mensaje, n.leida_en IS NOT NULL AS leida, n.creada_en AS "creadaEn",
            n.solicitud_id AS "solicitudId", s.documento_id AS "documentoId"
     FROM notificaciones n JOIN solicitudes s ON s.id = n.solicitud_id
     WHERE n.usuario_id = $1 AND (NOT $2 OR n.leida_en IS NULL)
     ORDER BY n.creada_en DESC, n.id
     LIMIT $3 OFFSET $4`,
    [usuarioId, soloNoLeidas, paginacion.porPagina, desplazamiento(paginacion)],
  );
  return { filas: rows, total: conteo?.total ?? 0, noLeidas: conteo?.no_leidas ?? 0 };
}

/** Devuelve si la notificación existe y es del usuario. Marcarla dos veces no cambia la primera fecha. */
export async function marcarLeida(db: Consultor, usuarioId: string, id: string): Promise<boolean> {
  const { rowCount } = await db.query(
    'UPDATE notificaciones SET leida_en = coalesce(leida_en, now()) WHERE id = $1 AND usuario_id = $2',
    [id, usuarioId],
  );
  return rowCount === 1;
}

export async function marcarTodasLeidas(db: Consultor, usuarioId: string): Promise<void> {
  await db.query('UPDATE notificaciones SET leida_en = now() WHERE usuario_id = $1 AND leida_en IS NULL', [usuarioId]);
}
