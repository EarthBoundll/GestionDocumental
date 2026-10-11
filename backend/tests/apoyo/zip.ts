import { crc32, inflateRawSync } from 'node:zlib';
import type { Test } from 'supertest';

/**
 * Abre un ZIP para las pruebas (un .xlsx): cada parte por su nombre, ya descomprimida y con su CRC
 * comprobado, como lo comprobaría Excel antes de abrirlo.
 */
export function leerZip(zip: Buffer): Map<string, string> {
  let fin = zip.length - 22;
  while (fin >= 0 && zip.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('No es un ZIP');
  const partes = new Map<string, string>();
  let posicion = zip.readUInt32LE(fin + 16);
  for (let n = zip.readUInt16LE(fin + 10); n > 0; n--) {
    if (zip.readUInt32LE(posicion) !== 0x02014b50) throw new Error('Directorio central dañado');
    const metodo = zip.readUInt16LE(posicion + 10);
    const crc = zip.readUInt32LE(posicion + 16);
    const comprimido = zip.readUInt32LE(posicion + 20);
    const largoDelNombre = zip.readUInt16LE(posicion + 28);
    const local = zip.readUInt32LE(posicion + 42);
    const nombre = zip.toString('utf8', posicion + 46, posicion + 46 + largoDelNombre);
    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error(`Cabecera local dañada: ${nombre}`);
    const inicio = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const datos = zip.subarray(inicio, inicio + comprimido);
    const contenido = metodo === 8 ? inflateRawSync(datos) : datos;
    if (crc32(contenido) !== crc) throw new Error(`CRC distinto en ${nombre}`);
    partes.set(nombre, contenido.toString('utf8'));
    posicion += 46 + largoDelNombre + zip.readUInt16LE(posicion + 30) + zip.readUInt16LE(posicion + 32);
  }
  return partes;
}

type Analizador = Extract<Parameters<Test['parse']>[0], (respuesta: never, listo: never) => void>;

/** Para supertest, que no lee un .xlsx: el cuerpo entero como Buffer (`.buffer(true).parse(binario)`). */
export const binario: Analizador = (respuesta, listo) => {
  const trozos: Buffer[] = [];
  respuesta.on('data', (trozo: Buffer) => trozos.push(trozo));
  respuesta.on('end', () => listo(null, Buffer.concat(trozos)));
  respuesta.on('error', (error: Error) => listo(error, Buffer.alloc(0)));
};

/** Los textos compartidos de un libro, en orden: lo que las celdas nombran por su número. */
export function textosDelLibro(partes: Map<string, string>): string[] {
  return [...(partes.get('xl/sharedStrings.xml') ?? '').matchAll(/<t xml:space="preserve">([\s\S]*?)<\/t>/g)]
    .map(([, texto]) => texto!.replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&'));
}
