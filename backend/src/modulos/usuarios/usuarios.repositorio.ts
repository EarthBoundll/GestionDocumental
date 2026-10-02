import { desplazamiento } from '../../compartido/paginacion.js';
import type { Rol } from '../../compartido/permisos.js';
import { clausulaSet } from '../../db/actualizacion.js';
import { primeraFila } from '../../db/filas.js';
import type { Consultor } from '../../db/pool.js';
import type { FiltroUsuarios } from './usuarios.esquemas.js';

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  creadoEn: Date;
}

const COLUMNAS = { nombre: 'nombre', rol: 'rol', claveHash: 'clave_hash', activo: 'activo' };
const SELECCION = 'SELECT id, nombre, email, rol, activo, creado_en AS "creadoEn" FROM usuarios';

export async function listarUsuarios(db: Consultor, organizacionId: string, filtro: FiltroUsuarios): Promise<{ filas: Usuario[]; total: number }> {
  const condiciones = ['organizacion_id = $1'];
  const parametros: unknown[] = [organizacionId];
  const agregar = (condicion: (parametro: string) => string, valor: unknown) => {
    parametros.push(valor);
    condiciones.push(condicion(`$${parametros.length}`));
  };
  if (filtro.q) agregar((p) => `(normalizar(nombre) LIKE '%' || normalizar(${p}) || '%' OR email LIKE '%' || lower(${p}) || '%')`, filtro.q.replace(/[\\%_]/g, '\\$&'));
  if (filtro.rol) agregar((p) => `rol = ${p}`, filtro.rol);
  if (filtro.activo !== undefined) agregar((p) => `activo = ${p}`, filtro.activo);
  const where = condiciones.join(' AND ');

  const { rows: [conteo] } = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM usuarios WHERE ${where}`, parametros);
  const { rows } = await db.query<Usuario>(
    `${SELECCION} WHERE ${where} ORDER BY activo DESC, normalizar(nombre), id
     LIMIT $${parametros.length + 1} OFFSET $${parametros.length + 2}`,
    [...parametros, filtro.porPagina, desplazamiento(filtro)],
  );
  return { filas: rows, total: conteo?.total ?? 0 };
}

export async function buscarUsuario(db: Consultor, organizacionId: string, id: string): Promise<Usuario | null> {
  const { rows } = await db.query<Usuario>(`${SELECCION} WHERE organizacion_id = $1 AND id = $2`, [organizacionId, id]);
  return rows[0] ?? null;
}

export async function insertarUsuario(
  db: Consultor,
  datos: { organizacionId: string; nombre: string; email: string; claveHash: string; rol: Rol },
): Promise<Usuario> {
  const { rows } = await db.query<Usuario>(
    `INSERT INTO usuarios (organizacion_id, nombre, email, clave_hash, rol) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, nombre, email, rol, activo, creado_en AS "creadoEn"`,
    [datos.organizacionId, datos.nombre, datos.email, datos.claveHash, datos.rol],
  );
  return primeraFila(rows);
}

export async function actualizarUsuario(db: Consultor, organizacionId: string, id: string, valores: Record<string, unknown>): Promise<void> {
  const { sql, parametros } = clausulaSet(valores, COLUMNAS, 3);
  await db.query(`UPDATE usuarios SET ${sql} WHERE organizacion_id = $1 AND id = $2`, [organizacionId, id, ...parametros]);
}
