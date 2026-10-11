import { getDocumentProxy } from 'unpdf';
import { TIPOS } from '../tipos-de-archivo.js';
import { partesDelZip, ZipIlegible } from '../zip.js';

/*
 * El texto que ya trae un archivo, sin IA y sin OCR (D45): PDF con capa de texto (unpdf, que es pdf.js de
 * Mozilla), Word (.docx) y Excel (.xlsx). Una foto, un escaneo o un .doc o .xls antiguos no tienen texto que
 * leer así, y se dice. Medido antes con 56 archivos ficticios, también hostiles (docs/evidencias/lectura-de-contenido.md).
 *
 * Nunca lanza: si el archivo no se deja leer, el documento se sube igual, sin contenido.
 */

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

/** Qué pasó al leer: lo que se guarda en `contenido_estado` (migración 015). */
export type EstadoDelContenido = 'leido' | 'sin_texto' | 'no_admitido' | 'ilegible';

export type Lectura =
  | { estado: 'leido'; texto: string; truncado: boolean }
  | { estado: Exclude<EstadoDelContenido, 'leido'>; texto: null; motivo?: string };

const sinTexto = (estado: Exclude<EstadoDelContenido, 'leido'>, motivo?: string): Lectura => ({ estado, texto: null, ...(motivo && { motivo }) });

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

function resultado(texto: string, limites: Limites, truncadoAntes = false): Lectura {
  const { texto: ordenado, cortado } = ordenar(texto, limites.caracteres);
  return tieneTexto(ordenado) ? { estado: 'leido', texto: ordenado, truncado: truncadoAntes || cortado } : sinTexto('sin_texto');
}

async function leerPdf(contenido: Buffer, limites: Limites): Promise<Lectura> {
  const inicio = performance.now();
  // Una copia: pdf.js puede quedarse con el ArrayBuffer que recibe. pdf.js 6 ya no convierte las fuentes del
  // PDF en código (el camino de CVE-2024-4367 no existe), así que no hay opción que apagar.
  const pdf = await getDocumentProxy(new Uint8Array(contenido), { disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  try {
    const partes: string[] = [];
    let largo = 0;
    let truncado = false;
    for (let numero = 1; numero <= pdf.numPages; numero++) {
      if (numero > limites.paginas || performance.now() - inicio > limites.milisegundos || largo > limites.caracteres * 1.2) {
        truncado = true;
        break;
      }
      const pagina = await pdf.getPage(numero);
      const { items } = await pagina.getTextContent();
      const texto = items.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : '')).join('');
      pagina.cleanup();
      partes.push(texto);
      largo += texto.length;
    }
    return resultado(partes.join('\n\n'), limites, truncado);
  } finally {
    await pdf.loadingTask.destroy();
  }
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function sinEtiquetas(xml: string): string {
  return xml.replace(/<[^>]+>/g, '').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (entidad, nombre: string) => {
    if (!nombre.startsWith('#')) return ENTIDADES[nombre] ?? entidad;
    const codigo = /^#x/i.test(nombre) ? Number.parseInt(nombre.slice(2), 16) : Number(nombre.slice(1));
    return Number.isInteger(codigo) && codigo > 0 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : ' ';
  });
}

/** El cuerpo primero, después encabezados y pies, donde suelen ir el RUC y la razón social. */
function textoDeWord(contenido: Buffer, limites: Limites): string {
  const partes = partesDelZip(contenido, (nombre) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(nombre), limites.bytesDeXml);
  const orden = [...partes.keys()].sort((a, b) => Number(!a.includes('document')) - Number(!b.includes('document')));
  return orden.map((nombre) => sinEtiquetas(partes.get(nombre)!.toString('utf8')
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:(br|cr)\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n'))).join('\n\n');
}

/** Cada fila de cada hoja en una línea: los textos comunes, los escritos en la celda y los números. */
function textoDeExcel(contenido: Buffer, limites: Limites): string {
  const partes = partesDelZip(contenido, (nombre) => nombre === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(nombre), limites.bytesDeXml);
  const comunes = [...(partes.get('xl/sharedStrings.xml')?.toString('utf8') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(([, si]) => sinEtiquetas(si!.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')));
  const hojas = [...partes.keys()].filter((nombre) => nombre.includes('worksheets'))
    .sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]));
  return hojas.map((hoja) => [...partes.get(hoja)!.toString('utf8').matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(([, fila]) =>
    [...fila!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(([, atributos = '', interior = '']) => {
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
    if (mime === TIPOS.pdf.mime) return await leerPdf(contenido, limites);
    if (mime === TIPOS.docx.mime) return resultado(textoDeWord(contenido, limites), limites);
    if (mime === TIPOS.xlsx.mime) return resultado(textoDeExcel(contenido, limites), limites);
    return sinTexto('no_admitido');
  } catch (error) {
    if (error instanceof ZipIlegible) return sinTexto('ilegible', error.message);
    const nombre = error instanceof Error ? error.name : '';
    if (nombre === 'PasswordException') return sinTexto('ilegible', 'protegido con contraseña');
    if (nombre === 'InvalidPDFException') return sinTexto('ilegible', 'no es un PDF válido');
    return sinTexto('ilegible', error instanceof Error ? error.message.slice(0, 120) : 'error desconocido');
  }
}
