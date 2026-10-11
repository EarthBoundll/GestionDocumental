/**
 * Lo justo de ZIP para leer un Word (.docx) o un Excel (.xlsx), que por dentro son XML comprimidos, sin
 * librería: el directorio central dice dónde está cada parte, y zlib, que Node ya trae, la descomprime.
 *
 * Lee archivos que sube cualquiera, así que no confía en nada: rechaza lo que no entiende (cifrado, ZIP64,
 * otros métodos) y nunca descomprime más de `maximo` bytes en total, aunque la cabecera diga otra cosa.
 * Eso frena una «bomba» de compresión: unos KB que se inflan a cientos de MB.
 */
import { inflateRawSync } from 'node:zlib';

export class ZipIlegible extends Error {}

interface Entrada {
  nombre: string;
  cifrado: boolean;
  metodo: number;
  comprimido: number;
  desplazamiento: number;
}

const FIRMA_FIN = 0x06054b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_LOCAL = 0x04034b50;
const GUARDADO = 0;
const DEFLATE = 8;

function directorioCentral(zip: Buffer): Entrada[] {
  // El registro final mide 22 bytes, más un comentario de hasta 65.535: se busca desde el final hacia atrás.
  let fin = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === FIRMA_FIN) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new ZipIlegible('no es un ZIP');
  const cantidad = zip.readUInt16LE(fin + 10);
  let posicion = zip.readUInt32LE(fin + 16);
  const entradas: Entrada[] = [];
  for (let n = 0; n < cantidad; n++) {
    if (posicion + 46 > zip.length || zip.readUInt32LE(posicion) !== FIRMA_CENTRAL) throw new ZipIlegible('directorio dañado');
    const largoNombre = zip.readUInt16LE(posicion + 28);
    const comprimido = zip.readUInt32LE(posicion + 20);
    if (comprimido === 0xffffffff) throw new ZipIlegible('ZIP64');
    entradas.push({
      nombre: zip.toString('utf8', posicion + 46, posicion + 46 + largoNombre),
      cifrado: (zip.readUInt16LE(posicion + 8) & 1) === 1,
      metodo: zip.readUInt16LE(posicion + 10),
      comprimido,
      desplazamiento: zip.readUInt32LE(posicion + 42),
    });
    posicion += 46 + largoNombre + zip.readUInt16LE(posicion + 30) + zip.readUInt16LE(posicion + 32);
  }
  return entradas;
}

function datosDe(zip: Buffer, entrada: Entrada): Buffer {
  const local = entrada.desplazamiento;
  if (local + 30 > zip.length || zip.readUInt32LE(local) !== FIRMA_LOCAL) throw new ZipIlegible('entrada dañada');
  const inicio = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  if (inicio + entrada.comprimido > zip.length) throw new ZipIlegible('entrada cortada');
  return zip.subarray(inicio, inicio + entrada.comprimido);
}

/** Las partes cuyo nombre acepta `elegir`, en el orden del archivo, sin pasar de `maximo` bytes entre todas. */
export function partesDelZip(zip: Buffer, elegir: (nombre: string) => boolean, maximo: number): Map<string, Buffer> {
  const partes = new Map<string, Buffer>();
  let restante = maximo;
  for (const entrada of directorioCentral(zip)) {
    if (!elegir(entrada.nombre)) continue;
    if (entrada.cifrado) throw new ZipIlegible('cifrado');
    if (restante <= 0) throw new ZipIlegible('supera el límite de tamaño');
    const datos = datosDe(zip, entrada);
    let parte: Buffer;
    if (entrada.metodo === GUARDADO) {
      parte = datos;
    } else if (entrada.metodo === DEFLATE) {
      try {
        parte = inflateRawSync(datos, { maxOutputLength: restante });
      } catch (error) {
        throw new ZipIlegible(error instanceof RangeError ? 'supera el límite de tamaño' : 'compresión dañada');
      }
    } else {
      throw new ZipIlegible(`método de compresión ${entrada.metodo}`);
    }
    if (parte.length > restante) throw new ZipIlegible('supera el límite de tamaño');
    restante -= parte.length;
    partes.set(entrada.nombre, parte);
  }
  return partes;
}
