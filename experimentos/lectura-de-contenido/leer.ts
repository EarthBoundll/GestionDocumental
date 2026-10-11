/**
 * El lector candidato: el texto que ya trae un archivo, sin IA y sin OCR. Lee PDF con capa de texto (unpdf,
 * que es pdf.js de Mozilla), Word (.docx) y Excel (.xlsx). Una foto, un escaneo o un .doc antiguo no tienen
 * texto que leer así, y se dice.
 *
 * Nunca lanza: el sistema subiría el documento igual, sin contenido, si el archivo no se deja leer.
 */
import { getDocumentProxy } from 'unpdf';
import { partesDelZip, ZipIlegible } from './zip.js';

export interface Limites {
  /** Lo que se guarda para buscar: unas 6 a 8 páginas de texto corrido. */
  caracteres: number;
  /** Un escaneo de 300 páginas no tiene texto, pero recorrerlo cuesta igual. */
  paginas: number;
  /** Se comprueba entre página y página: una página que tarda no se interrumpe. */
  milisegundos: number;
  /** Lo que se descomprime de un Word o un Excel, entre todas sus partes. */
  bytesDeXml: number;
}

export const LIMITES: Limites = { caracteres: 20_000, paginas: 50, milisegundos: 10_000, bytesDeXml: 16 * 1024 * 1024 };

export type Lectura =
  | { estado: 'leido'; texto: string; truncado: false | 'caracteres' | 'paginas' | 'tiempo'; paginas?: { leidas: number; total: number } }
  | { estado: 'sin_texto'; paginas?: { leidas: number; total: number } }
  | { estado: 'no_admitido' }
  | { estado: 'ilegible'; motivo: string };

export const PDF = 'application/pdf';
export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Espacios ordenados y cortado en el límite, sin partir una palabra. */
function ordenar(texto: string, maximo: number): { texto: string; cortado: boolean } {
  const limpio = texto.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (limpio.length <= maximo) return { texto: limpio, cortado: false };
  const corte = limpio.slice(0, maximo);
  const espacio = Math.max(corte.lastIndexOf(' '), corte.lastIndexOf('\n'));
  return { texto: (espacio > maximo * 0.9 ? corte.slice(0, espacio) : corte).trimEnd(), cortado: true };
}

/** Con menos de esto, lo que hay son números de página o un sello: el archivo es una imagen. */
const tieneTexto = (texto: string) => (texto.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 10;

async function leerPdf(contenido: Buffer, limites: Limites): Promise<Lectura> {
  const inicio = performance.now();
  // Una copia: pdf.js puede quedarse con el ArrayBuffer que recibe. pdf.js 6 ya no convierte fuentes en
  // código (el camino de CVE-2024-4367 no existe), así que no hay opción que apagar.
  const pdf = await getDocumentProxy(new Uint8Array(contenido), {
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  try {
    const total = pdf.numPages;
    const partes: string[] = [];
    let largo = 0;
    let leidas = 0;
    let truncado: false | 'caracteres' | 'paginas' | 'tiempo' = false;
    for (let numero = 1; numero <= total; numero++) {
      if (numero > limites.paginas) { truncado = 'paginas'; break; }
      if (performance.now() - inicio > limites.milisegundos) { truncado = 'tiempo'; break; }
      const pagina = await pdf.getPage(numero);
      const { items } = await pagina.getTextContent();
      const texto = items.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : '')).join('');
      pagina.cleanup();
      partes.push(texto);
      largo += texto.length;
      leidas = numero;
      if (largo > limites.caracteres * 1.2) { truncado = numero < total ? 'caracteres' : false; break; }
    }
    const { texto, cortado } = ordenar(partes.join('\n\n'), limites.caracteres);
    const paginas = { leidas, total };
    if (!tieneTexto(texto)) return truncado === 'tiempo' ? { estado: 'ilegible', motivo: 'tardó demasiado' } : { estado: 'sin_texto', paginas };
    return { estado: 'leido', texto, truncado: truncado || (cortado ? 'caracteres' : false), paginas };
  } finally {
    await pdf.loadingTask.destroy();
  }
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function sinEtiquetas(xml: string): string {
  return xml.replace(/<[^>]+>/g, '').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (entidad, nombre: string) => {
    if (nombre[0] === '#') {
      const codigo = nombre[1] === 'x' || nombre[1] === 'X' ? Number.parseInt(nombre.slice(2), 16) : Number(nombre.slice(1));
      return Number.isInteger(codigo) && codigo >= 0 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : ' ';
    }
    return ENTIDADES[nombre] ?? entidad;
  });
}

/** El cuerpo primero, después encabezados y pies, donde suelen ir el RUC y la razón social. */
function leerDocx(contenido: Buffer, limites: Limites): string {
  const partes = partesDelZip(contenido, (nombre) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(nombre), limites.bytesDeXml);
  const orden = [...partes.keys()].sort((a, b) => Number(!a.includes('document')) - Number(!b.includes('document')));
  return orden.map((nombre) => sinEtiquetas(partes.get(nombre)!.toString('utf8')
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:(br|cr)\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n'))).join('\n\n');
}

/** Cada fila de cada hoja en una línea: los textos comunes, los escritos en la celda y los números. */
function leerXlsx(contenido: Buffer, limites: Limites): string {
  const partes = partesDelZip(contenido, (nombre) => nombre === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(nombre), limites.bytesDeXml);
  const comunes = [...(partes.get('xl/sharedStrings.xml')?.toString('utf8') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((si) => sinEtiquetas(si[1]!.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')));
  const hojas = [...partes.keys()].filter((nombre) => nombre.includes('worksheets'))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  return hojas.map((hoja) => [...partes.get(hoja)!.toString('utf8').matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((fila) =>
    [...fila[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(([, atributos = '', interior = '']) => {
      const tipo = /\bt="(\w+)"/.exec(atributos)?.[1];
      const valor = /<v>([\s\S]*?)<\/v>/.exec(interior)?.[1];
      if (tipo === 's') return comunes[Number(valor)] ?? '';
      if (tipo === 'inlineStr') return sinEtiquetas(interior);
      if (tipo === 'b' || tipo === 'e') return '';
      return valor === undefined ? '' : sinEtiquetas(valor);
    }).filter(Boolean).join('\t')).join('\n')).join('\n\n');
}

export async function leerContenido(contenido: Buffer, mime: string, limites: Limites = LIMITES): Promise<Lectura> {
  try {
    if (mime === PDF) return await leerPdf(contenido, limites);
    if (mime !== DOCX && mime !== XLSX) return { estado: 'no_admitido' };
    const { texto, cortado } = ordenar(mime === DOCX ? leerDocx(contenido, limites) : leerXlsx(contenido, limites), limites.caracteres);
    return tieneTexto(texto) ? { estado: 'leido', texto, truncado: cortado ? 'caracteres' : false } : { estado: 'sin_texto' };
  } catch (error) {
    if (error instanceof ZipIlegible) return { estado: 'ilegible', motivo: error.message };
    const nombre = error instanceof Error ? error.name : '';
    if (nombre === 'PasswordException') return { estado: 'ilegible', motivo: 'protegido con contraseña' };
    if (nombre === 'InvalidPDFException') return { estado: 'ilegible', motivo: 'no es un PDF válido' };
    return { estado: 'ilegible', motivo: error instanceof Error ? error.message.slice(0, 120) : 'error desconocido' };
  }
}
