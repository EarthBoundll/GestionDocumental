/**
 * Las palabras clave de un documento, sin IA:
 *
 * - **Datos que se reconocen por su forma:** RUC, número de comprobante, montos y fechas. Son expresiones
 *   regulares; aciertan o no, y se puede explicar por qué.
 * - **Las palabras que más se repiten**, sin artículos, preposiciones ni las que lleva todo documento. Con
 *   `rareza`, una palabra que abunda aquí y escasea en el resto de la empresa pesa más (TF-IDF): así
 *   «factura» no sale en todas las facturas.
 */
export type TipoDeDato = 'ruc' | 'comprobante' | 'monto' | 'fecha';

export interface PalabrasClave {
  datos: { tipo: TipoDeDato; valor: string }[];
  frecuentes: string[];
}

const MAXIMO_POR_TIPO = 3;
const MAXIMO_DE_FRECUENTES = 8;

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

/** Las de cuatro letras o más: las más cortas ya quedan fuera. */
const VACIAS = new Set([
  'ademas', 'ante', 'antes', 'aquel', 'aquella', 'aquellas', 'aquellos', 'aqui', 'asi', 'aunque', 'cada', 'como',
  'conforme', 'contra', 'cual', 'cuales', 'cualquier', 'cuando', 'cuyo', 'cuya', 'debe', 'deben', 'debera', 'deberan',
  'desde', 'despues', 'dicha', 'dichas', 'dicho', 'dichos', 'donde', 'durante', 'ella', 'ellas', 'ellos', 'entre',
  'esta', 'estas', 'este', 'esto', 'estos', 'estan', 'estar', 'fuera', 'hace', 'hacer', 'hacia', 'hasta', 'luego',
  'mediante', 'menos', 'misma', 'mismas', 'mismo', 'mismos', 'mucho', 'muy', 'nada', 'nuestra', 'nuestro', 'otra',
  'otras', 'otro', 'otros', 'para', 'parte', 'partes', 'pero', 'poco', 'porque', 'pueda', 'puede', 'pueden', 'pues',
  'segun', 'sera', 'seran', 'sido', 'siendo', 'siempre', 'sino', 'sobre', 'solo', 'suya', 'suyo', 'tambien', 'tanto',
  'tener', 'tiene', 'tienen', 'toda', 'todas', 'todo', 'todos', 'tras', 'usted', 'ustedes', 'vez', 'veces',
  // Lo que lleva cualquier comprobante o documento, y no lo distingue de otro.
  'cantidad', 'descripcion', 'detalle', 'direccion', 'fecha', 'importe', 'numero', 'pagina', 'paginas', 'precio',
  'senor', 'senores', 'subtotal', 'total', 'unidad', 'valor', 'http', 'https',
]);

function datosReconocidos(texto: string): PalabrasClave['datos'] {
  return PATRONES.flatMap(({ tipo, patron }) => {
    let valores = [...new Set([...texto.matchAll(patron)].map((coincidencia) => coincidencia[0].replace(/\s+/g, ' ')))];
    // De los montos, los mayores primero: el total del comprobante antes que cada línea.
    if (tipo === 'monto') valores.sort((a, b) => Number(b.replace(/[^\d.]/g, '')) - Number(a.replace(/[^\d.]/g, '')));
    valores = valores.slice(0, MAXIMO_POR_TIPO);
    return valores.map((valor) => ({ tipo, valor }));
  });
}

interface Conteo {
  veces: number;
  formas: Map<string, number>;
  primera: number;
}

/** Cuántas veces aparece cada palabra, con «facturas» sumada a «factura». */
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
    const singular = clave.endsWith('es') && conteo.has(clave.slice(0, -2)) ? clave.slice(0, -2)
      : clave.endsWith('s') && conteo.has(clave.slice(0, -1)) ? clave.slice(0, -1) : null;
    if (!singular) continue;
    const destino = conteo.get(singular)!;
    destino.veces += plural.veces;
    destino.primera = Math.min(destino.primera, plural.primera);
    conteo.delete(clave);
  }
  return conteo;
}

/** La forma más usada; en mayúsculas sostenidas («ALGODÓN»), en minúsculas. */
function comoSeEscribe({ formas }: Conteo): string {
  const [forma] = [...formas].sort((a, b) => b[1] - a[1])[0]!;
  return forma === forma.toUpperCase() ? forma.toLowerCase() : forma;
}

export function palabrasClave(texto: string, rareza?: (clave: string) => number): PalabrasClave {
  const frecuentes = [...contarPalabras(texto)]
    .map(([clave, conteo]) => ({ conteo, puntaje: conteo.veces * (rareza?.(clave) ?? 1) }))
    .sort((a, b) => b.puntaje - a.puntaje || a.conteo.primera - b.conteo.primera)
    .slice(0, MAXIMO_DE_FRECUENTES)
    .map(({ conteo }) => comoSeEscribe(conteo));
  return { datos: datosReconocidos(texto), frecuentes };
}
