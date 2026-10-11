/**
 * Los archivos de la prueba, todos ficticios y siempre los mismos. Cada uno lleva el texto que se escribió
 * en él, para medir cuánto de eso recupera el lector.
 *
 * - Los 40 PDF del piloto (D34): simples, sin comprimir y con Helvetica.
 * - Comprobantes electrónicos como los que emite una MYPE: comprimidos, con la fuente incrustada y en
 *   columnas, que es lo difícil de leer en orden.
 * - Un contrato de 40 páginas, un escaneo sin texto cerca de los 10 MB, un Word y un Excel.
 * - Lo que el sistema no lee (una foto y un .doc antiguo) y lo que intenta romper el lector: una bomba de
 *   compresión, un PDF cortado, uno con contraseña y uno falso.
 *
 * Los RUC tienen el dígito verificador mal a propósito: ninguno puede ser el de una empresa real.
 */
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { crc32, createDeflateRaw, deflateRawSync, deflateSync } from 'node:zlib';
import PDFDocument from 'pdfkit';
import { generarDocumentos } from '../../backend/scripts/documentos-de-prueba.js';
import { DOCX, PDF, XLSX, type Lectura } from './leer.js';

export type Grupo = 'piloto' | 'comprobante' | 'contrato' | 'escaneo' | 'word' | 'excel' | 'no_admitido' | 'hostil';

export interface Archivo {
  clave: string;
  nombre: string;
  grupo: Grupo;
  mime: string;
  extension: string;
  contenido: Buffer;
  /** Lo que se escribió en el archivo; vacío si no tiene texto. */
  original: string;
  /** Lo que el lector debería responder; «sin romperse», cuando cualquier respuesta vale mientras no falle. */
  esperado: Lectura['estado'] | 'sin_romperse';
}

function aleatorio(semilla: number) {
  let estado = semilla >>> 0;
  return (maximo: number) => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = Math.imul(estado ^ (estado >>> 15), estado | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4_294_967_296 * maximo) | 0;
  };
}

/** Diez dígitos y un verificador que no es el que corresponde (módulo 11 de SUNAT, más uno). */
export function rucFicticio(diez: string): string {
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = [...diez].reduce((total, digito, i) => total + Number(digito) * pesos[i]!, 0);
  const resto = 11 - (suma % 11);
  const correcto = resto === 10 ? 0 : resto === 11 ? 1 : resto;
  return `${diez}${(correcto + 1) % 10}`;
}

