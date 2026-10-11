import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

/*
 * Lo justo de ZIP, sin librería: un .xlsx o un .docx son carpetas de XML comprimidas. zlib, que Node ya trae,
 * comprime y descomprime cada parte; un directorio al final del archivo dice dónde está cada una.
 */

const FIRMA_LOCAL = 0x04034b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_FIN = 0x06054b50;
const GUARDADO = 0;
const DEFLATE = 8;

/**
 * Escribe un ZIP con estas partes: el libro de Excel de las exportaciones (D44). Sin ZIP64: un libro de
 * 50.000 filas ocupa unos pocos MB, lejos de los 4 GB de este formato.
 */
export function crearZip(partes: [ruta: string, contenido: string][]): Buffer {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const [ruta, contenido] of partes) {
    const datos = Buffer.from(contenido, 'utf8');
    const comprimido = deflateRawSync(datos);
    const nombre = Buffer.from(ruta, 'utf8');
    const crc = crc32(datos);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(FIRMA_LOCAL, 0);
    local.writeUInt16LE(20, 4); // versión necesaria: 2.0, deflate
    local.writeUInt16LE(0x0800, 6); // los nombres van en UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0x5a21, 12); // 1 de enero de 2025: Excel no mira la fecha, pero debe ser válida
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(FIRMA_CENTRAL, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0x5a21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt32LE(desplazamiento, 42);

    locales.push(local, nombre, comprimido);
    centrales.push(central, nombre);
    desplazamiento += local.length + nombre.length + comprimido.length;
  }
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(FIRMA_FIN, 0);
  fin.writeUInt16LE(partes.length, 8);
  fin.writeUInt16LE(partes.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, directorio, fin]);
}

/** Un ZIP que no se deja leer: dañado, cifrado, ZIP64, de otro método, o que se infla más de lo permitido. */
export class ZipIlegible extends Error {}

interface Entrada {
  nombre: string;
  cifrado: boolean;
  metodo: number;
  comprimido: number;
  desplazamiento: number;
}

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
  const entradas: Entrada[] = [];
  let posicion = zip.readUInt32LE(fin + 16);
  for (let n = zip.readUInt16LE(fin + 10); n > 0; n--) {
    if (posicion + 46 > zip.length || zip.readUInt32LE(posicion) !== FIRMA_CENTRAL) throw new ZipIlegible('directorio dañado');
    const largoDelNombre = zip.readUInt16LE(posicion + 28);
    const comprimido = zip.readUInt32LE(posicion + 20);
    if (comprimido === 0xffffffff) throw new ZipIlegible('ZIP64');
    entradas.push({
      nombre: zip.toString('utf8', posicion + 46, posicion + 46 + largoDelNombre),
      cifrado: (zip.readUInt16LE(posicion + 8) & 1) === 1,
      metodo: zip.readUInt16LE(posicion + 10),
      comprimido,
      desplazamiento: zip.readUInt32LE(posicion + 42),
    });
    posicion += 46 + largoDelNombre + zip.readUInt16LE(posicion + 30) + zip.readUInt16LE(posicion + 32);
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

/**
 * Las partes cuyo nombre acepta `elegir`, descomprimidas, sin pasar de `maximo` bytes entre todas: el Word o
 * el Excel que alguien sube (D45). No confía en lo que dice la cabecera: zlib corta al llegar al máximo, así
 * que una «bomba» de compresión (unos KB que se inflan a cientos de MB) se rechaza sin agotar la memoria.
 */
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
