import { crc32, deflateRawSync } from 'node:zlib';

/**
 * Lo justo de ZIP para escribir un libro de Excel, que es una carpeta de XML comprimida: cada parte va con
 * deflate (zlib, que Node ya trae) y un directorio al final que dice dónde está cada una. Sin ZIP64: un libro
 * de 50.000 filas ocupa unos pocos MB, lejos de los 4 GB de este formato.
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
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versión necesaria: 2.0, deflate
    local.writeUInt16LE(0x0800, 6); // los nombres van en UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0x5a21, 12); // 1 de enero de 2025: Excel no mira la fecha, pero debe ser válida
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
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
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(partes.length, 8);
  fin.writeUInt16LE(partes.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, directorio, fin]);
}
