import { describe, expect, it } from 'vitest';
import { pdfDeTexto } from '../../scripts/pdf-de-texto.js';
import { fragmentoDelContenido } from '../../src/compartido/contenido/fragmento.js';
import { LIMITES, leerContenido } from '../../src/compartido/contenido/leer.js';
import { candidatas, palabrasClave } from '../../src/compartido/contenido/palabras-clave.js';
import { TIPOS } from '../../src/compartido/tipos-de-archivo.js';
import { crearZip } from '../../src/compartido/zip.js';
import { PNG } from '../apoyo/archivos.js';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const word = (parrafos: string[]) => crearZip([
  ['word/document.xml', `<w:document ${W}><w:body>${parrafos.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`],
  ['word/header1.xml', `<w:hdr ${W}><w:p><w:r><w:t>Confecciones Ejemplo &amp; Cía. — RUC 20600000014</w:t></w:r></w:p></w:hdr>`],
]);

describe('Lectura del contenido (D45)', () => {
  it('lee el texto de un PDF, con sus tildes', async () => {
    const pdf = pdfDeTexto([{ texto: 'Factura F001-000045' }, { texto: 'Cliente: Boutique Lucero (ficticia)' }, { texto: '12 x Polo de algodón pima = S/ 342.00' }]);
    const lectura = await leerContenido(pdf, TIPOS.pdf.mime);
    expect(lectura.estado).toBe('leido');
    expect(lectura.texto).toContain('Polo de algodón pima');
    expect(lectura.texto).toContain('Boutique Lucero');
  });

  it('lee un Word, también su encabezado, aunque Word parta las palabras en trozos', async () => {
    const docx = crearZip([
      ['word/document.xml', `<w:document ${W}><w:body><w:p><w:r><w:t>Pedido de algo</w:t></w:r><w:r><w:t>dón pima</w:t></w:r></w:p></w:body></w:document>`],
      ['word/header1.xml', `<w:hdr ${W}><w:p><w:r><w:t>RUC 20600000014</w:t></w:r></w:p></w:hdr>`],
    ]);
    const lectura = await leerContenido(docx, TIPOS.docx.mime);
    expect(lectura).toMatchObject({ estado: 'leido' });
    expect(lectura.texto).toContain('Pedido de algodón pima');
    expect(lectura.texto).toContain('RUC 20600000014');
  });

  it('lee un Excel: los textos comunes, los escritos en la celda y los números', async () => {
    const xlsx = crearZip([
      ['xl/sharedStrings.xml', '<sst><si><t>Producto</t></si><si><t>Casaca polar</t></si></sst>'],
      ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Precio</t></is></c></row>'
        + '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>62.5</v></c></row></sheetData></worksheet>'],
    ]);
    const lectura = await leerContenido(xlsx, TIPOS.xlsx.mime);
    // Una fila por renglón; las celdas, separadas por un espacio.
    expect(lectura.texto).toBe('Producto Precio\nCasaca polar 62.5');
  });

  it('una foto no tiene texto que leer; un PDF falso o un Word dañado quedan ilegibles, sin lanzar', async () => {
    expect(await leerContenido(PNG, 'image/png')).toMatchObject({ estado: 'no_admitido', texto: null });
    expect(await leerContenido(Buffer.from('%PDF-1.7\nbasura'), TIPOS.pdf.mime)).toMatchObject({ estado: 'ilegible', texto: null });
    expect(await leerContenido(Buffer.from('PK\u0003\u0004 no es un zip'), TIPOS.docx.mime)).toMatchObject({ estado: 'ilegible', texto: null });
  });

  it('frena una bomba de compresión: un Word que se infla más allá del límite queda ilegible', async () => {
    const bomba = crearZip([['word/document.xml', ' '.repeat(LIMITES.bytesDeXml + 1024)]]);
    expect(bomba.length).toBeLessThan(100_000);
    expect(await leerContenido(bomba, TIPOS.docx.mime)).toMatchObject({ estado: 'ilegible', motivo: 'supera el límite de tamaño' });
  });

  it('guarda como mucho 20.000 caracteres, sin partir una palabra', async () => {
    const largo = word(Array.from({ length: 900 }, (_, i) => `Cláusula ${i}: el arrendatario abona la renta del local.`));
    const lectura = await leerContenido(largo, TIPOS.docx.mime);
    expect(lectura).toMatchObject({ estado: 'leido', truncado: true });
    expect(lectura.texto!.length).toBeLessThanOrEqual(LIMITES.caracteres);
    expect(lectura.texto).toMatch(/[\p{L}\p{N}.:]$/u);
  });
});

