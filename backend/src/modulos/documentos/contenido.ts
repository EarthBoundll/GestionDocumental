import { fragmentoDelContenido, type TrozoDeFragmento } from '../../compartido/contenido/fragmento.js';
import type { EstadoDelContenido, Lectura } from '../../compartido/contenido/leer.js';
import { candidatas, palabrasClave, type PalabrasClave } from '../../compartido/contenido/palabras-clave.js';
import type { Consultor } from '../../db/pool.js';

/*
 * El contenido de un documento (D45): el texto de su archivo vigente y sus palabras clave. Todo pasa por el
 * acceso del actor, con su RLS: nadie lee el contenido de un documento que no puede ver.
 */

/** Lo que se guarda en la fila del documento: el texto solo si se leyó, y sus palabras clave. */
export interface ContenidoDelDocumento {
  /** «pendiente»: todavía no se pudo leer; la tarea de lectura lo intenta en segundo plano. */
  estado: EstadoDelContenido | 'pendiente';
  texto: string | null;
  palabrasClave: PalabrasClave | null;
}

/**
 * Los documentos recientes de la empresa con los que se compara cada palabra para saber si es propia del
 * documento (TF-IDF). Una muestra fija: comparar con todos costaría más cuanto más grande fuera la empresa.
 */
const DOCUMENTOS_DE_REFERENCIA = 500;

/** Cuánto escasea cada palabra en la empresa: ln((1 + N) / (1 + documentos que la tienen)) + 1. */
async function rarezaEnLaEmpresa(db: Consultor, empresaId: string, palabras: string[]): Promise<(clave: string) => number> {
  if (palabras.length === 0) return () => 1;
  const { rows } = await db.query<{ palabra: string; documentos: number; total: number }>(
    `WITH referencia AS (
       SELECT busqueda, busqueda_contenido FROM documentos
       WHERE empresa_id = $1 AND eliminado_en IS NULL
       ORDER BY creado_en DESC LIMIT ${DOCUMENTOS_DE_REFERENCIA}
     )
     SELECT p.palabra,
            (SELECT count(*)::int FROM referencia r
             WHERE r.busqueda_contenido @@ plainto_tsquery('spanish', p.palabra) OR r.busqueda @@ plainto_tsquery('spanish', p.palabra)) AS documentos,
            (SELECT count(*)::int FROM referencia) AS total
     FROM unnest($2::text[]) AS p(palabra)`,
    [empresaId, palabras],
  );
  const total = rows[0]?.total ?? 0;
  const apariciones = new Map(rows.map((fila) => [fila.palabra, fila.documentos]));
  return (clave) => Math.log((1 + total) / (1 + (apariciones.get(clave) ?? 0))) + 1;
}

/** De lo leído en el archivo a lo que se guarda, con las palabras clave propias en esta empresa. Sin lectura, pendiente. */
export async function contenidoParaGuardar(db: Consultor, empresaId: string, lectura: Lectura | null): Promise<ContenidoDelDocumento> {
  if (!lectura) return { estado: 'pendiente', texto: null, palabrasClave: null };
  if (lectura.estado !== 'leido') return { estado: lectura.estado, texto: null, palabrasClave: null };
  const rareza = await rarezaEnLaEmpresa(db, empresaId, candidatas(lectura.texto));
  return { estado: 'leido', texto: lectura.texto, palabrasClave: palabrasClave(lectura.texto, rareza) };
}

export async function guardarContenido(db: Consultor, empresaId: string, documentoId: string, contenido: ContenidoDelDocumento): Promise<void> {
  await db.query(
    `UPDATE documentos SET contenido = $3, contenido_estado = $4, palabras_clave = $5
     WHERE empresa_id = $1 AND id = $2 AND eliminado_en IS NULL`,
    [empresaId, documentoId, contenido.texto, contenido.estado, contenido.palabrasClave],
  );
}

/**
 * Los fragmentos de los documentos de una página que coincidieron solo por su contenido: el texto de esas
 * filas, nunca el de toda la búsqueda, y con la RLS de siempre.
 */
export async function fragmentosDe(db: Consultor, empresaId: string, ids: string[], terminos: string[]): Promise<Map<string, TrozoDeFragmento[]>> {
  const fragmentos = new Map<string, TrozoDeFragmento[]>();
  if (ids.length === 0) return fragmentos;
  const { rows } = await db.query<{ id: string; contenido: string | null }>(
    'SELECT id, contenido FROM documentos WHERE empresa_id = $1 AND id = ANY($2::uuid[])', [empresaId, ids]);
  for (const { id, contenido } of rows) {
    const fragmento = contenido ? fragmentoDelContenido(contenido, terminos) : null;
    if (fragmento) fragmentos.set(id, fragmento);
  }
  return fragmentos;
}

export interface Pendiente {
  id: string;
  archivoRuta: string;
  tipoMime: string;
}

/** Lo que falta leer de una empresa: lo que existía antes de la 015, o una versión restaurada que no se pudo leer. */
export async function pendientesDeLeer(db: Consultor, empresaId: string, limite: number): Promise<Pendiente[]> {
  const { rows } = await db.query<{ id: string; archivo_ruta: string; archivo_tipo_mime: string }>(
    `SELECT id, archivo_ruta, archivo_tipo_mime FROM documentos
     WHERE empresa_id = $1 AND contenido_estado = 'pendiente' AND eliminado_en IS NULL
     ORDER BY creado_en LIMIT $2`,
    [empresaId, limite],
  );
  return rows.map((fila) => ({ id: fila.id, archivoRuta: fila.archivo_ruta, tipoMime: fila.archivo_tipo_mime }));
}

/**
 * Guarda lo leído de un pendiente si sigue pendiente y con el mismo archivo: la lectura se hizo fuera de la
 * transacción, y si entretanto subieron una versión nueva, lo de esa versión ya está guardado y gana.
 */
export async function guardarSiSiguePendiente(db: Consultor, empresaId: string, pendiente: Pendiente, contenido: ContenidoDelDocumento): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE documentos SET contenido = $4, contenido_estado = $5, palabras_clave = $6
     WHERE empresa_id = $1 AND id = $2 AND archivo_ruta = $3 AND contenido_estado = 'pendiente' AND eliminado_en IS NULL`,
    [empresaId, pendiente.id, pendiente.archivoRuta, contenido.texto, contenido.estado, contenido.palabrasClave],
  );
  return rowCount === 1;
}
