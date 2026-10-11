/*
 * Las palabras clave de un documento, sin IA (D45):
 *
 * - Datos que se reconocen por su forma: RUC, número de comprobante, montos y fechas. Son expresiones
 *   regulares; aciertan o no, y se puede explicar por qué.
 * - Las palabras propias del documento: las que más se repiten aquí y menos en el resto de la empresa
 *   (TF-IDF), sin artículos, preposiciones ni las que lleva cualquier comprobante. Así «factura» no sale en
 *   todas las facturas, y sí «casaca polar» o el cliente.
 *
 * La prueba aislada comparó contar solo en el documento con TF-IDF (docs/evidencias/lectura-de-contenido.md).
 */

export type TipoDeDato = 'ruc' | 'comprobante' | 'monto' | 'fecha';

export interface PalabrasClave {
  datos: { tipo: TipoDeDato; valor: string }[];
  palabras: string[];
}

const MAXIMO_POR_TIPO = 3;
export const MAXIMO_DE_PALABRAS = 8;
/** Las candidatas que se comparan con el resto de la empresa: las más repetidas del documento. */
export const CANDIDATAS = 30;

const PATRONES: { tipo: TipoDeDato; patron: RegExp }[] = [
  // 11 dígitos con el prefijo de un tipo de contribuyente: 10 persona, 20 empresa; 15, 16 y 17, otros.
  { tipo: 'ruc', patron: /\b(?:10|15|16|17|20)\d{9}\b/g },
  // Serie y número de SUNAT (F001-45, B001-00001203, T001-310) o una serie propia de letras, como OC-000123.
  // Un código de producto como P-001 no cuenta: una letra sola y pocos dígitos.
  { tipo: 'comprobante', patron: /\b(?:[FBTE][A-Z0-9]{3}-\d{1,8}|[A-Z]{2,4}-\d{4,8})\b/g },
  { tipo: 'monto', patron: /(?:S\/\.?|US\$)\s?\d{1,3}(?:,?\d{3})*(?:\.\d{1,2})?/g },
  { tipo: 'fecha', patron: /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{2}-\d{2})\b/g },
];

export const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Las de cuatro letras o más (las más cortas ya quedan fuera) que no distinguen un documento de otro. */
const VACIAS = new Set([
  'ademas', 'ante', 'antes', 'aquel', 'aquella', 'aquellas', 'aquellos', 'aqui', 'asi', 'aunque', 'cada', 'como',
  'conforme', 'contra', 'cual', 'cuales', 'cualquier', 'cuando', 'cuyo', 'cuya', 'debe', 'deben', 'debera', 'deberan',
  'desde', 'despues', 'dicha', 'dichas', 'dicho', 'dichos', 'donde', 'durante', 'ella', 'ellas', 'ellos', 'entre',
  'esta', 'estas', 'este', 'esto', 'estos', 'estan', 'estar', 'fuera', 'hace', 'hacer', 'hacia', 'hasta', 'luego',
  'mediante', 'menos', 'misma', 'mismas', 'mismo', 'mismos', 'mucho', 'nada', 'nuestra', 'nuestro', 'otra',
  'otras', 'otro', 'otros', 'para', 'parte', 'partes', 'pero', 'poco', 'porque', 'pueda', 'puede', 'pueden', 'pues',
  'segun', 'sera', 'seran', 'sido', 'siendo', 'siempre', 'sino', 'sobre', 'solo', 'suya', 'suyo', 'tambien', 'tanto',
  'tener', 'tiene', 'tienen', 'toda', 'todas', 'todo', 'todos', 'tras', 'usted', 'ustedes', 'veces',
  // Lo que lleva cualquier comprobante o documento.
  'cantidad', 'descripcion', 'detalle', 'direccion', 'fecha', 'importe', 'numero', 'pagina', 'paginas', 'precio',
  'senor', 'senores', 'subtotal', 'total', 'unidad', 'valor', 'http', 'https',
]);

function datosReconocidos(texto: string): PalabrasClave['datos'] {
  return PATRONES.flatMap(({ tipo, patron }) => {
    const valores = [...new Set([...texto.matchAll(patron)].map(([valor]) => valor.replace(/\s+/g, ' ')))];
    // De los montos, los mayores primero: el total del comprobante antes que cada línea.
    if (tipo === 'monto') valores.sort((a, b) => Number(b.replace(/[^\d.]/g, '')) - Number(a.replace(/[^\d.]/g, '')));
    return valores.slice(0, MAXIMO_POR_TIPO).map((valor) => ({ tipo, valor }));
  });
}

interface Conteo {
  veces: number;
  formas: Map<string, number>;
  primera: number;
}

/** Cuántas veces aparece cada palabra (sin tildes y en minúsculas), con «facturas» sumada a «factura». */
export function contarPalabras(texto: string): Map<string, Conteo> {
  const conteo = new Map<string, Conteo>();
  let posicion = 0;
  for (const [forma] of texto.matchAll(/\p{L}+/gu)) {
    posicion++;
    const clave = normalizar(forma);
    if (clave.length < 4 || VACIAS.has(clave)) continue;
    const actual = conteo.get(clave) ?? { veces: 0, formas: new Map<string, number>(), primera: posicion };
    actual.veces++;
    actual.formas.set(forma, (actual.formas.get(forma) ?? 0) + 1);
    conteo.set(clave, actual);
  }
  for (const [clave, plural] of conteo) {
    const singular = [clave.slice(0, -2), clave.slice(0, -1)].find((raiz, i) => clave.endsWith(i === 0 ? 'es' : 's') && conteo.has(raiz));
    if (!singular) continue;
    const destino = conteo.get(singular)!;
    destino.veces += plural.veces;
    destino.primera = Math.min(destino.primera, plural.primera);
    conteo.delete(clave);
  }
  return conteo;
}

/** Las más repetidas del documento: las que vale la pena comparar con el resto de la empresa. */
export function candidatas(texto: string): string[] {
  return [...contarPalabras(texto)].sort((a, b) => b[1].veces - a[1].veces || a[1].primera - b[1].primera)
    .slice(0, CANDIDATAS).map(([clave]) => clave);
}

/** La forma más usada, en minúsculas: «Casaca» al comienzo de un renglón no es un nombre, y la búsqueda no distingue. */
function comoSeEscribe({ formas }: Conteo): string {
  return [...formas].sort((a, b) => b[1] - a[1])[0]![0].toLowerCase();
}

/**
 * Las palabras clave de un texto. `rareza` dice cuánto escasea una palabra (sin tildes) en el resto de la
 * empresa; sin ella, cuenta solo en el documento.
 */
export function palabrasClave(texto: string, rareza: (clave: string) => number = () => 1): PalabrasClave {
  const palabras = [...contarPalabras(texto)]
    .map(([clave, conteo]) => ({ conteo, puntaje: conteo.veces * rareza(clave) }))
    .sort((a, b) => b.puntaje - a.puntaje || a.conteo.primera - b.conteo.primera)
    .slice(0, MAXIMO_DE_PALABRAS)
    .map(({ conteo }) => comoSeEscribe(conteo));
  return { datos: datosReconocidos(texto), palabras };
}
