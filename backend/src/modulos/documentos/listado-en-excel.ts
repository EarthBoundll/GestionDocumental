import { contar, delTotal, informeEnExcel } from '../../compartido/excel/informe.js';
import { nombreDeTipo } from '../../compartido/tipos-de-archivo.js';
import type { FilaDelListado } from './documentos.repositorio.js';

const ESTADOS = { aprobada: 'Aprobada', pendiente: 'Pendiente', rechazada: 'Rechazada' } as const;
const estadoDe = (fila: FilaDelListado) => (fila.estado_aprobacion ? ESTADOS[fila.estado_aprobacion] : 'Sin solicitud');

/** RF35 en Excel (D44): el resumen del inventario y la tabla «Documentos», la que abre Power BI. */
export function listadoEnExcel(filas: FilaDelListado[], encabezado: { empresa: string; exportadoPor: string; filtros: string }): Buffer {
  const total = filas.length;
  const estados = filas.map(estadoDe);
  const cuantos = (estado: string) => estados.filter((valor) => valor === estado).length;
  return informeEnExcel({
    titulo: 'Listado documental',
    ...encabezado,
    tarjetas: [
      { titulo: 'Documentos', valor: total, nota: 'en este listado', color: '0F766E' },
      { titulo: 'Aprobados', valor: cuantos('Aprobada'), nota: delTotal(cuantos('Aprobada'), total), color: '16A34A' },
      { titulo: 'Pendientes', valor: cuantos('Pendiente'), nota: delTotal(cuantos('Pendiente'), total), color: 'D97706' },
      { titulo: 'Rechazados', valor: cuantos('Rechazada'), nota: delTotal(cuantos('Rechazada'), total), color: 'E11D48' },
    ],
    secciones: [
      { titulo: 'Por categoría', columna: 'Categoría', filas: contar(filas.map((fila) => fila.categoria)) },
      { titulo: 'Por estado de aprobación', columna: 'Estado', filas: contar(estados) },
      { titulo: 'Quién los subió', columna: 'Persona', filas: contar(filas.map((fila) => fila.subido_por)) },
      { titulo: 'Por tipo de archivo', columna: 'Tipo', filas: contar(filas.map((fila) => nombreDeTipo(fila.archivo_tipo_mime))) },
    ],
    nota: 'Los datos completos están en la hoja «Documentos», una tabla con filtros. Para analizarlos en Power BI: '
      + 'Obtener datos → Libro de Excel → tabla «Documentos».',
    datos: {
      nombre: 'Documentos',
      columnas: [
        { titulo: 'Nombre', ancho: 46 }, { titulo: 'Categoría', ancho: 22 }, { titulo: 'Fecha del documento', ancho: 14, tipo: 'fecha' },
        { titulo: 'Descripción', ancho: 36 }, { titulo: 'Subido por', ancho: 24 }, { titulo: 'Subido el', ancho: 17, tipo: 'fechaHora' },
        { titulo: 'Tipo', ancho: 9 }, { titulo: 'Peso (KB)', ancho: 11, tipo: 'decimal' }, { titulo: 'Versión', ancho: 10, tipo: 'entero' },
        { titulo: 'Estado', ancho: 15, tipo: 'etiqueta' }, { titulo: 'Versión revisada', ancho: 11, tipo: 'entero' }, { titulo: 'ID', ancho: 38 },
      ],
      filas: filas.map((fila, i) => [
        fila.nombre, fila.categoria, fila.fecha_documento, fila.descripcion, fila.subido_por, fila.subido_en_lima,
        nombreDeTipo(fila.archivo_tipo_mime), Math.round((fila.archivo_peso_bytes / 1024) * 10) / 10, fila.version,
        estados[i], fila.version_revisada, fila.id,
      ]),
    },
  });
}
