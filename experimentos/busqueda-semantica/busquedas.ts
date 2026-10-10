/**
 * Las búsquedas de la prueba, cada una con los documentos que una persona aceptaría como respuesta (por su
 * clave de corpus.ts). Las escribió quien conoce los documentos: el informe lo dice, separa los grupos y este
 * archivo se puede ampliar con búsquedas de otras personas sin tocar nada más.
 */
export const GRUPOS = {
  nombre: 'Por el nombre (control)',
  sinonimo: 'Con otra palabra',
  contenido: 'Por lo que dice el documento',
  error: 'Con errores de escritura',
  sinRespuesta: 'Sin respuesta correcta',
  foto: 'Fotos sin texto',
} as const;
export type Grupo = keyof typeof GRUPOS;

export interface Busqueda {
  grupo: Grupo;
  texto: string;
  correctos: string[];
}

const COTIZACIONES = ['05', '13', '21', '29', '37'];
const GUIAS = ['03', '11', '19', '27', '35'];
const CONSTANCIAS = ['07', '15', '23', '31', '39'];
const ACTAS = ['08', '16', '24', '32', '40'];

export const BUSQUEDAS: Busqueda[] = [
  { grupo: 'nombre', texto: 'factura F001-000214', correctos: ['17'] },
  { grupo: 'nombre', texto: 'cotización Comercial Ejemplo Gamarra', correctos: ['05', '29'] },
  { grupo: 'nombre', texto: 'guía de remisión Boutique Lucero', correctos: ['27', '35'] },
  { grupo: 'nombre', texto: 'contrato de alquiler', correctos: ['41'] },
  { grupo: 'nombre', texto: 'planilla febrero', correctos: ['47'] },
  { grupo: 'nombre', texto: 'acta de reunión', correctos: ACTAS },
  { grupo: 'nombre', texto: 'orden de compra Moda Simulada', correctos: ['28'] },
  { grupo: 'nombre', texto: 'recibo de luz', correctos: ['42'] },

  { grupo: 'sinonimo', texto: 'presupuesto para Uniformes de Muestra', correctos: ['13', '37'] },
  { grupo: 'sinonimo', texto: 'certificado laboral', correctos: CONSTANCIAS },
  { grupo: 'sinonimo', texto: 'despacho de mercadería a Tienda Demostración Sur', correctos: ['11'] },
  { grupo: 'sinonimo', texto: 'arrendamiento del local', correctos: ['41'] },
  { grupo: 'sinonimo', texto: 'pedido de compra de Distribuidora Norte', correctos: ['04'] },
  { grupo: 'sinonimo', texto: 'comprobantes de venta de Comercial Ejemplo Gamarra', correctos: ['02', '26'] },
  { grupo: 'sinonimo', texto: 'pago al contador', correctos: ['43'] },
  { grupo: 'sinonimo', texto: 'impuestos de febrero', correctos: ['44'] },
  { grupo: 'sinonimo', texto: 'seguro del taller', correctos: ['45'] },
  { grupo: 'sinonimo', texto: 'permiso municipal', correctos: ['46'] },
  { grupo: 'sinonimo', texto: 'sueldos de los trabajadores', correctos: ['47'] },
  { grupo: 'sinonimo', texto: 'reparación de las máquinas', correctos: ['50'] },
  { grupo: 'sinonimo', texto: 'acuerdo con Boutique Lucero', correctos: ['22', '38'] },

  { grupo: 'contenido', texto: 'chompas de alpaca', correctos: ['20', '29', '36', '37'] },
  { grupo: 'contenido', texto: 'ordenar el almacén de telas', correctos: ACTAS },
  { grupo: 'contenido', texto: 'colaborador C-35', correctos: ['07'] },
  { grupo: 'contenido', texto: 'casaca polar Boutique Lucero', correctos: ['21', '35'] },
  { grupo: 'contenido', texto: 'uniforme escolar', correctos: ['05', '17', '33', '34', '35'] },
  { grupo: 'contenido', texto: 'renta mensual del local', correctos: ['41'] },
  { grupo: 'contenido', texto: 'remalladoras', correctos: ['48', '50'] },
  { grupo: 'contenido', texto: 'tela jersey del proveedor', correctos: ['49'] },

  { grupo: 'error', texto: 'cotizasion', correctos: COTIZACIONES },
  { grupo: 'error', texto: 'gia de remision', correctos: GUIAS },
  { grupo: 'error', texto: 'contrto de alquiler', correctos: ['41'] },
  { grupo: 'error', texto: 'constansia de trabajo', correctos: CONSTANCIAS },
  { grupo: 'error', texto: 'boutike lucero', correctos: ['21', '22', '27', '35', '38'] },
  { grupo: 'error', texto: 'fatura Tienda Demostracion', correctos: ['01', '33'] },

  { grupo: 'sinRespuesta', texto: 'recibo de agua', correctos: [] },
  { grupo: 'sinRespuesta', texto: 'préstamo bancario', correctos: [] },
  { grupo: 'sinRespuesta', texto: 'vacaciones del personal', correctos: [] },
  { grupo: 'sinRespuesta', texto: 'exportación a Chile', correctos: [] },
  { grupo: 'sinRespuesta', texto: 'multa de tránsito', correctos: [] },
  { grupo: 'sinRespuesta', texto: 'auditoría externa', correctos: [] },

  { grupo: 'foto', texto: 'boleta del flete', correctos: ['51'] },
  { grupo: 'foto', texto: 'carta de reclamo de un cliente', correctos: ['52'] },
];
