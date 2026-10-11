import { describe, expect, it } from 'vitest';
import { informeEnExcel, type Informe } from '../../src/compartido/excel/informe.js';
import { letra } from '../../src/compartido/excel/libro.js';
import { leerZip, textosDelLibro } from '../apoyo/zip.js';

function informe(filas: Informe['datos']['filas']): Informe {
  return {
    titulo: 'Listado documental',
    empresa: 'Taller de prueba (ficticio)',
    exportadoPor: 'Ana Torres',
    filtros: 'ninguno',
    tarjetas: [{ titulo: 'Documentos', valor: filas.length, nota: 'en este listado', color: '0F766E' }],
    secciones: [
      { titulo: 'Por categoría', columna: 'Categoría', filas: [['Contratos', 2], ['Otros', 1]] },
      { titulo: 'Por estado', columna: 'Estado', filas: [['Aprobada', 3]] },
    ],
    nota: 'Los datos están en la hoja «Documentos».',
    datos: {
      nombre: 'Documentos',
      columnas: [
        { titulo: 'Nombre', ancho: 40 }, { titulo: 'Fecha del documento', ancho: 14, tipo: 'fecha' },
        { titulo: 'Subido el', ancho: 17, tipo: 'fechaHora' }, { titulo: 'Peso (KB)', ancho: 10, tipo: 'decimal' },
        { titulo: 'Estado', ancho: 14, tipo: 'etiqueta' },
      ],
      filas,
    },
  };
}

/** El orden de los hijos de <worksheet> que exige el esquema de Excel; otro orden y pide «reparar» el archivo. */
const ORDEN_DE_LA_HOJA = ['dimension', 'sheetViews', 'sheetFormatPr', 'cols', 'sheetData', 'mergeCells', 'conditionalFormatting', 'pageMargins', 'pageSetup', 'tableParts'];
/** Los hijos en orden, sin repetir los seguidos: puede haber varios <conditionalFormatting> juntos. */
const hijosDe = (hoja: string) => [...hoja.matchAll(/<(dimension|sheetViews|sheetFormatPr|cols|sheetData|mergeCells|conditionalFormatting|pageMargins|pageSetup|tableParts)\b/g)]
  .map(([, nombre]) => nombre!).filter((nombre, i, todos) => nombre !== todos[i - 1]);

describe('Libro de Excel (D44)', () => {
  const filas = [
    ['Contrato de alquiler', '2026-03-01', '2026-10-09 15:34', 2.5, 'Aprobada'],
    ['=HIPERVINCULO("http://x.pe","clic")', '2026-01-10', '2026-10-09 08:00', 1, 'Pendiente'],
    ['Guía <remisión> & «flete»', null, null, null, null],
  ];
  const partes = leerZip(informeEnExcel(informe(filas)));

  it('es un paquete completo: libro, dos hojas, una tabla, estilos, tema, textos y propiedades, con su CRC correcto', () => {
    expect([...partes.keys()].sort()).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'docProps/app.xml', 'docProps/core.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml',
      'xl/styles.xml', 'xl/tables/table1.xml', 'xl/theme/theme1.xml', 'xl/workbook.xml', 'xl/worksheets/_rels/sheet2.xml.rels',
      'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml',
    ]);
    expect(partes.get('xl/workbook.xml')).toMatch(/<sheet name="Resumen" sheetId="1" r:id="rId1"\/><sheet name="Documentos" sheetId="2" r:id="rId2"\/>/);
    for (const tipo of ['worksheet', 'table', 'styles', 'sharedStrings', 'theme']) expect(partes.get('[Content_Types].xml')).toContain(tipo);
  });

  it('los datos van en una tabla de Excel con filtros, que Power BI lista por su nombre', () => {
    const tabla = partes.get('xl/tables/table1.xml')!;
    expect(tabla).toMatch(/name="Documentos" displayName="Documentos" ref="A1:E4" headerRowCount="1"/);
    expect(tabla).toContain('<autoFilter ref="A1:E4"/>');
    // Los nombres de las columnas de la tabla son exactamente los del encabezado de la hoja.
    expect([...tabla.matchAll(/<tableColumn id="\d+" name="([^"]+)"\/>/g)].map(([, nombre]) => nombre)).toEqual(['Nombre', 'Fecha del documento', 'Subido el', 'Peso (KB)', 'Estado']);
    expect(partes.get('xl/worksheets/_rels/sheet2.xml.rels')).toContain('Target="../tables/table1.xml"');
  });

  it('ningún texto se guarda como fórmula: lo que parece fórmula queda como texto, y los caracteres de XML escapados', () => {
    const todo = [...partes.values()].join('');
    expect(todo).not.toMatch(/<f[ >]/);
    expect(textosDelLibro(partes)).toContain('=HIPERVINCULO("http://x.pe","clic")');
    expect(textosDelLibro(partes)).toContain('Guía <remisión> & «flete»');
    expect(partes.get('xl/sharedStrings.xml')).toContain('Guía &lt;remisión&gt; &amp; «flete»');
  });

  it('las fechas son fechas de Excel con su formato, y los números, números', () => {
    const hoja = partes.get('xl/worksheets/sheet2.xml')!;
    // 1 de marzo de 2026 es el día 46082 desde el 30/12/1899; las 15:34 son 0,6486 de un día.
    expect(hoja).toMatch(/<c r="B2" s="\d+"><v>46082<\/v><\/c>/);
    expect(hoja).toMatch(/<c r="C2" s="\d+"><v>46304\.6486111/);
    expect(hoja).toMatch(/<c r="D2" s="\d+"><v>2\.5<\/v><\/c>/);
    expect(partes.get('xl/styles.xml')).toMatch(/formatCode="dd\/mm\/yyyy"/);
    expect(partes.get('xl/styles.xml')).toMatch(/formatCode="dd\/mm\/yyyy hh:mm"/);
  });

  it('el estado se colorea como etiqueta y las cantidades del resumen llevan barra', () => {
    expect(partes.get('xl/worksheets/sheet2.xml')).toMatch(/<conditionalFormatting sqref="E2:E4"><cfRule type="cellIs" dxfId="\d+" priority="1" operator="equal"><formula>"Aprobada"<\/formula>/);
    expect(partes.get('xl/worksheets/sheet1.xml')).toContain('<cfRule type="dataBar"');
    expect(partes.get('xl/styles.xml')).toMatch(/<dxfs count="[1-9]\d*">/);
  });

  it('cada hoja escribe sus partes en el orden que exige Excel, con el encabezado fijo y sin cuadrícula', () => {
    for (const nombre of ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
      const hijos = hijosDe(partes.get(nombre)!);
      expect(hijos).toEqual(ORDEN_DE_LA_HOJA.filter((hijo) => hijos.includes(hijo)));
    }
    expect(partes.get('xl/worksheets/sheet2.xml')).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    expect(partes.get('xl/worksheets/sheet1.xml')).toContain('showGridLines="0"');
  });

  it('sin filas, la tabla conserva una fila vacía: Excel no admite una tabla sin datos', () => {
    const vacio = leerZip(informeEnExcel(informe([])));
    expect(vacio.get('xl/tables/table1.xml')).toContain('ref="A1:E2"');
  });

  it('las columnas pasan de la Z a la AA', () => {
    expect([0, 25, 26, 27, 51, 52].map(letra)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  });
});
