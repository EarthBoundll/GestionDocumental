import { clausulaSet } from '../../db/actualizacion.js';
import { primeraFila } from '../../db/filas.js';
import type { Consultor } from '../../db/pool.js';

export interface Categoria {
  id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  /** Si solo la ven los administradores y las personas autorizadas (RF25). */
  restringida: boolean;
  /** Las personas autorizadas. Solo los administradores las ven: para los demás la lista llega vacía (RLS). */
  usuariosAutorizados: string[];
  /** Documentos vigentes que la usan y que quien pregunta puede ver. */
  documentos: number;
}

const COLUMNAS = { nombre: 'nombre', descripcion: 'descripcion', activa: 'activa', restringida: 'restringida' };

const SELECCION = `
  SELECT c.id, c.nombre, c.descripcion, c.activa, c.restringida,
         coalesce((SELECT array_agg(a.usuario_id ORDER BY a.creado_en) FROM categoria_accesos a WHERE a.categoria_id = c.id), '{}')
           AS "usuariosAutorizados",
         count(d.id)::int AS documentos
  FROM categorias c LEFT JOIN documentos d ON d.categoria_id = c.id AND d.eliminado_en IS NULL`;

export async function listarCategorias(db: Consultor, empresaId: string, incluirInactivas: boolean): Promise<Categoria[]> {
  const { rows } = await db.query<Categoria>(
    `${SELECCION}
     WHERE c.empresa_id = $1 AND ($2 OR c.activa)
     GROUP BY c.id ORDER BY normalizar(c.nombre)`,
    [empresaId, incluirInactivas],
  );
  return rows;
}

export async function buscarCategoria(db: Consultor, empresaId: string, id: string): Promise<Categoria | null> {
  const { rows } = await db.query<Categoria>(
    `${SELECCION} WHERE c.empresa_id = $1 AND c.id = $2 GROUP BY c.id`,
    [empresaId, id],
  );
  return rows[0] ?? null;
}

export async function insertarCategoria(
  db: Consultor,
  empresaId: string,
  datos: { nombre: string; descripcion?: string | null | undefined; restringida?: boolean | undefined },
): Promise<Omit<Categoria, 'usuariosAutorizados'>> {
  const { rows } = await db.query<Omit<Categoria, 'usuariosAutorizados'>>(
    `INSERT INTO categorias (empresa_id, nombre, descripcion, restringida) VALUES ($1, $2, $3, $4)
     RETURNING id, nombre, descripcion, activa, restringida, 0 AS documentos`,
    [empresaId, datos.nombre, datos.descripcion ?? null, datos.restringida ?? false],
  );
  return primeraFila(rows);
}

export async function actualizarCategoria(db: Consultor, empresaId: string, id: string, valores: Record<string, unknown>): Promise<void> {
  const { sql, parametros } = clausulaSet(valores, COLUMNAS, 3);
  await db.query(`UPDATE categorias SET ${sql} WHERE empresa_id = $1 AND id = $2`, [empresaId, id, ...parametros]);
}

export async function agregarAccesos(db: Consultor, empresaId: string, categoriaId: string, usuarios: string[]): Promise<void> {
  if (usuarios.length === 0) return;
  await db.query(
    `INSERT INTO categoria_accesos (empresa_id, categoria_id, usuario_id)
     SELECT $1, $2, unnest($3::uuid[]) ON CONFLICT DO NOTHING`,
    [empresaId, categoriaId, usuarios],
  );
}

export async function quitarAccesos(db: Consultor, empresaId: string, categoriaId: string, usuarios: string[]): Promise<void> {
  if (usuarios.length === 0) return;
  await db.query(
    'DELETE FROM categoria_accesos WHERE empresa_id = $1 AND categoria_id = $2 AND usuario_id = ANY($3::uuid[])',
    [empresaId, categoriaId, usuarios],
  );
}
