import { desplazamiento } from '../../compartido/paginacion.js';
import { clausulaSet } from '../../db/actualizacion.js';
import type { Consultor } from '../../db/pool.js';
import type { FiltrosBusqueda } from './documentos.esquemas.js';

export interface DocumentoResumen {
  id: string;
  nombre: string;
  fechaDocumento: string;
  categoria: { id: string; nombre: string };
  subidoPor: { id: string; nombre: string };
  archivo: { tipoMime: string; pesoBytes: number };
  creadoEn: Date;
}

export interface UltimaSolicitud {
  id: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  solicitante: { id: string; nombre: string };
  revisor: { id: string; nombre: string } | null;
  comentarioSolicitud: string | null;
  comentarioResolucion: string | null;
  creadaEn: Date;
  resueltaEn: Date | null;
}

export interface Documento extends Omit<DocumentoResumen, 'archivo'> {
  descripcion: string | null;
  archivo: { nombreOriginal: string; tipoMime: string; pesoBytes: number };
  actualizadoEn: Date;
  ultimaSolicitud: UltimaSolicitud | null;
}

/** Lo que solo el servidor necesita y nunca sale en una respuesta. */
export interface DocumentoInterno extends Documento {
  archivoRuta: string;
}

const COLUMNAS = {
  nombre: 'nombre', categoriaId: 'categoria_id', fechaDocumento: 'fecha_documento', descripcion: 'descripcion',
};

const ORDEN = {
  recientes: 'd.creado_en DESC, d.id',
  fecha: 'd.fecha_documento DESC, d.creado_en DESC, d.id',
  nombre: 'normalizar(d.nombre), d.id',
} as const;

/** En LIKE, «%» y «_» son comodines; quien busca «10%» busca el texto «10%». */
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

/** El WHERE de una búsqueda. Se exporta para comprobar en las pruebas que usa el índice de trigramas. */
export function condicionesDeBusqueda(empresaId: string, filtros: Omit<FiltrosBusqueda, 'pagina' | 'porPagina' | 'orden'>) {
  const condiciones = ['d.empresa_id = $1', 'd.eliminado_en IS NULL'];
  const parametros: unknown[] = [empresaId];
  const agregar = (condicion: (parametro: string) => string, valor: unknown) => {
    parametros.push(valor);
    condiciones.push(condicion(`$${parametros.length}`));
  };
  if (filtros.q) agregar((p) => `normalizar(d.nombre) LIKE '%' || normalizar(${p}) || '%' ESCAPE '\\'`, escaparLike(filtros.q));
  if (filtros.categoriaId) agregar((p) => `d.categoria_id = ${p}`, filtros.categoriaId);
  if (filtros.desde) agregar((p) => `d.fecha_documento >= ${p}`, filtros.desde);
  if (filtros.hasta) agregar((p) => `d.fecha_documento <= ${p}`, filtros.hasta);
  return { where: condiciones.join(' AND '), parametros };
}

interface FilaResumen {
  id: string;
  nombre: string;
  fecha_documento: string;
  categoria_id: string;
  categoria_nombre: string;
  subido_por: string;
  subido_por_nombre: string;
  archivo_tipo_mime: string;
  archivo_peso_bytes: number;
  creado_en: Date;
}

const SELECCION_RESUMEN = `
  SELECT d.id, d.nombre, d.fecha_documento, d.categoria_id, c.nombre AS categoria_nombre, d.subido_por,
         u.nombre AS subido_por_nombre, d.archivo_tipo_mime, d.archivo_peso_bytes, d.creado_en
  FROM documentos d
  JOIN categorias c ON c.id = d.categoria_id
  JOIN usuarios u ON u.id = d.subido_por`;

