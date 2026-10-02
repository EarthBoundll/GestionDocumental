import { clausulaSet } from '../../db/actualizacion.js';
import { primeraFila } from '../../db/filas.js';
import type { Consultor } from '../../db/pool.js';

export interface Categoria {
  id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  /** Documentos vigentes que la usan. */
  documentos: number;
}

const COLUMNAS = { nombre: 'nombre', descripcion: 'descripcion', activa: 'activa' };

const SELECCION = `
  SELECT c.id, c.nombre, c.descripcion, c.activa, count(d.id)::int AS documentos
  FROM categorias c LEFT JOIN documentos d ON d.categoria_id = c.id AND d.eliminado_en IS NULL`;

export async function listarCategorias(db: Consultor, organizacionId: string, incluirInactivas: boolean): Promise<Categoria[]> {
  const { rows } = await db.query<Categoria>(
    `${SELECCION}
     WHERE c.organizacion_id = $1 AND ($2 OR c.activa)
     GROUP BY c.id ORDER BY normalizar(c.nombre)`,
    [organizacionId, incluirInactivas],
  );
  return rows;
}

export async function buscarCategoria(db: Consultor, organizacionId: string, id: string): Promise<Categoria | null> {
  const { rows } = await db.query<Categoria>(
    `${SELECCION} WHERE c.organizacion_id = $1 AND c.id = $2 GROUP BY c.id`,
    [organizacionId, id],
  );
  return rows[0] ?? null;
}

export async function insertarCategoria(
  db: Consultor,
  organizacionId: string,
  datos: { nombre: string; descripcion?: string | null | undefined },
): Promise<Categoria> {
  const { rows } = await db.query<Categoria>(
    `INSERT INTO categorias (organizacion_id, nombre, descripcion) VALUES ($1, $2, $3)
     RETURNING id, nombre, descripcion, activa, 0 AS documentos`,
    [organizacionId, datos.nombre, datos.descripcion ?? null],
  );
  return primeraFila(rows);
}

export async function actualizarCategoria(db: Consultor, organizacionId: string, id: string, valores: Record<string, unknown>): Promise<void> {
  const { sql, parametros } = clausulaSet(valores, COLUMNAS, 3);
  await db.query(`UPDATE categorias SET ${sql} WHERE organizacion_id = $1 AND id = $2`, [organizacionId, id, ...parametros]);
}
