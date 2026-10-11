import { crearZip } from './zip.js';

/*
 * Un libro de Excel (.xlsx) sin librerías: un ZIP de XML (Office Open XML). Escribe solo lo que usan las
 * exportaciones: hojas con estilos, celdas combinadas, formato condicional, paneles fijos y tablas de Excel.
 *
 * Ningún texto va como fórmula: todos son textos compartidos, así que un «=HIPERVINCULO(…)» que alguien
 * escribió en un documento se ve tal cual y no se ejecuta al abrir el archivo (inyección de fórmulas, D32).
 */

export interface Estilo {
  tamano?: number;
  negrita?: boolean;
  /** RRGGBB. */
  color?: string;
  /** La letra de los títulos (Aptos Display) en vez de la del texto (Aptos Narrow). */
  titulo?: boolean;
  relleno?: string;
  /** Una franja gruesa a la izquierda, del color dado: las tarjetas del resumen. */
  bordeIzquierdo?: string;
  bordeInferior?: string;
  /** Un formato de número de Excel: «dd/mm/yyyy», «#,##0», «0%»… */
  formato?: string;
  horizontal?: 'left' | 'center' | 'right';
  sangria?: number;
}

const FORMATOS_INCORPORADOS: Record<string, number> = { '#,##0': 3, '0%': 9 };
/** Los formatos propios empiezan aquí; los anteriores son los que Excel trae. */
const PRIMER_FORMATO_PROPIO = 164;

/** Cada combinación de estilo se registra una vez y las celdas la usan por su número. */
export class Estilos {
  private readonly fuentes = ['<font><sz val="11"/><color theme="1"/><name val="Aptos Narrow"/><family val="2"/><scheme val="minor"/></font>'];
  private readonly rellenos = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  private readonly bordes = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  private readonly formatos = new Map<string, number>();
  private readonly celdas = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private readonly condicionales: string[] = [];
  private readonly conocidos = new Map<string, number>();

  de(estilo: Estilo = {}): number {
    const clave = JSON.stringify(estilo);
    const conocido = this.conocidos.get(clave);
    if (conocido !== undefined) return conocido;
    const xf = `<xf numFmtId="${this.formato(estilo.formato)}" fontId="${this.fuente(estilo)}" fillId="${this.relleno(estilo.relleno)}" borderId="${this.borde(estilo)}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment${estilo.horizontal ? ` horizontal="${estilo.horizontal}"` : ''} vertical="center"${estilo.sangria ? ` indent="${estilo.sangria}"` : ''}/></xf>`;
    const indice = this.celdas.push(xf) - 1;
    this.conocidos.set(clave, indice);
    return indice;
  }

  /** Un formato condicional de texto y fondo; devuelve el número que lo nombra en las reglas. */
  condicional(color: string, fondo: string): number {
    return this.condicionales.push(`<dxf><font><color rgb="FF${color}"/></font><fill><patternFill><bgColor rgb="FF${fondo}"/></patternFill></fill></dxf>`) - 1;
  }

  private agregar(lista: string[], xml: string): number {
    const existente = lista.indexOf(xml);
    return existente >= 0 ? existente : lista.push(xml) - 1;
  }

  private fuente({ tamano, negrita, color, titulo }: Estilo): number {
    if (!tamano && !negrita && !color && !titulo) return 0;
    return this.agregar(this.fuentes, `<font>${negrita ? '<b/>' : ''}<sz val="${tamano ?? 11}"/>${color ? `<color rgb="FF${color}"/>` : '<color theme="1"/>'}`
      + `<name val="${titulo ? 'Aptos Display' : 'Aptos Narrow'}"/><family val="2"/><scheme val="${titulo ? 'major' : 'minor'}"/></font>`);
  }