function aResumen(fila: FilaResumen): DocumentoResumen {
  return {
    id: fila.id,
    nombre: fila.nombre,
    fechaDocumento: fila.fecha_documento,
    categoria: { id: fila.categoria_id, nombre: fila.categoria_nombre },
    subidoPor: { id: fila.subido_por, nombre: fila.subido_por_nombre },
    archivo: { tipoMime: fila.archivo_tipo_mime, pesoBytes: fila.archivo_peso_bytes },
    creadoEn: fila.creado_en,
  };
}

export async function buscarDocumentos(
  db: Consultor,
  empresaId: string,
  filtros: FiltrosBusqueda,
): Promise<{ filas: DocumentoResumen[]; total: number }> {
  const { where, parametros } = condicionesDeBusqueda(empresaId, filtros);
  const { rows: [conteo] } = await db.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM documentos d WHERE ${where}`, parametros);
  const { rows } = await db.query<FilaResumen>(
    `${SELECCION_RESUMEN} WHERE ${where} ORDER BY ${ORDEN[filtros.orden]}
     LIMIT $${parametros.length + 1} OFFSET $${parametros.length + 2}`,
    [...parametros, filtros.porPagina, desplazamiento(filtros)],
  );
  return { filas: rows.map(aResumen), total: conteo?.total ?? 0 };
}

interface FilaDocumento extends FilaResumen {
  descripcion: string | null;
  archivo_nombre_original: string;
  archivo_ruta: string;
  actualizado_en: Date;
  s_id: string | null;
  s_estado: UltimaSolicitud['estado'] | null;
  s_solicitante_id: string | null;
  s_solicitante_nombre: string | null;
  s_revisor_id: string | null;
  s_revisor_nombre: string | null;
  s_comentario_solicitud: string | null;
  s_comentario_resolucion: string | null;
  s_creada_en: Date | null;
  s_resuelta_en: Date | null;
}

/** Un documento vigente de la empresa, con su última solicitud de aprobación (M6). */
export async function buscarDocumento(db: Consultor, empresaId: string, id: string): Promise<DocumentoInterno | null> {
  const { rows } = await db.query<FilaDocumento>(
    `SELECT d.id, d.nombre, d.fecha_documento, d.categoria_id, c.nombre AS categoria_nombre, d.subido_por,
            u.nombre AS subido_por_nombre, d.archivo_tipo_mime, d.archivo_peso_bytes, d.creado_en,
            d.descripcion, d.archivo_nombre_original, d.archivo_ruta, d.actualizado_en,
            s.id AS s_id, s.estado AS s_estado, s.solicitante_id AS s_solicitante_id, sol.nombre AS s_solicitante_nombre,
            s.revisor_id AS s_revisor_id, rev.nombre AS s_revisor_nombre, s.comentario_solicitud AS s_comentario_solicitud,
            s.comentario_resolucion AS s_comentario_resolucion, s.creada_en AS s_creada_en, s.resuelta_en AS s_resuelta_en
     FROM documentos d
     JOIN categorias c ON c.id = d.categoria_id
     JOIN usuarios u ON u.id = d.subido_por
     LEFT JOIN LATERAL (
       SELECT * FROM solicitudes WHERE documento_id = d.id ORDER BY creada_en DESC LIMIT 1
     ) s ON true
     LEFT JOIN usuarios sol ON sol.id = s.solicitante_id
     LEFT JOIN usuarios rev ON rev.id = s.revisor_id
     WHERE d.empresa_id = $1 AND d.id = $2 AND d.eliminado_en IS NULL`,
    [empresaId, id],
  );
  const fila = rows[0];
  if (!fila) return null;
  return {
    ...aResumen(fila),
    descripcion: fila.descripcion,
    archivo: { nombreOriginal: fila.archivo_nombre_original, tipoMime: fila.archivo_tipo_mime, pesoBytes: fila.archivo_peso_bytes },
    actualizadoEn: fila.actualizado_en,
    archivoRuta: fila.archivo_ruta,
    ultimaSolicitud: fila.s_id === null ? null : {
      id: fila.s_id,
      estado: fila.s_estado!,
      solicitante: { id: fila.s_solicitante_id!, nombre: fila.s_solicitante_nombre! },
      revisor: fila.s_revisor_id ? { id: fila.s_revisor_id, nombre: fila.s_revisor_nombre! } : null,
      comentarioSolicitud: fila.s_comentario_solicitud,
      comentarioResolucion: fila.s_comentario_resolucion,
      creadaEn: fila.s_creada_en!,
      resueltaEn: fila.s_resuelta_en,
    },
  };
}

export async function categoriaDeLaEmpresa(
  db: Consultor,
  empresaId: string,
  categoriaId: string,
): Promise<{ id: string; nombre: string; activa: boolean } | null> {
  const { rows } = await db.query<{ id: string; nombre: string; activa: boolean }>(
    'SELECT id, nombre, activa FROM categorias WHERE empresa_id = $1 AND id = $2', [empresaId, categoriaId]);
  return rows[0] ?? null;
}

export async function insertarDocumento(db: Consultor, datos: {
  id: string;
  empresaId: string;
  categoriaId: string;
  subidoPor: string;
  nombre: string;
  descripcion: string | null;
  fechaDocumento: string;
  archivoNombreOriginal: string;
  archivoRuta: string;
  archivoTipoMime: string;
  archivoPesoBytes: number;
}): Promise<void> {
  await db.query(
    `INSERT INTO documentos (id, empresa_id, categoria_id, subido_por, nombre, descripcion, fecha_documento,
       archivo_nombre_original, archivo_ruta, archivo_tipo_mime, archivo_peso_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [datos.id, datos.empresaId, datos.categoriaId, datos.subidoPor, datos.nombre, datos.descripcion,
      datos.fechaDocumento, datos.archivoNombreOriginal, datos.archivoRuta, datos.archivoTipoMime, datos.archivoPesoBytes],
  );
}

