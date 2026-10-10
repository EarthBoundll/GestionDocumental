import type { Coincidencia, EstadoDeAprobacion, TipoDeArchivo } from '../api/tipos';
import { hoyEnLima } from './formato';

/** Dónde coincidió un resultado (D42), como se lo dice la lista a quien buscó. */
export const TEXTO_DE_COINCIDENCIA: Record<Coincidencia, string> = {
  nombre_exacto: 'Nombre exacto',
  nombre_inicio: 'Empieza así',
  nombre: 'En el nombre',
  nombre_o_archivo: 'En el nombre o el archivo',
  descripcion: 'En la descripción o el archivo',
  categoria: 'Por su categoría',
  parecido: 'Se parece',
};

export const TIPOS_DE_ARCHIVO: { valor: TipoDeArchivo; texto: string }[] = [
  { valor: 'pdf', texto: 'PDF' },
  { valor: 'imagen', texto: 'Imagen (foto o escaneo)' },
  { valor: 'word', texto: 'Word' },
  { valor: 'excel', texto: 'Excel' },
];

export const ESTADOS_DE_APROBACION: { valor: EstadoDeAprobacion; texto: string }[] = [
  { valor: 'sin_solicitud', texto: 'Sin solicitud' },
  { valor: 'pendiente', texto: 'Pendiente de aprobación' },
  { valor: 'aprobada', texto: 'Aprobado' },
  { valor: 'rechazada', texto: 'Rechazado' },
];

export type AtajoDeFecha = 'semana' | 'mes' | 'trimestre' | 'anio';

export const ATAJOS_DE_FECHA: { valor: AtajoDeFecha; texto: string }[] = [
  { valor: 'semana', texto: 'Últimos 7 días' },
  { valor: 'mes', texto: 'Últimos 30 días' },
  { valor: 'trimestre', texto: 'Este trimestre' },
  { valor: 'anio', texto: 'Este año' },
];

/** AAAA-MM-DD menos tantos días. Se cuenta en UTC: el texto ya es un día de Lima. */
function restarDias(dia: string, dias: number): string {
  const fecha = new Date(`${dia}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() - dias);
  return fecha.toISOString().slice(0, 10);
}

/** El rango de un atajo, hasta hoy incluido. «Este trimestre» empieza el 1 de enero, abril, julio u octubre. */
export function rangoDeAtajo(atajo: AtajoDeFecha, hoy = hoyEnLima()): { desde: string; hasta: string } {
  const [anio = '', mes = ''] = hoy.split('-');
  const inicioDeTrimestre = String(Math.floor((Number(mes) - 1) / 3) * 3 + 1).padStart(2, '0');
  const desde = {
    semana: restarDias(hoy, 6),
    mes: restarDias(hoy, 29),
    trimestre: `${anio}-${inicioDeTrimestre}-01`,
    anio: `${anio}-01-01`,
  }[atajo];
  return { desde, hasta: hoy };
}

/** Qué atajo corresponde a un rango, si alguno: así se ve marcado el que se eligió. */
export function atajoDelRango(desde: string | undefined, hasta: string | undefined, hoy = hoyEnLima()): AtajoDeFecha | null {
  if (!desde || !hasta) return null;
  return ATAJOS_DE_FECHA.find(({ valor }) => {
    const rango = rangoDeAtajo(valor, hoy);
    return rango.desde === desde && rango.hasta === hasta;
  })?.valor ?? null;
}
