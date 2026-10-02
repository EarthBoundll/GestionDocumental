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
export function condicionesDeBusqueda(organizacionId: string, filtros: Omit<FiltrosBusqueda, 'pagina' | 'porPagina' | 'orden'>) {
  const condiciones = ['d.organizacion_id = $1', 'd.eliminado_en IS NULL'];
  const parametros: unknown[] = [organizacionId];
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
  organizacionId: string,
  filtros: FiltrosBusqueda,
): Promise<{ filas: DocumentoResumen[]; total: number }> {
  const { where, parametros } = condicionesDeBusqueda(organizacionId, filtros);
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

/** Un documento vigente de la organización, con su última solicitud de aprobación (M6). */
export async function buscarDocumento(db: Consultor, organizacionId: string, id: string): Promise<DocumentoInterno | null> {
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
     WHERE d.organizacion_id = $1 AND d.id = $2 AND d.eliminado_en IS NULL`,
    [organizacionId, id],
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

export async function categoriaDeLaOrganizacion(
  db: Consultor,
  organizacionId: string,
  categoriaId: string,
): Promise<{ id: string; nombre: string; activa: boolean } | null> {
  const { rows } = await db.query<{ id: string; nombre: string; activa: boolean }>(
    'SELECT id, nombre, activa FROM categorias WHERE organizacion_id = $1 AND id = $2', [organizacionId, categoriaId]);
  return rows[0] ?? null;
}

export async function insertarDocumento(db: Consultor, datos: {
  id: string;
  organizacionId: string;
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
    `INSERT INTO documentos (id, organizacion_id, categoria_id, subido_por, nombre, descripcion, fecha_documento,
       archivo_nombre_original, archivo_ruta, archivo_tipo_mime, archivo_peso_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [datos.id, datos.organizacionId, datos.categoriaId, datos.subidoPor, datos.nombre, datos.descripcion,
      datos.fechaDocumento, datos.archivoNombreOriginal, datos.archivoRuta, datos.archivoTipoMime, datos.archivoPesoBytes],
  );
}

export async function actualizarDocumento(db: Consultor, organizacionId: string, id: string, valores: Record<string, unknown>): Promise<void> {
  const { sql, parametros } = clausulaSet(valores, COLUMNAS, 3);
  await db.query(
    `UPDATE documentos SET ${sql} WHERE organizacion_id = $1 AND id = $2 AND eliminado_en IS NULL`,
    [organizacionId, id, ...parametros],
  );
}

export async function marcarEliminado(db: Consultor, organizacionId: string, id: string): Promise<void> {
  await db.query(
    'UPDATE documentos SET eliminado_en = now() WHERE organizacion_id = $1 AND id = $2 AND eliminado_en IS NULL',
    [organizacionId, id],
  );
}
