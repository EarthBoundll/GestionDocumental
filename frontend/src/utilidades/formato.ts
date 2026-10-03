// Todo se muestra en hora de Lima, esté donde esté el navegador (M10).
const ZONA = 'America/Lima';

const fechaHora = new Intl.DateTimeFormat('es-PE', {
  timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});

/** «2026-10-02T15:04:00Z» → «02/10/2026 10:04» */
export function formatearFechaHora(iso: string): string {
  return fechaHora.format(new Date(iso)).replace(',', '');
}

/** La fecha de un documento no tiene hora ni zona: «2026-09-15» → «15/09/2026», sin conversiones. */
export function formatearFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

/** Hoy en Lima, como AAAA-MM-DD: el valor por defecto de la fecha de un documento. */
export function hoyEnLima(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());
}

export function formatearPeso(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

const TIPOS: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'application/msword': 'Word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.ms-excel': 'Excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
};

export function nombreDeTipo(mime: string): string {
  return TIPOS[mime] ?? 'Archivo';
}

/** «contrato_alquiler-2026.pdf» → «Contrato alquiler 2026»: el nombre que se propone al subir. */
export function nombreSugerido(nombreArchivo: string): string {
  const nombre = nombreArchivo.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return nombre.charAt(0).toLocaleUpperCase('es') + nombre.slice(1);
}
