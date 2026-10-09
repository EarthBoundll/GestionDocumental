import type { Consultor } from '../../db/pool.js';

/** Una versión de un documento (RF34). La vigente es la de número más alto. */
export interface Version {
  numero: number;
  archivo: { nombreOriginal: string; tipoMime: string; pesoBytes: number };
  subidaPor: { id: string; nombre: string };
  comentario: string | null;
  /** Si es una restauración, de qué versión se copió. */
  restauradaDe: number | null;
  creadaEn: Date;
}

/** Lo que solo el servidor necesita: dónde está el archivo de la versión. */
export interface VersionInterna extends Version {
  archivoRuta: string;
}

interface FilaVersion {
  numero: number;
  archivo_nombre_original: string;
  archivo_tipo_mime: string;
  archivo_peso_bytes: number;
  archivo_ruta: string;
  subida_por: string;
  subida_por_nombre: string;
  comentario: string | null;
  restaurada_de: number | null;
  creada_en: Date;
}

const SELECCION = `
  SELECT v.numero, v.archivo_nombre_original, v.archivo_tipo_mime, v.archivo_peso_bytes, v.archivo_ruta,
         v.subida_por, u.nombre AS subida_por_nombre, v.comentario, v.restaurada_de, v.creada_en
  FROM documento_versiones v
  JOIN usuarios u ON u.id = v.subida_por`;

function aVersion(fila: FilaVersion): VersionInterna {
  return {
    numero: fila.numero,
    archivo: { nombreOriginal: fila.archivo_nombre_original, tipoMime: fila.archivo_tipo_mime, pesoBytes: fila.archivo_peso_bytes },
    subidaPor: { id: fila.subida_por, nombre: fila.subida_por_nombre },
    comentario: fila.comentario,
    restauradaDe: fila.restaurada_de,
    creadaEn: fila.creada_en,
    archivoRuta: fila.archivo_ruta,
  };
}

/** Todas las versiones de un documento, la más reciente primero. */
export async function listarVersiones(db: Consultor, empresaId: string, documentoId: string): Promise<VersionInterna[]> {
  const { rows } = await db.query<FilaVersion>(
    `${SELECCION} WHERE v.empresa_id = $1 AND v.documento_id = $2 ORDER BY v.numero DESC`, [empresaId, documentoId]);
  return rows.map(aVersion);
}

export async function buscarVersion(db: Consultor, empresaId: string, documentoId: string, numero: number): Promise<VersionInterna | null> {
  const { rows } = await db.query<FilaVersion>(
    `${SELECCION} WHERE v.empresa_id = $1 AND v.documento_id = $2 AND v.numero = $3`, [empresaId, documentoId, numero]);
  const fila = rows[0];
  return fila ? aVersion(fila) : null;
}

/**
 * Bloquea el documento vigente hasta el final de la transacción y dice su versión y si tiene una
 * solicitud pendiente. Dos versiones subidas a la vez se ordenan aquí: la segunda espera y toma el
 * número siguiente. Pedir la aprobación toma el mismo bloqueo (insertarSolicitud), así que una versión
 * y una solicitud a la vez también se ordenan.
 */
export async function bloquearParaVersion(
  db: Consultor,
  empresaId: string,
  documentoId: string,
): Promise<{ nombre: string; version: number; pendiente: boolean } | null> {
  const { rows: [documento] } = await db.query<{ nombre: string; version: number }>(
    `SELECT nombre, version FROM documentos
     WHERE empresa_id = $1 AND id = $2 AND eliminado_en IS NULL
     FOR UPDATE`,
    [empresaId, documentoId],
  );
  if (!documento) return null;
  // En otra sentencia, ya con el bloqueo: así ve la solicitud que otra transacción confirmó mientras se
  // esperaba. Dentro de la misma, la subconsulta usaría la foto de antes de esperar.
  const { rows: [solicitud] } = await db.query<{ pendiente: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM solicitudes WHERE documento_id = $1 AND estado = 'pendiente') AS pendiente",
    [documentoId],
  );
  return { ...documento, pendiente: solicitud?.pendiente ?? false };
}

export interface NuevaVersion {
  empresaId: string;
  documentoId: string;
  numero: number;
  archivoNombreOriginal: string;
  archivoRuta: string;
  archivoTipoMime: string;
  archivoPesoBytes: number;
  subidaPor: string;
  comentario: string | null;
  restauradaDe: number | null;
}

/** Guarda la versión y la hace vigente en el documento, en la misma transacción. */
export async function insertarVersion(db: Consultor, version: NuevaVersion): Promise<void> {
  await db.query(
    `INSERT INTO documento_versiones (empresa_id, documento_id, numero, archivo_nombre_original, archivo_ruta,
       archivo_tipo_mime, archivo_peso_bytes, subida_por, comentario, restaurada_de)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [version.empresaId, version.documentoId, version.numero, version.archivoNombreOriginal, version.archivoRuta,
      version.archivoTipoMime, version.archivoPesoBytes, version.subidaPor, version.comentario, version.restauradaDe],
  );
}

export async function hacerVigente(db: Consultor, version: NuevaVersion): Promise<void> {
  await db.query(
    `UPDATE documentos SET version = $3, archivo_nombre_original = $4, archivo_ruta = $5, archivo_tipo_mime = $6,
       archivo_peso_bytes = $7
     WHERE empresa_id = $1 AND id = $2 AND eliminado_en IS NULL`,
    [version.empresaId, version.documentoId, version.numero, version.archivoNombreOriginal, version.archivoRuta,
      version.archivoTipoMime, version.archivoPesoBytes],
  );
}

/** Las rutas de todas las versiones: purgar un documento borra el archivo de cada una (D30). */
export async function rutasDeVersiones(db: Consultor, empresaId: string, documentoId: string): Promise<string[]> {
  const { rows } = await db.query<{ ruta: string }>(
    'SELECT archivo_ruta AS ruta FROM documento_versiones WHERE empresa_id = $1 AND documento_id = $2 ORDER BY numero',
    [empresaId, documentoId],
  );
  return rows.map((fila) => fila.ruta);
}
