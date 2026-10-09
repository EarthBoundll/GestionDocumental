import { desplazamiento } from '../../compartido/paginacion.js';
import { primeraFila } from '../../db/filas.js';
import type { Consultor } from '../../db/pool.js';
import type { FiltroSolicitudes } from './solicitudes.esquemas.js';

export type EstadoSolicitud = 'pendiente' | 'aprobada' | 'rechazada';

export interface Solicitud {
  id: string;
  estado: EstadoSolicitud;
  /** `eliminado` si se borró después de resolverse: la solicitud sigue en la lista, pero sin enlace. */
  documento: { id: string; nombre: string; eliminado: boolean };
  solicitante: { id: string; nombre: string };
  revisor: { id: string; nombre: string } | null;
  comentarioSolicitud: string | null;
  comentarioResolucion: string | null;
  creadaEn: Date;
  resueltaEn: Date | null;
}

interface FilaSolicitud {
  id: string;
  estado: EstadoSolicitud;
  documento_id: string;
  documento_nombre: string;
  documento_eliminado: boolean;
  solicitante_id: string;
  solicitante_nombre: string;
  revisor_id: string | null;
  revisor_nombre: string | null;
  comentario_solicitud: string | null;
  comentario_resolucion: string | null;
  creada_en: Date;
  resuelta_en: Date | null;
}

const SELECCION = `
  SELECT s.id, s.estado, d.id AS documento_id, d.nombre AS documento_nombre, d.eliminado_en IS NOT NULL AS documento_eliminado,
         sol.id AS solicitante_id, sol.nombre AS solicitante_nombre, rev.id AS revisor_id, rev.nombre AS revisor_nombre,
         s.comentario_solicitud, s.comentario_resolucion, s.creada_en, s.resuelta_en
  FROM solicitudes s
  JOIN documentos d ON d.id = s.documento_id
  JOIN usuarios sol ON sol.id = s.solicitante_id
  LEFT JOIN usuarios rev ON rev.id = s.revisor_id`;

function aSolicitud(fila: FilaSolicitud): Solicitud {
  return {
    id: fila.id,
    estado: fila.estado,
    documento: { id: fila.documento_id, nombre: fila.documento_nombre, eliminado: fila.documento_eliminado },
    solicitante: { id: fila.solicitante_id, nombre: fila.solicitante_nombre },
    revisor: fila.revisor_id ? { id: fila.revisor_id, nombre: fila.revisor_nombre! } : null,
    comentarioSolicitud: fila.comentario_solicitud,
    comentarioResolucion: fila.comentario_resolucion,
    creadaEn: fila.creada_en,
    resueltaEn: fila.resuelta_en,
  };
}

export async function buscarSolicitud(db: Consultor, empresaId: string, id: string): Promise<Solicitud | null> {
  const { rows } = await db.query<FilaSolicitud>(`${SELECCION} WHERE s.empresa_id = $1 AND s.id = $2`, [empresaId, id]);
  return rows[0] ? aSolicitud(rows[0]) : null;
}

/** Las de la empresa, o solo las de un solicitante. Las pendientes primero: son las que esperan a alguien. */
export async function listarSolicitudes(
  db: Consultor,
  empresaId: string,
  { soloDe, ...filtro }: FiltroSolicitudes & { soloDe: string | undefined },
): Promise<{ filas: Solicitud[]; total: number }> {
  const where = `s.empresa_id = $1 AND ($2::uuid IS NULL OR s.solicitante_id = $2) AND ($3::text IS NULL OR s.estado = $3)`;
  const parametros = [empresaId, soloDe ?? null, filtro.estado ?? null];
  const { rows: [conteo] } = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM solicitudes s WHERE ${where}`, parametros);
  const { rows } = await db.query<FilaSolicitud>(
    `${SELECCION} WHERE ${where}
     ORDER BY s.estado = 'pendiente' DESC, s.creada_en DESC, s.id
     LIMIT $4 OFFSET $5`,
    [...parametros, filtro.porPagina, desplazamiento(filtro)],
  );
  return { filas: rows.map(aSolicitud), total: conteo?.total ?? 0 };
}

export async function insertarSolicitud(
  db: Consultor,
  datos: { empresaId: string; documentoId: string; solicitanteId: string; comentario: string | null },
): Promise<string> {
  // El documento se bloquea antes, como al subir una versión (bloquearParaVersion): si una versión nueva
  // está a medio guardar, esta solicitud espera y después pide la aprobación de esa versión (D30).
  await db.query('SELECT 1 FROM documentos WHERE empresa_id = $1 AND id = $2 FOR UPDATE', [datos.empresaId, datos.documentoId]);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO solicitudes (empresa_id, documento_id, solicitante_id, comentario_solicitud, version)
     SELECT $1, $2, $3, $4, d.version FROM documentos d WHERE d.empresa_id = $1 AND d.id = $2
     RETURNING id`,
    [datos.empresaId, datos.documentoId, datos.solicitanteId, datos.comentario],
  );
  return primeraFila(rows).id;
}

/**
 * Resuelve solo si sigue pendiente. Si dos administradores resuelven a la vez, el segundo no
 * encuentra nada que actualizar, y se le responde que ya estaba resuelta (§4.4).
 */
export async function resolverSiPendiente(
  db: Consultor,
  datos: { empresaId: string; id: string; estado: Exclude<EstadoSolicitud, 'pendiente'>; revisorId: string; comentario: string | null },
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE solicitudes SET estado = $3, revisor_id = $4, comentario_resolucion = $5, resuelta_en = now()
     WHERE empresa_id = $1 AND id = $2 AND estado = 'pendiente'`,
    [datos.empresaId, datos.id, datos.estado, datos.revisorId, datos.comentario],
  );
  return rowCount === 1;
}

/** Los administradores activos que pueden resolver una solicitud de ese usuario: todos menos él (RN13). */
export async function revisoresPosibles(db: Consultor, empresaId: string, solicitanteId: string): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM usuarios
     WHERE empresa_id = $1 AND rol = 'administrador' AND activo AND id <> $2`,
    [empresaId, solicitanteId],
  );
  return rows.map((fila) => fila.id);
}
