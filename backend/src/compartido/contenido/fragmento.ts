import { normalizar } from './palabras-clave.js';

/** Un trozo del fragmento: lo que coincidió con la búsqueda va resaltado. */
export interface TrozoDeFragmento {
  texto: string;
  resaltado: boolean;
}

/** Cuántas palabras se muestran antes y después de la primera coincidencia: lo que cabe en dos líneas del celular. */
const PALABRAS_ALREDEDOR = 7;

/** «facturas» también resalta «factura»: la búsqueda va por la raíz, y aquí basta con quitar el plural. */
function raices(terminos: string[]): string[] {
  return terminos.flatMap((termino) => {
    const raiz = termino.length > 4 ? termino.replace(/(es|s)$/, '') : termino;
    return raiz === termino ? [termino] : [termino, raiz];
  });
}

/**
 * Unas palabras del contenido alrededor de la primera coincidencia, con las coincidencias resaltadas (D45):
 * «… pedido de 120 m de **algodón** pima …». Se arma con el texto tal como se leyó, con sus tildes; se compara
 * sin tildes y por el comienzo de cada palabra, como la búsqueda. Sin coincidencia, null.
 */
export function fragmentoDelContenido(texto: string, terminos: string[]): TrozoDeFragmento[] | null {
  const buscadas = raices(terminos.filter((termino) => termino.length >= 2));
  const palabras = [...texto.matchAll(/[\p{L}\p{N}]+/gu)].map((coincidencia) => ({
    inicio: coincidencia.index,
    fin: coincidencia.index + coincidencia[0].length,
    coincide: buscadas.some((buscada) => normalizar(coincidencia[0]).startsWith(buscada)),
  }));
  const primera = palabras.findIndex((palabra) => palabra.coincide);
  if (primera < 0) return null;
  const desde = Math.max(0, primera - PALABRAS_ALREDEDOR);
  const hasta = Math.min(palabras.length - 1, primera + PALABRAS_ALREDEDOR);
  const trozos: TrozoDeFragmento[] = [];
  const agregar = (parte: string, resaltado: boolean) => {
    if (!parte) return;
    const ultimo = trozos.at(-1);
    if (ultimo && ultimo.resaltado === resaltado) ultimo.texto += parte;
    else trozos.push({ texto: parte, resaltado });
  };
  if (desde > 0) agregar('… ', false);
  let cursor = palabras[desde]!.inicio;
  for (let i = desde; i <= hasta; i++) {
    const palabra = palabras[i]!;
    // Lo que hay entre dos palabras (espacios, signos, saltos) se conserva, con los saltos como espacios.
    agregar(texto.slice(cursor, palabra.inicio).replace(/\s+/g, ' '), false);
    agregar(texto.slice(palabra.inicio, palabra.fin), palabra.coincide);
    cursor = palabra.fin;
  }
  if (hasta < palabras.length - 1) agregar(' …', false);
  return trozos;
}
