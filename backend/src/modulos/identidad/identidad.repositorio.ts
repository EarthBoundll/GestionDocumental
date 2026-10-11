import { clausulaSet } from '../../db/actualizacion.js';
import type { Consultor } from '../../db/pool.js';
import type { Esquinas, EstiloDeZona } from './identidad.esquemas.js';

export interface FilaIdentidad {
  nombreComercial: string | null;
  colorPrimario: string | null;
  colorFondo: string | null;
  logoRuta: string | null;
  fondoRuta: string | null;
  estiloMenu: EstiloDeZona;
  estiloBarra: EstiloDeZona;
  esquinas: Esquinas;
}

const COLUMNAS = {
  nombreComercial: 'nombre_comercial', colorPrimario: 'color_primario', colorFondo: 'color_fondo', logoRuta: 'logo_ruta', fondoRuta: 'fondo_ruta',
  estiloMenu: 'estilo_menu', estiloBarra: 'estilo_barra', esquinas: 'esquinas',
};

/** Las columnas de la identidad con el nombre que usa el código; también las lee el perfil al iniciar sesión. */
export const SELECT_IDENTIDAD = `e.nombre_comercial AS "nombreComercial", e.color_primario AS "colorPrimario",
  e.color_fondo AS "colorFondo", e.logo_ruta AS "logoRuta", e.fondo_ruta AS "fondoRuta",
  e.estilo_menu AS "estiloMenu", e.estilo_barra AS "estiloBarra", e.esquinas`;

/** Con el acceso de quien pregunta: una empresa solo ve su fila; el Master, cualquiera (D17). */
export async function leerIdentidad(db: Consultor, empresaId: string): Promise<FilaIdentidad | null> {
  const { rows } = await db.query<FilaIdentidad>(
    `SELECT ${SELECT_IDENTIDAD} FROM empresas e WHERE e.id = $1`,
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
