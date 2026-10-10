import { desplazamiento } from '../../compartido/paginacion.js';
import type { Rol } from '../../compartido/permisos.js';
import { clausulaSet } from '../../db/actualizacion.js';
import { primeraFila } from '../../db/filas.js';
import type { Consultor } from '../../db/pool.js';
import type { FiltroUsuarios } from './usuarios.esquemas.js';

/**
 * Lo que se ve del correo de una cuenta (D41). «pendiente»: invitada, aún sin contraseña; «sin_verificar»:
 * tiene contraseña pero no confirmó su correo (una cuenta anterior a la verificación o con un correo nuevo).
 */
export type EstadoDeCorreo = 'pendiente' | 'sin_verificar' | 'verificado';

/** El estado se deduce de la base, nunca se guarda: no hay forma de escribirlo a mano. */
export const COLUMNA_ESTADO = `CASE WHEN email_verificado_en IS NOT NULL THEN 'verificado'
  WHEN clave_hash IS NULL THEN 'pendiente' ELSE 'sin_verificar' END AS estado`;

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  dni: string | null;
  activo: boolean;
  estado: EstadoDeCorreo;
  creadoEn: Date;
}

const COLUMNAS = { nombre: 'nombre', email: 'email', dni: 'dni', rol: 'rol', claveHash: 'clave_hash', activo: 'activo' };
const DEVUELTAS = `id, nombre, email, rol, dni, activo, ${COLUMNA_ESTADO}, creado_en AS "creadoEn"`;
const SELECCION = `SELECT ${DEVUELTAS} FROM usuarios`;

export async function listarUsuarios(db: Consultor, empresaId: string, filtro: FiltroUsuarios): Promise<{ filas: Usuario[]; total: number }> {
  const condiciones = ['empresa_id = $1'];
  const parametros: unknown[] = [empresaId];
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

export async function buscarUsuario(db: Consultor, empresaId: string, id: string): Promise<Usuario | null> {
  const { rows } = await db.query<Usuario>(`${SELECCION} WHERE empresa_id = $1 AND id = $2`, [empresaId, id]);
  return rows[0] ?? null;
}

/** Una cuenta nueva nace sin contraseña y sin verificar: la activa su dueño con la invitación (D41). */
export async function insertarUsuario(
  db: Consultor,
  datos: { empresaId: string; nombre: string; email: string; dni?: string | null | undefined; rol: Rol },
): Promise<Usuario> {
  const { rows } = await db.query<Usuario>(
    `INSERT INTO usuarios (empresa_id, nombre, email, dni, rol) VALUES ($1, $2, $3, $4, $5)
     RETURNING ${DEVUELTAS}`,
    [datos.empresaId, datos.nombre, datos.email, datos.dni ?? null, datos.rol],
  );
  return primeraFila(rows);
}

/** Si el correo ya es de alguien de la empresa: con el acceso de la empresa, la RLS no deja ver las demás. */
export async function correoEnLaEmpresa(db: Consultor, email: string): Promise<boolean> {
  const { rowCount } = await db.query('SELECT 1 FROM usuarios WHERE email = $1', [email]);
  return (rowCount ?? 0) > 0;
}

export async function actualizarUsuario(db: Consultor, empresaId: string, id: string, valores: Record<string, unknown>): Promise<void> {
  const { sql, parametros } = clausulaSet(valores, COLUMNAS, 3);
  await db.query(`UPDATE usuarios SET ${sql} WHERE empresa_id = $1 AND id = $2`, [empresaId, id, ...parametros]);
}
