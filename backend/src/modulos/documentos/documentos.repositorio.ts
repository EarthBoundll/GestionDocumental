import { desplazamiento } from '../../compartido/paginacion.js';
import { clausulaSet } from '../../db/actualizacion.js';
import type { Consultor } from '../../db/pool.js';
import { GRUPOS_DE_TIPO } from '../../compartido/tipos-de-archivo.js';
import { admiteParecido, COINCIDENCIAS, terminosDeBusqueda, UMBRAL_DE_PARECIDO, type Coincidencia } from './busqueda.js';
import type { FiltrosBusqueda, FiltrosDelListado } from './documentos.esquemas.js';

export interface DocumentoResumen {
  id: string;
  nombre: string;
  fechaDocumento: string;
  categoria: { id: string; nombre: string };
  subidoPor: { id: string; nombre: string };
  archivo: { tipoMime: string; pesoBytes: number };
  creadoEn: Date;
  /** Con texto en la búsqueda: dónde coincidió (D42). */
  coincidencia?: Coincidencia;
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
  /** La versión que se pidió aprobar (D30): con una versión nueva, la aprobación no la cubre. */
  version: number;
}

export interface Documento extends Omit<DocumentoResumen, 'archivo'> {
  descripcion: string | null;
  archivo: { nombreOriginal: string; tipoMime: string; pesoBytes: number };
  /** El número de la versión vigente (RF34). */
  version: number;
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

/** El orden de una página. «relevancia» solo tiene sentido con texto: sin él, se ordena por lo reciente. */
export type Orden = 'relevancia' | 'recientes' | 'fecha' | 'nombre';

const ORDEN: Record<Exclude<Orden, 'relevancia'>, string> = {
  recientes: 'd.creado_en DESC, d.id',
  fecha: 'd.fecha_documento DESC, d.creado_en DESC, d.id',
  nombre: 'd.busqueda_nombre, d.id',
};

type FiltrosDeConsulta = Omit<FiltrosBusqueda, 'pagina' | 'porPagina' | 'orden'>;

/** Agrega un valor a los parámetros de la consulta y devuelve cómo nombrarlo en el SQL («$7»). */
type Agregar = (valor: unknown) => string;

/** Una búsqueda ya armada: de dónde lee, qué exige y, si hay texto, cómo se ordena por relevancia. */
export interface ConsultaDeBusqueda {
  desde: string;
  where: string;
  parametros: unknown[];
  /**
   * Con texto: el nivel de COINCIDENCIAS (1 es el mejor) y, para desempatar, el puntaje. Cada uno agrega
   * sus propios parámetros al usarse: PostgreSQL rechaza un parámetro que la consulta no nombra.
   */
  relevancia: { nivel(agregar: Agregar): string; puntaje(agregar: Agregar): string } | null;
}

/**
 * La búsqueda (RF10, D42). Cada palabra tiene que aparecer en algún sitio del documento: como parte de
 * una palabra en el nombre, el archivo o la descripción («contra» en «contrato», «0245» en «F001-0245»),
 * por su raíz en español («facturas» encuentra «factura») o en el nombre de su categoría. Con
 * `parecidos`, además, por similitud de trigramas con el nombre, para los errores de escritura en palabras
 * de letras: solo se usa si la búsqueda exacta no encontró nada. Todo va en parámetros, y la RLS filtra empresa y categorías debajo.
 */
export function condicionesDeBusqueda(
  empresaId: string,
  filtros: FiltrosDeConsulta,
  { parecidos = false }: { parecidos?: boolean } = {},
): ConsultaDeBusqueda {
  const condiciones = ['d.empresa_id = $1', 'd.eliminado_en IS NULL'];
  const parametros: unknown[] = [empresaId];
  const parametro = (valor: unknown) => {
    parametros.push(valor);
    return `$${parametros.length}`;
  };
  let desde = 'documentos d';
  let relevancia: ConsultaDeBusqueda['relevancia'] = null;

  if (filtros.q !== undefined) {
    const { frase, palabras } = terminosDeBusqueda(filtros.q);
    if (palabras.length === 0) {
      // Solo signos («%», «'»): no hay nada que buscar, y no se devuelve todo como si no hubiera texto.
      condiciones.push('false');
    } else {
      const porPalabra = palabras.map((palabra) => {
        const p = parametro(palabra);
        const enNombre = `d.busqueda_nombre LIKE '%' || ${p} || '%'`;
        const enTexto = `(d.busqueda_texto LIKE '%' || ${p} || '%' OR d.busqueda @@ to_tsquery('spanish', ${p} || ':*'))`;
        const enCategoria = `d.categoria_id IN (SELECT ca.id FROM categorias ca WHERE ca.empresa_id = $1 AND normalizar(ca.nombre) LIKE '%' || ${p} || '%')`;
        const coincide = `(${enTexto} OR ${enCategoria})`;
        // Por parecido, solo en el nombre: es donde se busca de memoria, y recorrerlo cuesta un tercio que el texto entero.
        const parecida = admiteParecido(palabra)
          ? `extensions.word_similarity(${p}, d.busqueda_nombre) >= ${UMBRAL_DE_PARECIDO}` : null;
        return {
          enNombre,
          // La raíz con peso A: en el nombre o en el nombre del archivo, no en la descripción.
          enNombreOArchivo: `(${enNombre} OR d.busqueda @@ to_tsquery('spanish', ${p} || ':*A'))`,
          enTexto,
          condicion: parecidos && parecida ? `(${coincide} OR ${parecida})` : coincide,
          similitud: `extensions.word_similarity(${p}, d.busqueda_nombre)`,
        };
      });
      condiciones.push(...porPalabra.map((palabra) => palabra.condicion));
      const todas = (clave: 'enNombre' | 'enNombreOArchivo' | 'enTexto') => porPalabra.map((palabra) => palabra[clave]).join(' AND ');
      relevancia = parecidos
        ? {
          nivel: () => String(COINCIDENCIAS.indexOf('parecido') + 1),
          puntaje: () => `(${porPalabra.map((palabra) => palabra.similitud).join(' + ')})`,
        }
        : {
          nivel: (agregar) => {
            const f = agregar(frase);
            return `CASE WHEN d.busqueda_nombre = ${f} THEN 1 WHEN d.busqueda_nombre LIKE ${f} || '%' THEN 2
              WHEN ${todas('enNombre')} THEN 3 WHEN ${todas('enNombreOArchivo')} THEN 4 WHEN ${todas('enTexto')} THEN 5 ELSE 6 END`;
          },
          puntaje: (agregar) => `ts_rank(d.busqueda, to_tsquery('spanish', ${agregar(palabras.map((palabra) => `${palabra}:*`).join(' | '))}))`,
        };
    }
  }
  if (filtros.categoriaId) condiciones.push(`d.categoria_id = ${parametro(filtros.categoriaId)}`);
  if (filtros.tipo) condiciones.push(`d.archivo_tipo_mime = ANY(${parametro(GRUPOS_DE_TIPO[filtros.tipo])}::text[])`);
  if (filtros.subidoPor) condiciones.push(`d.subido_por = ${parametro(filtros.subidoPor)}`);
  if (filtros.fechaDe === 'subida') {
    // Un día de subida es un día de Lima, aunque la base guarde el instante en UTC.
    if (filtros.desde) condiciones.push(`d.creado_en >= (${parametro(filtros.desde)}::date)::timestamp AT TIME ZONE 'America/Lima'`);
    if (filtros.hasta) condiciones.push(`d.creado_en < ((${parametro(filtros.hasta)}::date) + 1)::timestamp AT TIME ZONE 'America/Lima'`);
  } else {
    if (filtros.desde) condiciones.push(`d.fecha_documento >= ${parametro(filtros.desde)}`);
    if (filtros.hasta) condiciones.push(`d.fecha_documento <= ${parametro(filtros.hasta)}`);
  }
  if (filtros.estado) {
    // La última solicitud de cada documento, en una sola pasada por las solicitudes y no una por fila.
    desde += ` LEFT JOIN (
      SELECT DISTINCT ON (s.documento_id) s.documento_id, s.estado FROM solicitudes s
      WHERE s.empresa_id = $1 ORDER BY s.documento_id, s.creada_en DESC
    ) ultima ON ultima.documento_id = d.id`;
    condiciones.push(`coalesce(ultima.estado, 'sin_solicitud') = ${parametro(filtros.estado)}`);
  }
  return { desde, where: condiciones.join(' AND '), parametros, relevancia };
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
  nivel?: number | null;
}

const COLUMNAS_RESUMEN = `d.id, d.nombre, d.fecha_documento, d.categoria_id, c.nombre AS categoria_nombre, d.subido_por,
         u.nombre AS subido_por_nombre, d.archivo_tipo_mime, d.archivo_peso_bytes, d.creado_en`;

function aResumen(fila: FilaResumen): DocumentoResumen {
  return {
    id: fila.id,
    nombre: fila.nombre,
    fechaDocumento: fila.fecha_documento,
    categoria: { id: fila.categoria_id, nombre: fila.categoria_nombre },
    subidoPor: { id: fila.subido_por, nombre: fila.subido_por_nombre },
    archivo: { tipoMime: fila.archivo_tipo_mime, pesoBytes: fila.archivo_peso_bytes },
    creadoEn: fila.creado_en,
    ...(fila.nivel != null && { coincidencia: COINCIDENCIAS[fila.nivel - 1] }),
  };
}

/**
 * El nivel de cada fila y el ORDER BY de una página (por relevancia solo si hay texto con el que medirla),
 * con los parámetros que agregan, que van después de los del WHERE.
 */
function nivelYOrden(consulta: ConsultaDeBusqueda, orden: Orden) {
  const extra: unknown[] = [];
  const agregar: Agregar = (valor) => {
    extra.push(valor);
    return `$${consulta.parametros.length + extra.length}`;
  };
  const { relevancia } = consulta;
  const nivel = relevancia ? relevancia.nivel(agregar) : 'NULL::int';
  const porOrden = relevancia && orden === 'relevancia'
    ? `nivel, ${relevancia.puntaje(agregar)} DESC, d.creado_en DESC, d.id`
    : ORDEN[orden === 'relevancia' ? 'recientes' : orden];
  return { nivel, orden: porOrden, parametros: [...consulta.parametros, ...extra] };
}

/**
 * Las dos consultas de una página del listado: el total y sus filas. Se exportan para que la prueba de
 * carga muestre el plan de las mismas consultas que ejecuta la API.
 */
export function consultasDeBusqueda(
  empresaId: string,
  filtros: FiltrosBusqueda,
  { orden = filtros.orden ?? 'recientes', parecidos = false }: { orden?: Orden; parecidos?: boolean } = {},
) {
  const consulta = condicionesDeBusqueda(empresaId, filtros, { parecidos });
  const { desde, where } = consulta;
  const pagina = nivelYOrden(consulta, orden);
  return {
    conteo: { texto: `SELECT count(*)::int AS total FROM ${desde} WHERE ${where}`, parametros: consulta.parametros },
    pagina: {
      texto: `SELECT ${COLUMNAS_RESUMEN}, ${pagina.nivel} AS nivel
     FROM ${desde}
     JOIN categorias c ON c.id = d.categoria_id
     JOIN usuarios u ON u.id = d.subido_por
     WHERE ${where} ORDER BY ${pagina.orden}
     LIMIT $${pagina.parametros.length + 1} OFFSET $${pagina.parametros.length + 2}`,
      parametros: [...pagina.parametros, filtros.porPagina, desplazamiento(filtros)],
    },
  };
}

/** Una fila del listado documental (RF35), con los nombres de columna del CSV. */
export interface FilaDelListado {
  id: string;
  nombre: string;
  categoria: string;
  fecha_documento: string;
  descripcion: string | null;
  subido_por: string;
  subido_en_lima: string;
  archivo_tipo_mime: string;
  archivo_peso_bytes: number;
  version: number;
  estado_aprobacion: 'pendiente' | 'aprobada' | 'rechazada' | null;
  version_revisada: number | null;
}

/**
 * El inventario documental (RF35): lo que coincide con los filtros, por categoría y fecha. Usa las mismas
 * condiciones del listado y corre con la RLS, así que no trae lo que quien exporta no puede ver. La
 * última solicitud de cada documento sale de una sola pasada por las solicitudes, no de una por fila.
 */
export async function listadoDocumental(
  db: Consultor,
  empresaId: string,
  filtros: FiltrosDelListado,
  limite: number,
): Promise<FilaDelListado[]> {
  const { desde, where, parametros } = condicionesDeBusqueda(empresaId, filtros);
  const { rows } = await db.query<FilaDelListado>(
    `SELECT d.id, d.nombre, c.nombre AS categoria, d.fecha_documento, d.descripcion, u.nombre AS subido_por,
            to_char(d.creado_en AT TIME ZONE 'America/Lima', 'YYYY-MM-DD HH24:MI') AS subido_en_lima,
            d.archivo_tipo_mime, d.archivo_peso_bytes, d.version, s.estado AS estado_aprobacion, s.version AS version_revisada
     FROM ${desde}
     JOIN categorias c ON c.id = d.categoria_id
     JOIN usuarios u ON u.id = d.subido_por
     LEFT JOIN (
       SELECT DISTINCT ON (documento_id) documento_id, estado, version
       FROM solicitudes WHERE empresa_id = $1 ORDER BY documento_id, creada_en DESC
     ) s ON s.documento_id = d.id
     WHERE ${where}
     ORDER BY c.nombre, d.fecha_documento, d.busqueda_nombre, d.id
     LIMIT $${parametros.length + 1}`,
    [...parametros, limite],
  );
  return rows;
}

export async function buscarDocumentos(
  db: Consultor,
  empresaId: string,
  filtros: FiltrosBusqueda,
  opciones: { orden: Orden; parecidos?: boolean },
): Promise<{ filas: DocumentoResumen[]; total: number }> {
  const { conteo, pagina } = consultasDeBusqueda(empresaId, filtros, opciones);
  const { rows: [total] } = await db.query<{ total: number }>(conteo.texto, conteo.parametros);
  const { rows } = await db.query<FilaResumen>(pagina.texto, pagina.parametros);
  return { filas: rows.map(aResumen), total: total?.total ?? 0 };
}

/** Una sugerencia mientras se escribe: lo justo para reconocer el documento y abrirlo. */
export interface Sugerencia {
  id: string;
  nombre: string;
  categoria: string;
  coincidencia: Coincidencia;
}

/** Las mejores coincidencias de lo escrito hasta ahora, con la misma consulta y la misma RLS (D42). */
export async function sugerirDocumentos(db: Consultor, empresaId: string, q: string, limite: number): Promise<Sugerencia[]> {
  const consulta = condicionesDeBusqueda(empresaId, { q, fechaDe: 'documento' });
  if (!consulta.relevancia) return [];
  const { nivel, orden, parametros } = nivelYOrden(consulta, 'relevancia');
  const { rows } = await db.query<{ id: string; nombre: string; categoria: string; nivel: number }>(
    `SELECT d.id, d.nombre, c.nombre AS categoria, ${nivel} AS nivel
     FROM ${consulta.desde} JOIN categorias c ON c.id = d.categoria_id
     WHERE ${consulta.where}
     ORDER BY ${orden}
     LIMIT $${parametros.length + 1}`,
    [...parametros, limite],
  );
  return rows.map((fila) => ({ id: fila.id, nombre: fila.nombre, categoria: fila.categoria, coincidencia: COINCIDENCIAS[fila.nivel - 1]! }));
}

interface FilaDocumento extends FilaResumen {
  descripcion: string | null;
  archivo_nombre_original: string;
  archivo_ruta: string;
  actualizado_en: Date;
  version: number;
  s_id: string | null;
  s_version: number | null;
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
            d.descripcion, d.archivo_nombre_original, d.archivo_ruta, d.actualizado_en, d.version,
            s.id AS s_id, s.version AS s_version, s.estado AS s_estado, s.solicitante_id AS s_solicitante_id, sol.nombre AS s_solicitante_nombre,
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
    version: fila.version,
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
      version: fila.s_version!,
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