describe('Palabras clave (D45)', () => {
  const factura = 'FACTURA ELECTRÓNICA F001-00000045. RUC 20600000014. Cliente: Boutique Lucero, RUC 20600000022. '
    + 'Fecha de emisión: 05/03/2026. 3 Casaca polar con capucha S/ 186.00. 2 Casaca polar S/ 124.00. Código P-001. '
    + 'Op. gravada: S/ 1,310.00 IGV: S/ 235.80 Importe total: S/ 1,545.80';

  it('reconoce RUC, comprobantes, montos (el mayor primero) y fechas, pero no un código de producto', () => {
    const { datos } = palabrasClave(factura);
    expect(datos.filter((dato) => dato.tipo === 'ruc').map((dato) => dato.valor)).toEqual(['20600000014', '20600000022']);
    expect(datos.filter((dato) => dato.tipo === 'comprobante').map((dato) => dato.valor)).toEqual(['F001-00000045']);
    expect(datos.filter((dato) => dato.tipo === 'monto').map((dato) => dato.valor)).toEqual(['S/ 1,545.80', 'S/ 1,310.00', 'S/ 235.80']);
    expect(datos.filter((dato) => dato.tipo === 'fecha').map((dato) => dato.valor)).toEqual(['05/03/2026']);
  });

  it('las palabras propias: sin vacías, con el plural sumado al singular, y las comunes en la empresa pesan menos', () => {
    expect(candidatas(factura)).toEqual(expect.arrayContaining(['casaca', 'polar', 'factura']));
    expect(candidatas(factura)).not.toContain('total');
    // «factura» y «electrónica» están en todas las facturas de la empresa; «casaca», en pocas.
    const rareza = (clave: string) => (['factura', 'electronica', 'cliente', 'emision', 'gravada'].includes(clave) ? 1 : 4);
    const { palabras } = palabrasClave(factura, rareza);
    expect(palabras.slice(0, 2)).toEqual(['casaca', 'polar']);
    expect(palabras.indexOf('factura')).toBeGreaterThan(palabras.indexOf('capucha'));
  });
});

describe('Fragmento del contenido (D45)', () => {
  const texto = 'Pedido del taller.\nEntrega de 120 m de tela de algodón pima en Gamarra, el lunes temprano, '
    + 'con la guía de remisión firmada y la factura del proveedor.';

  it('muestra unas palabras alrededor de la coincidencia, con el texto original y lo buscado resaltado', () => {
    const fragmento = fragmentoDelContenido(texto, ['algodon', 'pima'])!;
    expect(fragmento.filter((trozo) => trozo.resaltado).map((trozo) => trozo.texto)).toEqual(['algodón', 'pima']);
    const completo = fragmento.map((trozo) => trozo.texto).join('');
    expect(completo).toMatch(/^… .*120 m de tela de algodón pima en Gamarra.* …$/);
    expect(completo).not.toContain('\n');
  });

  it('el plural buscado resalta el singular, y sin coincidencia no hay fragmento', () => {
    expect(fragmentoDelContenido(texto, ['facturas'])?.find((trozo) => trozo.resaltado)?.texto).toBe('factura');
    expect(fragmentoDelContenido(texto, ['arrendamiento'])).toBeNull();
  });
});
