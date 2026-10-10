import { generarDocumentos } from '../../backend/scripts/documentos-de-prueba.js';
import { pdfDeTexto } from '../../backend/scripts/pdf-de-texto.js';
import { PNG } from '../../backend/tests/apoyo/archivos.js';

/** Un documento de la prueba: lo que se sube al sistema y el texto que lleva dentro. */
export interface Documento {
  /** «01» a «52»: con esto se escriben los correctos de cada búsqueda. */
  clave: string;
  nombre: string;
  categoria: string;
  fecha: string;
  descripcion?: string;
  /** Lo que dice el archivo; vacío en una foto, que no tiene texto sin OCR. */
  texto: string;
  archivo: string;
  contenido: Buffer;
}

/** Las dos líneas que todos los documentos de prueba llevan para que nadie los confunda con reales: no son contenido. */
const AVISOS = ['DOCUMENTO DE PRUEBA', 'Generado para probar'];

/** El texto de un PDF de pdf-de-texto.ts: va sin comprimir, en operadores «(…) Tj». */
function textoDelPdf(pdf: Buffer): string {
  return [...pdf.toString('latin1').matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)]
    .map((coincidencia) => coincidencia[1]!.replace(/\\([\\()])/g, '$1'))
    .filter((linea) => linea && !AVISOS.some((aviso) => linea.startsWith(aviso)))
    .join('\n');
}

/**
 * Doce documentos más de la administración del mismo taller, todos ficticios: lo que una MYPE también guarda y
 * nombra a su manera. Dan búsquedas con otras palabras («arrendamiento», «impuestos») y dos fotos sin texto.
 */
const ADMINISTRACION: Omit<Documento, 'clave' | 'archivo' | 'contenido'>[] = [
  { nombre: 'Contrato de alquiler del local de Gamarra', categoria: 'Contratos', fecha: '2025-01-02',
    descripcion: 'Local del segundo piso de la galería (ficticia)',
    texto: 'Arrendador: Inmobiliaria Ejemplo (ficticia). Arrendatario: el taller.\nRenta mensual: S/ 1800.00. Vigencia: dos años.\nGarantía de dos meses.' },
  { nombre: 'Recibo de luz - marzo 2026', categoria: 'Otros', fecha: '2026-03-28',
    texto: 'Empresa eléctrica de prueba. Suministro 000-FICTICIO.\nConsumo del mes: 412 kWh. Importe a pagar: S/ 356.20.' },
  { nombre: 'Recibo por honorarios - contador', categoria: 'Facturas y boletas', fecha: '2026-02-05',
    texto: 'Servicio de contabilidad mensual: registro de compras y ventas, declaración del IGV y la renta.\nHonorarios: S/ 600.00.' },
  { nombre: 'Declaración mensual PDT 621 - febrero 2026', categoria: 'Otros', fecha: '2026-03-12',
    texto: 'Declaración del IGV y del impuesto a la renta del periodo 02/2026.\nTributo a pagar: S/ 1240.00. Presentada por el contador.' },
  { nombre: 'Póliza de seguro contra incendio', categoria: 'Contratos', fecha: '2025-06-01',
    texto: 'Aseguradora de prueba (ficticia). Cobertura de la maquinaria y la mercadería del taller.\nPrima anual: S/ 950.00.' },
  { nombre: 'Licencia de funcionamiento', categoria: 'Otros', fecha: '2024-11-20',
    descripcion: 'Municipalidad',
    texto: 'La municipalidad de ejemplo autoriza el giro de confección de prendas de vestir en el local de la galería.' },
  { nombre: 'Planilla de sueldos de febrero 2026', categoria: 'Recursos humanos', fecha: '2026-02-28',
    texto: 'Remuneraciones de seis colaboradores ficticios de costura y corte.\nTotal bruto: S/ 9600.00. Aportes a EsSalud: S/ 864.00.' },
  { nombre: 'Certificado de capacitación en remalladoras', categoria: 'Recursos humanos', fecha: '2025-09-15',
    texto: 'Se certifica que el colaborador C-10 aprobó el curso de manejo seguro de máquinas remalladoras.' },
  { nombre: 'Factura de compra de tela', categoria: 'Facturas y boletas', fecha: '2026-01-09',
    descripcion: 'Proveedor de tela jersey',
    texto: 'Proveedor: Textiles de Prueba SAC (ficticia).\n300 kg de tela jersey a S/ 22.00. Total con IGV: S/ 7788.00.' },
  { nombre: 'Informe de mantenimiento', categoria: 'Otros', fecha: '2025-12-03',
    texto: 'Un técnico ficticio revisó 8 máquinas de coser rectas y 3 remalladoras.\nSe cambiaron agujas y correas.' },
  // Dos fotos con el nombre que les pone el celular: sin OCR no tienen texto que buscar.
  { nombre: 'IMG_20260305_101522', categoria: 'Facturas y boletas', fecha: '2026-03-05', texto: '' },
  { nombre: 'Escaneo 2026-02-10', categoria: 'Otros', fecha: '2026-02-10', texto: '' },
];

export function crearCorpus(): Documento[] {
  const piloto = generarDocumentos().map((documento, indice) => ({
    clave: String(indice + 1).padStart(2, '0'),
    nombre: documento.nombre,
    categoria: documento.categoria,
    fecha: documento.fecha,
    texto: textoDelPdf(documento.contenido),
    archivo: documento.archivo,
    contenido: documento.contenido,
  }));
  const administracion = ADMINISTRACION.map((documento, indice) => {
    const clave = String(piloto.length + indice + 1).padStart(2, '0');
    const esFoto = documento.texto === '';
    return {
      ...documento,
      clave,
      archivo: esFoto ? `${documento.nombre}.png` : `${clave}-administracion.pdf`,
      contenido: esFoto ? PNG : pdfDeTexto(documento.texto.split('\n').map((texto) => ({ texto }))),
    };
  });
  return [...piloto, ...administracion];
}