  private relleno(color?: string): number {
    return color ? this.agregar(this.rellenos, `<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
  }

  private borde({ bordeIzquierdo, bordeInferior }: Estilo): number {
    if (!bordeIzquierdo && !bordeInferior) return 0;
    const izquierdo = bordeIzquierdo ? `<left style="thick"><color rgb="FF${bordeIzquierdo}"/></left>` : '<left/>';
    const inferior = bordeInferior ? `<bottom style="thin"><color rgb="FF${bordeInferior}"/></bottom>` : '<bottom/>';
    return this.agregar(this.bordes, `<border>${izquierdo}<right/><top/>${inferior}<diagonal/></border>`);
  }

  private formato(codigo?: string): number {
    if (!codigo) return 0;
    const incorporado = FORMATOS_INCORPORADOS[codigo];
    if (incorporado !== undefined) return incorporado;
    let id = this.formatos.get(codigo);
    if (id === undefined) {
      id = PRIMER_FORMATO_PROPIO + this.formatos.size;
      this.formatos.set(codigo, id);
    }
    return id;
  }

  xml(): string {
    const formatos = [...this.formatos].map(([codigo, id]) => `<numFmt numFmtId="${id}" formatCode="${escapar(codigo)}"/>`);
    return `${DECLARACION}<styleSheet xmlns="${SPREADSHEETML}">`
      + (formatos.length ? `<numFmts count="${formatos.length}">${formatos.join('')}</numFmts>` : '')
      + `<fonts count="${this.fuentes.length}">${this.fuentes.join('')}</fonts>`
      + `<fills count="${this.rellenos.length}">${this.rellenos.join('')}</fills>`
      + `<borders count="${this.bordes.length}">${this.bordes.join('')}</borders>`
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + `<cellXfs count="${this.celdas.length}">${this.celdas.join('')}</cellXfs>`
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + `<dxfs count="${this.condicionales.length}">${this.condicionales.join('')}</dxfs>`
      + '<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>';
  }
}

export type Valor = string | number | Date | null | undefined;

export interface Celda {
  valor: Valor;
  estilo?: number;
  /** «2026-10-09» o «2026-10-09 15:34» (hora de Lima, como la da la consulta), guardado como fecha de Excel. */
  esFecha?: boolean;
}

export interface Fila {
  alto?: number;
  celdas: (Celda | null)[];
}

export interface Hoja {
  nombre: string;
  filas: Fila[];
  anchos: number[];
  combinadas?: string[];
  /** Elementos <conditionalFormatting> ya armados. */
  condicionales?: string[];
  /** Una tabla de Excel: su nombre (el que ve Power BI), la fila de su encabezado (desde 1) y su ancho desde la A. */
  tabla?: { nombre: string; fila: number; columnas: number };
  /** Cuántas filas quedan fijas arriba al desplazarse. */
  fijas?: number;
  sinCuadricula?: boolean;
}

const DECLARACION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const SPREADSHEETML = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RELACIONES = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PAQUETE = 'http://schemas.openxmlformats.org/package/2006/relationships';
const TIPO = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
/** Excel cuenta los días desde el 30 de diciembre de 1899. */
const DIA_CERO = Date.UTC(1899, 11, 30);
const MAXIMO_EN_UNA_CELDA = 32_767;

/** Escapa para XML y quita los caracteres de control, que XML 1.0 no admite (salvo tabulador y saltos). */
export function escapar(texto: string): string {
  return texto
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

/** 0 → A, 25 → Z, 26 → AA. */
export function letra(columna: number): string {
  let resultado = '';
  for (let n = columna + 1; n > 0; n = Math.floor((n - 1) / 26)) resultado = String.fromCharCode(65 + ((n - 1) % 26)) + resultado;
  return resultado;
}

function numeroDeSerie(valor: Valor): number | null {
  if (valor instanceof Date) return (valor.getTime() - DIA_CERO) / 86_400_000;
  const partes = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(valor));
  if (!partes) return null;
  // Sin hora, medianoche: los grupos que faltan valen 0.
  const [anio, mes, dia, hora, minuto, segundo] = partes.slice(1).map((parte) => Number(parte ?? 0)) as [number, number, number, number, number, number];
  return (Date.UTC(anio, mes - 1, dia, hora, minuto, segundo) - DIA_CERO) / 86_400_000;
}

/** Los textos se guardan una vez en sharedStrings.xml y las celdas los nombran por su número. */
class TextosCompartidos {
  private readonly indices = new Map<string, number>();
  readonly lista: string[] = [];
  usos = 0;

  indice(texto: string): number {
    this.usos++;
    const cabe = texto.length > MAXIMO_EN_UNA_CELDA ? `${texto.slice(0, MAXIMO_EN_UNA_CELDA - 1)}…` : texto;
    let indice = this.indices.get(cabe);
    if (indice === undefined) {
      indice = this.lista.push(cabe) - 1;
      this.indices.set(cabe, indice);
    }
    return indice;
  }
}

function celdaXml(referencia: string, { valor, estilo, esFecha }: Celda, textos: TextosCompartidos): string {
  const s = estilo ? ` s="${estilo}"` : '';
  if (valor === null || valor === undefined || valor === '') return s ? `<c r="${referencia}"${s}/>` : '';
  if (esFecha || valor instanceof Date) {
    const serie = numeroDeSerie(valor);
    if (serie !== null) return `<c r="${referencia}"${s}><v>${serie}</v></c>`;
  }
  if (typeof valor === 'number' && Number.isFinite(valor)) return `<c r="${referencia}"${s}><v>${valor}</v></c>`;
  return `<c r="${referencia}"${s} t="s"><v>${textos.indice(String(valor))}</v></c>`;
}

function hojaXml(hoja: Hoja, textos: TextosCompartidos): string {
  const columnas = Math.max(1, hoja.anchos.length, ...hoja.filas.map((fila) => fila.celdas.length));
  const filas = hoja.filas.map((fila, f) => {
    const alto = fila.alto ? ` ht="${fila.alto}" customHeight="1"` : '';
    return `<row r="${f + 1}"${alto}>${fila.celdas.map((celda, c) => (celda ? celdaXml(`${letra(c)}${f + 1}`, celda, textos) : '')).join('')}</row>`;
  });
  const primera = hoja.fijas ? `A${hoja.fijas + 1}` : '';
  const panel = hoja.fijas
    ? `<pane ySplit="${hoja.fijas}" topLeftCell="${primera}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="${primera}" sqref="${primera}"/>`
    : '';
  // El orden de los elementos lo fija el esquema de Excel; otro orden y el archivo «necesita reparación».
  return `${DECLARACION}<worksheet xmlns="${SPREADSHEETML}" xmlns:r="${RELACIONES}">`
    + `<dimension ref="A1:${letra(columnas - 1)}${Math.max(1, hoja.filas.length)}"/>`
    + `<sheetViews><sheetView workbookViewId="0"${hoja.sinCuadricula ? ' showGridLines="0"' : ''}>${panel}</sheetView></sheetViews>`
    + '<sheetFormatPr defaultRowHeight="18" customHeight="1"/>'
    + `<cols>${hoja.anchos.map((ancho, c) => `<col min="${c + 1}" max="${c + 1}" width="${ancho}" customWidth="1"/>`).join('')}</cols>`
    + `<sheetData>${filas.join('')}</sheetData>`
    + (hoja.combinadas?.length ? `<mergeCells count="${hoja.combinadas.length}">${hoja.combinadas.map((rango) => `<mergeCell ref="${rango}"/>`).join('')}</mergeCells>` : '')
    + (hoja.condicionales ?? []).join('')
    + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
    + '<pageSetup paperSize="9" orientation="landscape"/>'
    + (hoja.tabla ? '<tableParts count="1"><tablePart r:id="rId1"/></tableParts>' : '')
    + '</worksheet>';
}

function tablaXml(hoja: Hoja, id: number): string {
  const { nombre, fila, columnas } = hoja.tabla!;
  const titulos = hoja.filas[fila - 1]!.celdas.slice(0, columnas).map((celda) => String(celda?.valor ?? ''));
  // Una tabla de Excel necesita al menos una fila bajo el encabezado, aunque esté vacía.
  const rango = `A${fila}:${letra(columnas - 1)}${Math.max(hoja.filas.length, fila + 1)}`;
  return `${DECLARACION}<table xmlns="${SPREADSHEETML}" id="${id}" name="${nombre}" displayName="${nombre}" ref="${rango}" headerRowCount="1" totalsRowShown="0">`
    + `<autoFilter ref="${rango}"/><tableColumns count="${columnas}">${titulos.map((titulo, c) => `<tableColumn id="${c + 1}" name="${escapar(titulo)}"/>`).join('')}</tableColumns>`
    + '<tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>';
}

/**
 * El tema de Office con los colores del sistema: el primer acento, el que usan el encabezado y las filas
 * alternadas de la tabla, es su verde azulado.
 */
const TEMA = `${DECLARACION}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Gestión documental"><a:themeElements>`
  + '<a:clrScheme name="Gestión documental"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>'
  + '<a:dk2><a:srgbClr val="0F172A"/></a:dk2><a:lt2><a:srgbClr val="F1F5F9"/></a:lt2><a:accent1><a:srgbClr val="0F766E"/></a:accent1><a:accent2><a:srgbClr val="0369A1"/></a:accent2>'
  + '<a:accent3><a:srgbClr val="4F46E5"/></a:accent3><a:accent4><a:srgbClr val="B45309"/></a:accent4><a:accent5><a:srgbClr val="15803D"/></a:accent5><a:accent6><a:srgbClr val="BE123C"/></a:accent6>'
  + '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>'
  + '<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Aptos Narrow"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
  + '<a:fmtScheme name="Office"><a:fillStyleLst>' + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3) + '</a:fillStyleLst>'
  + '<a:lnStyleLst>' + [6350, 12700, 19050].map((ancho) => `<a:ln w="${ancho}"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>`).join('') + '</a:lnStyleLst>'
  + '<a:effectStyleLst>' + '<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3) + '</a:effectStyleLst>'
  + '<a:bgFillStyleLst>' + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3) + '</a:bgFillStyleLst></a:fmtScheme>'
  + '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';