const soles = (monto: number) => `S/ ${monto.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fuente = (nombre: string) => fileURLToPath(new URL(`./node_modules/dejavu-fonts-ttf/ttf/${nombre}`, import.meta.url));

function aPdf(dibujar: (documento: PDFKit.PDFDocument) => void, opciones: PDFKit.PDFDocumentOptions = {}): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    const documento = new PDFDocument({ size: 'A4', margin: 50, compress: true, info: { Producer: 'Prueba aislada (datos ficticios)' }, ...opciones });
    const trozos: Buffer[] = [];
    documento.on('data', (trozo: Buffer) => trozos.push(trozo));
    documento.on('end', () => resolver(Buffer.concat(trozos)));
    documento.on('error', rechazar);
    dibujar(documento);
    documento.end();
  });
}

// ---------------------------------------------------------------------------------------------------------
// Comprobantes electrónicos

const EMISOR = { razon: 'Confecciones Ejemplo S.A.C. (ficticia)', ruc: rucFicticio('2060000001'), direccion: 'Jr. Gamarra 000, La Victoria, Lima (ficticia)' };
const CLIENTES = [
  { razon: 'Boutique Lucero E.I.R.L. (ficticia)', ruc: rucFicticio('2060000002') },
  { razon: 'Distribuidora Norte de Prueba S.A.C.', ruc: rucFicticio('2060000003') },
  { razon: 'Uniformes de Muestra S.R.L.', ruc: rucFicticio('2060000004') },
];
const PRODUCTOS = [
  ['Polo de algodón pima talla M', 'UND', 28.5], ['Tela jersey 30/1 azul marino', 'KG', 24], ['Hilo poliéster 40/2', 'CONO', 9.2],
  ['Botones de nácar 15 mm', 'CIENTO', 18], ['Cierre metálico 18 cm', 'UND', 1.4], ['Casaca polar con capucha', 'UND', 62],
  ['Servicio de bordado computarizado', 'SERV', 350], ['Etiqueta tejida con logo', 'MILLAR', 120],
] as const;

interface Comprobante {
  tipo: 'FACTURA ELECTRÓNICA' | 'BOLETA DE VENTA ELECTRÓNICA' | 'GUÍA DE REMISIÓN REMITENTE ELECTRÓNICA';
  serie: string;
  numero: number;
  fecha: string;
}

async function comprobante({ tipo, serie, numero, fecha }: Comprobante, azar: (n: number) => number): Promise<{ contenido: Buffer; original: string }> {
  const escrito: string[] = [];
  const cliente = CLIENTES[azar(CLIENTES.length)]!;
  const lineas = Array.from({ length: 2 + azar(4) }, () => {
    const [descripcion, unidad, precio] = PRODUCTOS[azar(PRODUCTOS.length)]!;
    const cantidad = 1 + azar(80);
    return { descripcion, unidad, precio, cantidad, importe: cantidad * precio };
  });
  const gravada = lineas.reduce((total, linea) => total + linea.importe, 0);
  const contenido = await aPdf((pdf) => {
    pdf.registerFont('normal', fuente('DejaVuSans.ttf'));
    pdf.registerFont('negrita', fuente('DejaVuSans-Bold.ttf'));
    const escribir = (texto: string, x: number, y: number, opciones: PDFKit.Mixins.TextOptions & { negrita?: boolean; tamano?: number } = {}) => {
      escrito.push(texto);
      pdf.font(opciones.negrita ? 'negrita' : 'normal').fontSize(opciones.tamano ?? 9).text(texto, x, y, { lineBreak: false, ...opciones });
    };
    escribir(EMISOR.razon, 50, 50, { negrita: true, tamano: 12 });
    escribir(EMISOR.direccion, 50, 68);
    pdf.rect(360, 45, 185, 70).stroke();
    escribir(`RUC N° ${EMISOR.ruc}`, 370, 55, { negrita: true, tamano: 11 });
    escribir(tipo, 370, 75, { negrita: true, tamano: tipo.length > 20 ? 7 : 10 });
    escribir(`${serie}-${String(numero).padStart(8, '0')}`, 370, 95, { negrita: true, tamano: 11 });
    escribir(`Fecha de emisión: ${fecha}`, 50, 135);
    escribir(`Señor(es): ${cliente.razon}`, 50, 150);
    escribir(`RUC: ${cliente.ruc}`, 50, 165);
    escribir('Moneda: SOLES', 380, 135);
    if (tipo.startsWith('GUÍA')) {
      escribir('Punto de partida: Jr. Gamarra 000, La Victoria (ficticio)', 50, 180);
      escribir('Punto de llegada: Av. Ejemplo 123, Los Olivos (ficticio)', 50, 195);
      escribir('Motivo de traslado: Venta', 380, 180);
    }
    let y = 225;
    const columnas = [50, 100, 155, 400, 480];
    ['Cant.', 'Unidad', 'Descripción', 'V. unitario', 'Importe'].forEach((titulo, i) => escribir(titulo, columnas[i]!, y, { negrita: true }));
    pdf.moveTo(50, y + 14).lineTo(545, y + 14).stroke();
    for (const linea of lineas) {
      y += 20;
      escribir(String(linea.cantidad), columnas[0]!, y);
      escribir(linea.unidad, columnas[1]!, y);
      escribir(linea.descripcion, columnas[2]!, y);
      escribir(linea.precio.toFixed(2), columnas[3]!, y);
      escribir(linea.importe.toFixed(2), columnas[4]!, y);
    }
    y += 40;
    escribir(`Op. gravada: ${soles(gravada)}`, 380, y);
    escribir(`IGV 18%: ${soles(gravada * 0.18)}`, 380, y + 15);
    escribir(`Importe total: ${soles(gravada * 1.18)}`, 380, y + 30, { negrita: true });
    escribir(`Representación impresa de la ${tipo.toLowerCase()}. Documento de prueba con datos ficticios.`, 50, 760, { tamano: 7 });
  });
  return { contenido, original: escrito.join('\n') };
}

// ---------------------------------------------------------------------------------------------------------
// Contrato largo, escaneo, Word y Excel

const CLAUSULAS = [
  'El arrendador cede en uso al arrendatario el local comercial ubicado en la galería de Gamarra, con un área de cuarenta metros cuadrados, para el funcionamiento de un taller de confecciones textiles.',
  'La renta mensual se fija en mil ochocientos soles, que el arrendatario abonará por adelantado dentro de los cinco primeros días de cada mes en la cuenta que indique el arrendador.',
  'El arrendatario entrega una garantía equivalente a dos meses de renta, que le será devuelta al término del contrato, previa verificación del estado del local y de sus instalaciones eléctricas.',
  'El plazo del contrato es de dos años, renovable por acuerdo de ambas partes con una anticipación no menor de sesenta días calendario a su vencimiento.',
  'Queda prohibido el subarriendo total o parcial del local, así como el cambio de giro del negocio, sin autorización previa y por escrito del arrendador.',
  'Los gastos de luz, agua, arbitrios y mantenimiento de la galería corren por cuenta del arrendatario desde la fecha de entrega de las llaves.',
  'Cualquier controversia se resolverá mediante trato directo y, de no ser posible, ante los jueces del distrito judicial de Lima, renunciando las partes al fuero de sus domicilios.',
];

async function contratoLargo(paginas: number): Promise<{ contenido: Buffer; original: string }> {
  const parrafos: string[] = ['CONTRATO DE ARRENDAMIENTO DE LOCAL COMERCIAL (DOCUMENTO DE PRUEBA, DATOS FICTICIOS)'];
  const ordinales = ['PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA', 'QUINTA', 'SEXTA', 'SÉTIMA'];
  // Unos 4.300 caracteres caben en una página a 11 puntos, justificada.
  for (let i = 0; parrafos.join('').length < paginas * 4_300; i++) {
    parrafos.push(`CLÁUSULA ${ordinales[i % 7]} (anexo ${Math.floor(i / 7) + 1}): ${CLAUSULAS[i % 7]}`);
  }
  const contenido = await aPdf((pdf) => {
    pdf.font('Times-Roman').fontSize(11);
    for (const parrafo of parrafos) pdf.text(parrafo, { align: 'justify', paragraphGap: 8 });
  });
  return { contenido, original: parrafos.join('\n') };
}

/** Un PNG en escala de grises, como lo deja un escáner a 200 ppp: fondo claro con ruido y renglones oscuros. */
function pngDeEscaneo(ancho: number, alto: number, semilla: number): Buffer {
  const azar = aleatorio(semilla);
  const filas = Buffer.alloc((ancho + 1) * alto);
  for (let y = 0; y < alto; y++) {
    const renglon = y % 60 > 38 && y % 60 < 50;
    for (let x = 0; x < ancho; x++) filas[y * (ancho + 1) + 1 + x] = renglon && azar(3) === 0 ? 40 + azar(60) : 220 + azar(36);
  }
  const trozo = (tipo: string, datos: Buffer) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const cuerpo = Buffer.concat([Buffer.from(tipo, 'latin1'), datos]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(cuerpo));
    return Buffer.concat([largo, cuerpo, crc]);
  };
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(ancho, 0);
  cabecera.writeUInt32BE(alto, 4);
  cabecera.set([8, 0, 0, 0, 0], 8); // 8 bits, gris, sin entrelazar
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo('IHDR', cabecera),
    trozo('IDAT', deflateSync(filas)), trozo('IEND', Buffer.alloc(0))]);
}

async function escaneo(paginas: number): Promise<Buffer> {
  return aPdf((pdf) => {
    for (let i = 0; i < paginas; i++) {
      if (i > 0) pdf.addPage();
      pdf.image(pngDeEscaneo(1654, 2339, 7 + i), 0, 0, { width: 595, height: 842 });
    }
  }, { margin: 0 });
}

interface ParteDeZip {
  nombre: string;
  datos?: string | Buffer;
  /** Para la bomba: lo ya comprimido, con un tamaño declarado que miente. */
  comprimido?: { datos: Buffer; crc: number; declarado: number };
}

function crearZip(partes: ParteDeZip[]): Buffer {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const parte of partes) {
    const original = parte.datos === undefined ? null : Buffer.isBuffer(parte.datos) ? parte.datos : Buffer.from(parte.datos, 'utf8');
    const comprimido = parte.comprimido?.datos ?? deflateRawSync(original!);
    const crc = parte.comprimido?.crc ?? crc32(original!);
    const tamano = parte.comprimido?.declarado ?? original!.length;
    const nombre = Buffer.from(parte.nombre, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0x5a21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(tamano, 22);
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
    central.writeUInt32LE(tamano, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    locales.push(local, nombre, comprimido);
    centrales.push(central, nombre);
    desplazamiento += 30 + nombre.length + comprimido.length;
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

const xml = (texto: string) => texto.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function docxDe(cuerpo: string, encabezado: string): Buffer {
  return crearZip([
    { nombre: '[Content_Types].xml', datos: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>' },
    { nombre: '_rels/.rels', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>` },
    { nombre: 'word/_rels/document.xml.rels', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/header" Target="header1.xml"/></Relationships>` },
    { nombre: 'word/document.xml', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${cuerpo}<w:sectPr><w:headerReference w:type="default" r:id="rId1"/></w:sectPr></w:body></w:document>` },
    { nombre: 'word/header1.xml', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}><w:p><w:r><w:t xml:space="preserve">${xml(encabezado)}</w:t></w:r></w:p></w:hdr>` },
  ]);
}