export async function actualizarDocumento(db: Consultor, empresaId: string, id: string, valores: Record<string, unknown>): Promise<void> {
  const { sql, parametros } = clausulaSet(valores, COLUMNAS, 3);
  await db.query(
    `UPDATE documentos SET ${sql} WHERE empresa_id = $1 AND id = $2 AND eliminado_en IS NULL`,
    [empresaId, id, ...parametros],
  );
}

export async function marcarEliminado(db: Consultor, empresaId: string, id: string, eliminadoPor: string): Promise<void> {
  await db.query(
    'UPDATE documentos SET eliminado_en = now(), eliminado_por = $3 WHERE empresa_id = $1 AND id = $2 AND eliminado_en IS NULL',
    [empresaId, id, eliminadoPor],
  );
}

/** Un documento de la papelera: eliminado y aún no purgado (RF26). */
export interface DocumentoEnPapelera {
  id: string;
  nombre: string;
  categoria: { id: string; nombre: string };
  subidoPor: { id: string; nombre: string };
  /** Null en lo eliminado antes de la 005, cuando aún no se guardaba quién. */
  eliminadoPor: { id: string; nombre: string } | null;
  eliminadoEn: Date;
  /** Cuándo se purgará solo si nadie lo restaura. */
  purgaEn: Date;
  archivo: { tipoMime: string; pesoBytes: number };
}

interface FilaPapelera {
  id: string;
  nombre: string;
  categoria_id: string;
  categoria_nombre: string;
  subido_por: string;
  subido_por_nombre: string;
  eliminado_por: string | null;
  eliminado_por_nombre: string | null;
  eliminado_en: Date;
  purga_en: Date;
  archivo_tipo_mime: string;
  archivo_peso_bytes: number;
}

