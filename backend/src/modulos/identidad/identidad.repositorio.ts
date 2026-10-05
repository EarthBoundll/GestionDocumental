import { clausulaSet } from '../../db/actualizacion.js';
import type { Consultor } from '../../db/pool.js';

export interface FilaIdentidad {
  nombreComercial: string | null;
  colorPrimario: string | null;
  logoRuta: string | null;
}

const COLUMNAS = { nombreComercial: 'nombre_comercial', colorPrimario: 'color_primario', logoRuta: 'logo_ruta' };

/** Con el acceso de quien pregunta: una empresa solo ve su fila; el Master, cualquiera (D17). */
export async function leerIdentidad(db: Consultor, empresaId: string): Promise<FilaIdentidad | null> {
  const { rows } = await db.query<FilaIdentidad>(
    `SELECT nombre_comercial AS "nombreComercial", color_primario AS "colorPrimario", logo_ruta AS "logoRuta"
     FROM empresas WHERE id = $1`,
    [empresaId],
  );
  return rows[0] ?? null;
}

/**
 * Devuelve si la fila cambió. Para el rol de empresa, la política `identidad` (008) solo deja tocarla al
 * administrador de esa empresa: si no lo es, la base no actualiza nada, aunque el código lo pidiera.
 */
export async function actualizarIdentidad(db: Consultor, empresaId: string, valores: Partial<FilaIdentidad>): Promise<boolean> {
  const { sql, parametros } = clausulaSet(valores, COLUMNAS, 2);
  const { rowCount } = await db.query(`UPDATE empresas SET ${sql} WHERE id = $1`, [empresaId, ...parametros]);
  return rowCount === 1;
}