function contratoEnWord(): { contenido: Buffer; original: string } {
  const encabezado = `${EMISOR.razon} - RUC ${EMISOR.ruc}`;
  const parrafos = [
    'CONTRATO DE SERVICIO DE CONFECCIÓN POR TEMPORADA (DATOS FICTICIOS)',
    `Conste por el presente documento el contrato que celebran ${EMISOR.razon}, con RUC ${EMISOR.ruc}, y ${CLIENTES[0]!.razon}, con RUC ${CLIENTES[0]!.ruc}, el 15/02/2026.`,
    ...CLAUSULAS.slice(1, 6),
    'El pedido comprende 1,200 polos de algodón pima y 300 casacas polares, por un total de S/ 52,800.00, con entrega en tres partes.',
  ];
  // Word parte las palabras en varios trozos cuando cambia el formato o la revisión ortográfica: «algo» + «dón».
  const cuerpo = parrafos.map((parrafo) => {
    const corte = parrafo.indexOf('algodón');
    const trozos = corte < 0 ? [parrafo] : [parrafo.slice(0, corte + 4), parrafo.slice(corte + 4)];
    return `<w:p>${trozos.map((trozo) => `<w:r><w:t xml:space="preserve">${xml(trozo)}</w:t></w:r>`).join('')}</w:p>`;
  }).join('') + `<w:tbl>${[['Prenda', 'Cantidad', 'Precio'], ['Polo de algodón pima', '1200', 'S/ 28.50'], ['Casaca polar', '300', 'S/ 62.00']]
    .map((fila) => `<w:tr>${fila.map((celda) => `<w:tc><w:p><w:r><w:t>${xml(celda)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
  const tabla = 'Prenda Cantidad Precio Polo de algodón pima 1200 S/ 28.50 Casaca polar 300 S/ 62.00';
  return { contenido: docxDe(cuerpo, encabezado), original: [encabezado, ...parrafos, tabla].join('\n') };
}

function excelDePrecios(): { contenido: Buffer; original: string } {
  const precios = [['Código', 'Producto', 'Unidad', 'Precio', 'Stock'],
    ...PRODUCTOS.map(([producto, unidad, precio], i) => [`P-${String(i + 1).padStart(3, '0')}`, producto, unidad, precio, 10 + i * 7])];
  const proveedores = [['RUC', 'Razón social', 'Rubro'], ...CLIENTES.map((cliente, i) => [Number(cliente.ruc), cliente.razon, ['Telas', 'Avíos', 'Hilos'][i]!])];
  const comunes: string[] = [];
  const indice = (texto: string) => (comunes.includes(texto) ? comunes.indexOf(texto) : comunes.push(texto) - 1);
  const hoja = (filas: (string | number)[][], enLinea = false) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${
    filas.map((fila, f) => `<row r="${f + 1}">${fila.map((celda, c) => {
      const ref = `${String.fromCharCode(65 + c)}${f + 1}`;
      if (typeof celda === 'number') return `<c r="${ref}"><v>${celda}</v></c>`;
      // Algunas celdas van escritas en la propia hoja, como las deja un programa que no es Excel.
      return enLinea && c === 1 ? `<c r="${ref}" t="inlineStr"><is><t>${xml(celda)}</t></is></c>` : `<c r="${ref}" t="s"><v>${indice(celda)}</v></c>`;
    }).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const hoja1 = hoja(precios);
  const hoja2 = hoja(proveedores, true);
  const tipos = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
  const contenido = crearZip([
    { nombre: '[Content_Types].xml', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${tipos}.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${tipos}.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="${tipos}.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="${tipos}.sharedStrings+xml"/></Types>` },
    { nombre: '_rels/.rels', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { nombre: 'xl/workbook.xml', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}"><sheets><sheet name="Precios" sheetId="1" r:id="rId1"/><sheet name="Proveedores" sheetId="2" r:id="rId2"/></sheets></workbook>` },
    { nombre: 'xl/_rels/workbook.xml.rels', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>` },
    { nombre: 'xl/worksheets/sheet1.xml', datos: hoja1 },
    { nombre: 'xl/worksheets/sheet2.xml', datos: hoja2 },
    { nombre: 'xl/sharedStrings.xml', datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${comunes.length}" uniqueCount="${comunes.length}">${comunes.map((texto) => `<si><t>${xml(texto)}</t></si>`).join('')}</sst>` },
  ]);
  return { contenido, original: [...precios, ...proveedores].map((fila) => fila.join(' ')).join('\n') };
}

// ---------------------------------------------------------------------------------------------------------
// Lo que intenta romper el lector

/** Un Word cuyo document.xml se infla a `megas` MB de espacios y declara medir 4 KB. */
async function bomba(megas: number): Promise<Buffer> {
  const compresor = createDeflateRaw({ level: 9 });
  const trozos: Buffer[] = [];
  compresor.on('data', (trozo: Buffer) => trozos.push(trozo));
  const mega = Buffer.alloc(1 << 20, 0x20);
  let crc = 0;
  for (let i = 0; i < megas; i++) {
    crc = crc32(mega, crc);
    if (!compresor.write(mega)) await once(compresor, 'drain');
  }
  compresor.end();
  await once(compresor, 'end');
  return crearZip([{ nombre: 'word/document.xml', comprimido: { datos: Buffer.concat(trozos), crc, declarado: 4096 } }]);
}

export async function crearArchivos(): Promise<Archivo[]> {
  const archivos: Archivo[] = [];
  const agregar = (archivo: Omit<Archivo, 'clave'>) => archivos.push({ clave: String(archivos.length + 1).padStart(2, '0'), ...archivo });

  for (const documento of generarDocumentos()) {
    const original = [...documento.contenido.toString('latin1').matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)]
      .map((coincidencia) => coincidencia[1]!.replace(/\\([\\()])/g, '$1')).join('\n');
    agregar({ nombre: documento.nombre, grupo: 'piloto', mime: PDF, extension: 'pdf', contenido: documento.contenido, original, esperado: 'leido' });
  }

  const azar = aleatorio(2026);
  const comprobantes: Comprobante[] = [
    { tipo: 'FACTURA ELECTRÓNICA', serie: 'F001', numero: 45, fecha: '05/03/2026' },
    { tipo: 'FACTURA ELECTRÓNICA', serie: 'F001', numero: 46, fecha: '12/03/2026' },
    { tipo: 'FACTURA ELECTRÓNICA', serie: 'F001', numero: 51, fecha: '02/04/2026' },
    { tipo: 'BOLETA DE VENTA ELECTRÓNICA', serie: 'B001', numero: 1203, fecha: '06/03/2026' },
    { tipo: 'BOLETA DE VENTA ELECTRÓNICA', serie: 'B001', numero: 1250, fecha: '20/03/2026' },
    { tipo: 'GUÍA DE REMISIÓN REMITENTE ELECTRÓNICA', serie: 'T001', numero: 310, fecha: '05/03/2026' },
  ];
  for (const datos of comprobantes) {
    const { contenido, original } = await comprobante(datos, azar);
    const titulo = datos.tipo.split(' ').slice(0, datos.tipo.startsWith('GUÍA') ? 3 : 1).join(' ').toLowerCase();
    agregar({ nombre: `${titulo} ${datos.serie}-${datos.numero}`, grupo: 'comprobante', mime: PDF, extension: 'pdf', contenido, original, esperado: 'leido' });
  }

  const contrato = await contratoLargo(40);
  agregar({ nombre: 'Contrato de arrendamiento largo', grupo: 'contrato', mime: PDF, extension: 'pdf', ...contrato, esperado: 'leido' });
  agregar({ nombre: 'Escaneo de dos páginas, sin texto', grupo: 'escaneo', mime: PDF, extension: 'pdf', contenido: await escaneo(2), original: '', esperado: 'sin_texto' });
  agregar({ nombre: 'Contrato de servicio en Word', grupo: 'word', mime: DOCX, extension: 'docx', ...contratoEnWord(), esperado: 'leido' });
  agregar({ nombre: 'Lista de precios y proveedores en Excel', grupo: 'excel', mime: XLSX, extension: 'xlsx', ...excelDePrecios(), esperado: 'leido' });

  agregar({ nombre: 'Foto de un recibo (PNG)', grupo: 'no_admitido', mime: 'image/png', extension: 'png', contenido: pngDeEscaneo(800, 600, 3), original: '', esperado: 'no_admitido' });
  agregar({ nombre: 'Word antiguo (.doc)', grupo: 'no_admitido', mime: 'application/msword', extension: 'doc',
    contenido: Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(4096)]), original: '', esperado: 'no_admitido' });

  agregar({ nombre: 'Bomba: Word que se infla a 200 MB', grupo: 'hostil', mime: DOCX, extension: 'docx', contenido: await bomba(200), original: '', esperado: 'ilegible' });
  const factura = archivos.find((archivo) => archivo.grupo === 'comprobante')!;
  agregar({ nombre: 'PDF cortado a la mitad', grupo: 'hostil', mime: PDF, extension: 'pdf',
    contenido: factura.contenido.subarray(0, factura.contenido.length >> 1), original: '', esperado: 'sin_romperse' });
  const conClave = await aPdf((pdf) => pdf.font('Helvetica').fontSize(12).text('Factura F001-00000099 protegida (ficticia)'), { userPassword: 'ficticia', ownerPassword: 'ficticia-dueno' });
  agregar({ nombre: 'PDF con contraseña', grupo: 'hostil', mime: PDF, extension: 'pdf', contenido: conClave, original: '', esperado: 'ilegible' });
  const ruido = aleatorio(9);
  agregar({ nombre: 'PDF falso (cabecera y ruido)', grupo: 'hostil', mime: PDF, extension: 'pdf',
    contenido: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from(Array.from({ length: 50_000 }, () => ruido(256)))]), original: '', esperado: 'ilegible' });
  return archivos;
}
