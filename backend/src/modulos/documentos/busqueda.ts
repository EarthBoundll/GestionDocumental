/**
 * Cómo se lee lo que alguien escribe en el buscador (D42). Sale de aquí ya convertido en palabras de letras
 * y dígitos, sin tildes y en minúsculas, igual que las columnas de búsqueda de la migración 014: ningún
 * signo llega a la consulta, así que no hay comodines de LIKE ni operadores de tsquery que escapar.
 */
export interface TerminosDeBusqueda {
  /** Todas las palabras, en orden: para comparar con el nombre entero o con su comienzo. */
  frase: string;
  /** Las que deben aparecer, cada una en algún sitio del documento: sin repetir y sin palabras vacías. */
  palabras: string[];
}

/** Como mucho, tantas palabras: cada una suma condiciones a la consulta. */
export const MAXIMO_DE_PALABRAS = 8;
/** Para la segunda pasada, la de errores de escritura: medido con «factrua», «provedor», «contrto» (D42). */
export const UMBRAL_DE_PARECIDO = 0.5;
/** Con menos letras, cualquier palabra se parece a demasiadas: solo se buscan tal cual. */
export const LETRAS_PARA_PARECIDO = 4;

/**
 * Qué palabras admiten errores de escritura: las de letras, de 4 o más. Un número no: «031415» y «031416»
 * se parecen, pero son dos documentos distintos, y quien busca uno no quiere el otro.
 */
export const admiteParecido = (palabra: string) => new RegExp(`^[a-z]{${LETRAS_PARA_PARECIDO},}$`).test(palabra);

/**
 * Artículos, preposiciones y conjunciones que no ayudan a distinguir un documento: «facturas de
 * proveedores» busca «facturas» y «proveedores». La lista es corta a propósito: «contra», que PostgreSQL
 * descarta en español, aquí sirve para encontrar «contrato».
 */
const VACIAS = new Set([
  'a', 'al', 'con', 'de', 'del', 'e', 'el', 'en', 'la', 'las', 'lo', 'los', 'o', 'para', 'por', 'que', 'se', 'su', 'sus',
  'u', 'un', 'una', 'unas', 'unos', 'y',
]);

/** Sin tildes y en minúsculas, como normalizar() en la base: «Cotización» es «cotizacion». */
function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function terminosDeBusqueda(q: string): TerminosDeBusqueda {
  const todas = sinTildes(q).split(/[^a-z0-9]+/).filter(Boolean);
  const utiles = todas.filter((palabra) => !VACIAS.has(palabra) && (palabra.length >= 2 || /^\d$/.test(palabra)));
  // Si solo se escribieron palabras vacías («de la»), se buscan esas: es lo que la persona quiso.
  const palabras = [...new Set(utiles.length > 0 ? utiles : todas)].slice(0, MAXIMO_DE_PALABRAS);
  return { frase: todas.join(' '), palabras };
}

/** Si vale la pena una segunda pasada por parecido: hace falta alguna palabra que lo admita. */
export const admiteParecidos = (terminos: TerminosDeBusqueda) => terminos.palabras.some(admiteParecido);

/**
 * Dónde coincidió cada resultado, de lo más a lo menos útil (D42). El orden de relevancia es este: la
 * persona puede ver por qué un documento salió primero.
 */
export const COINCIDENCIAS = [
  'nombre_exacto', 'nombre_inicio', 'nombre', 'nombre_o_archivo', 'descripcion', 'categoria', 'parecido',
] as const;
export type Coincidencia = (typeof COINCIDENCIAS)[number];
