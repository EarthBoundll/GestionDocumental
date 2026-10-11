import type { Response } from 'express';
import type { Consultor } from '../db/pool.js';
import { sinVacios, z } from './validacion.js';

/**
 * En qué formato sale una exportación (D44): Excel (.xlsx), con su resumen y su tabla para Power BI, o CSV,
 * para otras herramientas. Sin indicarlo, CSV: es lo que ya usan las pruebas, la batería de aislamiento y
 * quien la haya automatizado.
 */
export const esquemaFormato = z.object({
  formato: sinVacios(z.enum(['csv', 'xlsx'], 'Elige csv o xlsx').default('csv')),
});

export type Formato = z.infer<typeof esquemaFormato>['formato'];

export interface Exportacion {
  formato: Formato;
  contenido: string | Buffer;
}

const TIPOS: Record<Formato, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** El nombre con el que la empresa se presenta (su nombre comercial, si lo eligió), para el título del Excel. */
export async function nombreDeLaEmpresa(db: Consultor, empresaId: string): Promise<string> {
  const { rows: [empresa] } = await db.query<{ nombre: string }>(
    'SELECT coalesce(nombre_comercial, nombre) AS nombre FROM empresas WHERE id = $1', [empresaId]);
  return empresa?.nombre ?? '';
}

/** Lo entrega como descarga, con la fecha de Lima en el nombre: «listado-documental-2026-10-11.xlsx». */
export function enviarExportacion(res: Response, nombre: string, { formato, contenido }: Exportacion): void {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
  res.set({
    'Content-Type': TIPOS[formato],
    'Content-Disposition': `attachment; filename="${nombre}-${hoy}.${formato}"`,
  });
  res.send(contenido);
}
