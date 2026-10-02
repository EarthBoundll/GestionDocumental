import type { UsuarioAutenticado } from '../../compartido/peticion.js';
import type { Rol } from '../../compartido/permisos.js';
import type { Credencial } from '../../compartido/tokens.js';
import { primeraFila } from '../../db/filas.js';
import type { Consultor } from '../../db/pool.js';

export interface Organizacion {
  id: string;
  nombre: string;
}

export interface CuentaParaIniciarSesion extends UsuarioAutenticado {
  activo: boolean;
  claveHash: string;
  organizacion: Organizacion;
}

interface FilaUsuario {
  id: string;
  organizacion_id: string;
  nombre: string;
  email: string;
  rol: Rol;
}

const COLUMNAS_USUARIO = 'u.id, u.organizacion_id, u.nombre, u.email, u.rol';

function aUsuario(fila: FilaUsuario): UsuarioAutenticado {
  return { id: fila.id, organizacionId: fila.organizacion_id, nombre: fila.nombre, email: fila.email, rol: fila.rol };
}

/** Una sola consulta por petición: sesión abierta, sin caducar, de un usuario activo, con su rol vigente. */
export async function buscarSesionVigente(db: Consultor, { usuarioId, sesionId }: Credencial): Promise<UsuarioAutenticado | null> {
  const { rows } = await db.query<FilaUsuario>(
    `SELECT ${COLUMNAS_USUARIO}
     FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.id = $1 AND s.usuario_id = $2 AND s.revocada_en IS NULL AND s.expira_en > now() AND u.activo`,
    [sesionId, usuarioId],
  );
  return rows[0] ? aUsuario(rows[0]) : null;
}

export async function buscarCuentaPorEmail(db: Consultor, email: string): Promise<CuentaParaIniciarSesion | null> {
  const { rows } = await db.query<FilaUsuario & { activo: boolean; clave_hash: string; organizacion_nombre: string }>(
    `SELECT ${COLUMNAS_USUARIO}, u.activo, u.clave_hash, o.nombre AS organizacion_nombre
     FROM usuarios u JOIN organizaciones o ON o.id = u.organizacion_id
     WHERE u.email = $1`,
    [email],
  );
  const fila = rows[0];
  if (!fila) return null;
  return {
    ...aUsuario(fila),
    activo: fila.activo,
    claveHash: fila.clave_hash,
    organizacion: { id: fila.organizacion_id, nombre: fila.organizacion_nombre },
  };
}

export async function buscarOrganizacion(db: Consultor, id: string): Promise<Organizacion | null> {
  const { rows } = await db.query<Organizacion>('SELECT id, nombre FROM organizaciones WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function buscarClaveHash(db: Consultor, usuarioId: string): Promise<string | null> {
  const { rows } = await db.query<{ clave_hash: string }>('SELECT clave_hash FROM usuarios WHERE id = $1', [usuarioId]);
  return rows[0]?.clave_hash ?? null;
}

export async function insertarOrganizacion(db: Consultor, datos: { nombre: string; ruc?: string | undefined }): Promise<Organizacion> {
  const { rows } = await db.query<Organizacion>(
    'INSERT INTO organizaciones (nombre, ruc) VALUES ($1, $2) RETURNING id, nombre',
    [datos.nombre, datos.ruc ?? null],
  );
  return primeraFila(rows);
}

export async function insertarUsuario(
  db: Consultor,
  datos: { organizacionId: string; nombre: string; email: string; claveHash: string; rol: Rol },
): Promise<UsuarioAutenticado> {
  const { rows } = await db.query<FilaUsuario>(
    `INSERT INTO usuarios AS u (organizacion_id, nombre, email, clave_hash, rol)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNAS_USUARIO}`,
    [datos.organizacionId, datos.nombre, datos.email, datos.claveHash, datos.rol],
  );
  return aUsuario(primeraFila(rows));
}

export async function insertarCategorias(db: Consultor, organizacionId: string, nombres: readonly string[]): Promise<void> {
  await db.query(
    'INSERT INTO categorias (organizacion_id, nombre) SELECT $1, unnest($2::text[])',
    [organizacionId, nombres],
  );
}

export async function insertarSesion(db: Consultor, usuarioId: string, expiraEn: Date): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO sesiones (usuario_id, expira_en) VALUES ($1, $2) RETURNING id',
    [usuarioId, expiraEn],
  );
  return primeraFila(rows).id;
}

export async function revocarSesion(db: Consultor, sesionId: string): Promise<void> {
  await db.query('UPDATE sesiones SET revocada_en = now() WHERE id = $1 AND revocada_en IS NULL', [sesionId]);
}

/** Cierra todas las sesiones abiertas del usuario salvo una, y devuelve cuántas cerró. */
export async function revocarOtrasSesiones(db: Consultor, usuarioId: string, sesionQueSeConserva: string): Promise<number> {
  const { rowCount } = await db.query(
    'UPDATE sesiones SET revocada_en = now() WHERE usuario_id = $1 AND id <> $2 AND revocada_en IS NULL',
    [usuarioId, sesionQueSeConserva],
  );
  return rowCount ?? 0;
}

/** Cierra todas las sesiones abiertas del usuario y devuelve cuántas cerró. */
export async function revocarSesionesDe(db: Consultor, usuarioId: string): Promise<number> {
  const { rowCount } = await db.query(
    'UPDATE sesiones SET revocada_en = now() WHERE usuario_id = $1 AND revocada_en IS NULL',
    [usuarioId],
  );
  return rowCount ?? 0;
}

export async function actualizarClaveHash(db: Consultor, usuarioId: string, claveHash: string): Promise<void> {
  await db.query('UPDATE usuarios SET clave_hash = $2 WHERE id = $1', [usuarioId, claveHash]);
}
