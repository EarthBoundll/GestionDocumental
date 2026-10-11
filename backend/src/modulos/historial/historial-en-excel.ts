import { contar, delTotal, informeEnExcel } from '../../compartido/excel/informe.js';
import type { AccionAuditable } from './historial.registro.js';
import { NOMBRES_DE_ACCIONES } from './nombres-de-acciones.js';

export interface AsientoParaExcel {
  id: string;
  /** «2026-11-10 09:21:31», hora de Lima. */
  fechaLima: string;
  accion: string;
  usuario: string | null;
  email: string | null;
  rol: string | null;
  entidadTipo: string | null;
  entidadId: string | null;
  esMovil: boolean | null;
  userAgent: string | null;
  detalle: Record<string, unknown>;
}

const ROLES: Record<string, string> = { master: 'Master', administrador: 'Administrador', usuario: 'Usuario' };
const nombreDeAccion = (accion: string) => NOMBRES_DE_ACCIONES[accion as AccionAuditable] ?? accion;
const dispositivo = (esMovil: boolean | null) => (esMovil === null ? 'Sin dato' : esMovil ? 'Celular' : 'Computadora');

/** RF20 en Excel (D44): el resumen de la actividad y la tabla «Historial», la que abre Power BI. */
export function historialEnExcel(asientos: AsientoParaExcel[], encabezado: { empresa: string; exportadoPor: string; filtros: string }): Buffer {
  const total = asientos.length;
  const personas = new Set(asientos.map((asiento) => asiento.usuario).filter(Boolean)).size;
  const moviles = asientos.filter((asiento) => asiento.esMovil).length;
  const busquedas = asientos.filter((asiento) => asiento.accion === 'BUSQUEDA_REALIZADA').length;
  return informeEnExcel({
    titulo: 'Historial de actividad',
    ...encabezado,
    tarjetas: [
      { titulo: 'Acciones', valor: total, nota: 'registradas', color: '0F766E' },
      { titulo: 'Personas', valor: personas, nota: 'con alguna acción', color: '0369A1' },
      { titulo: 'Desde el celular', valor: moviles, nota: delTotal(moviles, total), color: '7C3AED' },
      { titulo: 'Búsquedas', valor: busquedas, nota: delTotal(busquedas, total), color: 'D97706' },
    ],
    secciones: [
      { titulo: 'Por acción', columna: 'Acción', filas: contar(asientos.map((asiento) => nombreDeAccion(asiento.accion))) },
      { titulo: 'Por persona', columna: 'Persona', filas: contar(asientos.map((asiento) => asiento.usuario ?? 'Sin usuario')) },
      { titulo: 'Por día', columna: 'Día', filas: contar(asientos.map((asiento) => asiento.fechaLima.slice(0, 10).split('-').reverse().join('/'))) },
      { titulo: 'Por dispositivo', columna: 'Dispositivo', filas: contar(asientos.map((asiento) => dispositivo(asiento.esMovil))) },
    ],
    nota: 'Cada acción está en la hoja «Historial», una tabla con filtros. Para analizarla en Power BI: '
      + 'Obtener datos → Libro de Excel → tabla «Historial».',
    datos: {
      nombre: 'Historial',
      columnas: [
        { titulo: 'Fecha y hora', ancho: 17, tipo: 'fechaHora' }, { titulo: 'Acción', ancho: 30 }, { titulo: 'Usuario', ancho: 26 },
        { titulo: 'Correo', ancho: 28 }, { titulo: 'Rol', ancho: 14 }, { titulo: 'Entidad', ancho: 12 }, { titulo: 'ID de la entidad', ancho: 38 },
        { titulo: 'Desde el celular', ancho: 12, tipo: 'etiqueta' }, { titulo: 'Navegador', ancho: 40 }, { titulo: 'Detalle', ancho: 60 },
        { titulo: 'Código de la acción', ancho: 24 }, { titulo: 'ID', ancho: 10, tipo: 'entero' },
      ],
      filas: asientos.map((asiento) => [
        asiento.fechaLima, nombreDeAccion(asiento.accion), asiento.usuario, asiento.email, asiento.rol ? ROLES[asiento.rol] ?? asiento.rol : null,
        asiento.entidadTipo, asiento.entidadId, asiento.esMovil === null ? null : asiento.esMovil ? 'Sí' : 'No', asiento.userAgent,
        JSON.stringify(asiento.detalle), asiento.accion, Number(asiento.id),
      ]),
    },
  });
}