export async function listarPapelera(
  db: Consultor,
  empresaId: string,
  { pagina, porPagina, dias }: { pagina: number; porPagina: number; dias: number },
): Promise<{ filas: DocumentoEnPapelera[]; total: number }> {
  const condicion = 'd.empresa_id = $1 AND d.eliminado_en IS NOT NULL AND d.purgado_en IS NULL';
  const { rows: [conteo] } = await db.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM documentos d WHERE ${condicion}`, [empresaId]);
  const { rows } = await db.query<FilaPapelera>(
    `SELECT d.id, d.nombre, d.categoria_id, c.nombre AS categoria_nombre, d.subido_por, u.nombre AS subido_por_nombre,
            d.eliminado_por, e.nombre AS eliminado_por_nombre, d.eliminado_en,
            d.eliminado_en + make_interval(days => $2) AS purga_en, d.archivo_tipo_mime, d.archivo_peso_bytes
     FROM documentos d
     JOIN categorias c ON c.id = d.categoria_id
     JOIN usuarios u ON u.id = d.subido_por
     LEFT JOIN usuarios e ON e.id = d.eliminado_por
     WHERE ${condicion}
     ORDER BY d.eliminado_en DESC, d.id
     LIMIT $3 OFFSET $4`,
    [empresaId, dias, porPagina, desplazamiento({ pagina, porPagina })],
  );
  return {
    filas: rows.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      categoria: { id: fila.categoria_id, nombre: fila.categoria_nombre },
      subidoPor: { id: fila.subido_por, nombre: fila.subido_por_nombre },
      eliminadoPor: fila.eliminado_por ? { id: fila.eliminado_por, nombre: fila.eliminado_por_nombre! } : null,
      eliminadoEn: fila.eliminado_en,
      purgaEn: fila.purga_en,
      archivo: { tipoMime: fila.archivo_tipo_mime, pesoBytes: fila.archivo_peso_bytes },
    })),
    total: conteo?.total ?? 0,
  };
}

/** Lo que hace falta para restaurar o purgar un documento de la papelera, bloqueado hasta terminar. */
export async function bloquearEnPapelera(
  db: Consultor,
  empresaId: string,
  id: string,
): Promise<{ id: string; nombre: string; archivoRuta: string } | null> {
  const { rows } = await db.query<{ id: string; nombre: string; archivoRuta: string }>(
    `SELECT id, nombre, archivo_ruta AS "archivoRuta" FROM documentos
     WHERE empresa_id = $1 AND id = $2 AND eliminado_en IS NOT NULL AND purgado_en IS NULL
     FOR UPDATE`,
    [empresaId, id],
  );
  return rows[0] ?? null;
}

/**
 * Los documentos de la papelera de la empresa que llevan más de `dias` eliminados. SKIP LOCKED: si dos
 * instancias purgan a la vez, cada documento lo purga una sola.
 */
export async function bloquearVencidos(
  db: Consultor,
  empresaId: string,
  { dias, limite }: { dias: number; limite: number },
): Promise<{ id: string; nombre: string; archivoRuta: string }[]> {
  const { rows } = await db.query<{ id: string; nombre: string; archivoRuta: string }>(
    `SELECT id, nombre, archivo_ruta AS "archivoRuta" FROM documentos
     WHERE empresa_id = $1 AND eliminado_en IS NOT NULL AND purgado_en IS NULL
       AND eliminado_en < now() - make_interval(days => $2)
     ORDER BY eliminado_en
     LIMIT $3
     FOR UPDATE SKIP LOCKED`,
    [empresaId, dias, limite],
  );
  return rows;
}

export async function restaurarDocumento(db: Consultor, empresaId: string, id: string): Promise<void> {
  await db.query(
    'UPDATE documentos SET eliminado_en = NULL, eliminado_por = NULL WHERE empresa_id = $1 AND id = $2 AND purgado_en IS NULL',
    [empresaId, id],
  );
}

export async function marcarPurgado(db: Consultor, empresaId: string, id: string): Promise<void> {
  await db.query(
    'UPDATE documentos SET purgado_en = now() WHERE empresa_id = $1 AND id = $2 AND eliminado_en IS NOT NULL',
    [empresaId, id],
  );
}