export class LibroDeExcel {
  readonly estilos = new Estilos();
  private readonly hojas: Hoja[] = [];

  agregar(hoja: Hoja): void {
    this.hojas.push(hoja);
  }

  aBuffer({ titulo, autor }: { titulo: string; autor: string }): Buffer {
    const textos = new TextosCompartidos();
    const partes: [string, string][] = [];
    let tablas = 0;
    this.hojas.forEach((hoja, i) => {
      partes.push([`xl/worksheets/sheet${i + 1}.xml`, hojaXml(hoja, textos)]);
      if (!hoja.tabla) return;
      tablas++;
      partes.push([`xl/tables/table${tablas}.xml`, tablaXml(hoja, tablas)]);
      partes.push([`xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
        `${DECLARACION}<Relationships xmlns="${PAQUETE}"><Relationship Id="rId1" Type="${RELACIONES}/table" Target="../tables/table${tablas}.xml"/></Relationships>`]);
    });
    const n = this.hojas.length;
    const ahora = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    return crearZip([
      ['[Content_Types].xml', `${DECLARACION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
        + `<Override PartName="/xl/workbook.xml" ContentType="${TIPO}.sheet.main+xml"/>`
        + this.hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${TIPO}.worksheet+xml"/>`).join('')
        + Array.from({ length: tablas }, (_, i) => `<Override PartName="/xl/tables/table${i + 1}.xml" ContentType="${TIPO}.table+xml"/>`).join('')
        + '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
        + `<Override PartName="/xl/styles.xml" ContentType="${TIPO}.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="${TIPO}.sharedStrings+xml"/>`
        + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>'],
      ['_rels/.rels', `${DECLARACION}<Relationships xmlns="${PAQUETE}"><Relationship Id="rId1" Type="${RELACIONES}/officeDocument" Target="xl/workbook.xml"/>`
        + `<Relationship Id="rId2" Type="${PAQUETE}/metadata/core-properties" Target="docProps/core.xml"/>`
        + `<Relationship Id="rId3" Type="${RELACIONES}/extended-properties" Target="docProps/app.xml"/></Relationships>`],
      ['docProps/core.xml', `${DECLARACION}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
        + `<dc:title>${escapar(titulo)}</dc:title><dc:creator>${escapar(autor)}</dc:creator>`
        + `<dcterms:created xsi:type="dcterms:W3CDTF">${ahora}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${ahora}</dcterms:modified></cp:coreProperties>`],
      ['docProps/app.xml', `${DECLARACION}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Gestión documental</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged></Properties>`],
      ['xl/workbook.xml', `${DECLARACION}<workbook xmlns="${SPREADSHEETML}" xmlns:r="${RELACIONES}"><workbookPr defaultThemeVersion="164011"/><bookViews><workbookView activeTab="0"/></bookViews><sheets>`
        + this.hojas.map((hoja, i) => `<sheet name="${escapar(hoja.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', `${DECLARACION}<Relationships xmlns="${PAQUETE}">`
        + this.hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${RELACIONES}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + `<Relationship Id="rId${n + 1}" Type="${RELACIONES}/styles" Target="styles.xml"/><Relationship Id="rId${n + 2}" Type="${RELACIONES}/sharedStrings" Target="sharedStrings.xml"/>`
        + `<Relationship Id="rId${n + 3}" Type="${RELACIONES}/theme" Target="theme/theme1.xml"/></Relationships>`],
      ['xl/theme/theme1.xml', TEMA],
      ['xl/styles.xml', this.estilos.xml()],
      ...partes,
      ['xl/sharedStrings.xml', `${DECLARACION}<sst xmlns="${SPREADSHEETML}" count="${textos.usos}" uniqueCount="${textos.lista.length}">`
        + textos.lista.map((texto) => `<si><t xml:space="preserve">${escapar(texto)}</t></si>`).join('') + '</sst>'],
    ]);
  }
}
