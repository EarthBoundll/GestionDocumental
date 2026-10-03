import { clausulaSet } from '../../db/actualizacion.js';
import { primeraFila } from '../../db/filas.js';
import type { Consultor } from '../../db/pool.js';

/*
 * Lo que el Master ve, siempre con el acceso de plataforma (D17): empresas, sus administradores y
 * cifras. La base no le deja leer documentos, solicitudes ni a los usuarios que no son administradores.
 */

export interface Empresa {
  id: string;
  nombre: string;
  ruc: string | null;
  activa: boolean;
  creadoEn: Date;
}

export interface Metricas {
  usuarios: number;
  usuariosActivos: number;
  documentos: number;
  almacenamientoBytes: number;
  ultimoAcceso: Date | null;
}

export interface EmpresaConMetricas extends Empresa {
  metricas: Metricas;
}

export interface Administrador {
  id: string;
  empresaId: string;
  nombre: string;
  email: string;
  dni: string | null;
  activo: boolean;
  creadoEn: Date;
}

const COLUMNAS_EMPRESA = 'e.id, e.nombre, e.ruc, e.activa, e.creado_en AS "creadoEn"';
// Las cifras vienen de metricas_de_empresas(): conteos, nunca contenido (decisión E).
const METRICAS = `json_build_object(
    'usuarios', coalesce(m.usuarios, 0), 'usuariosActivos', coalesce(m.usuarios_activos, 0),
    'documentos', coalesce(m.documentos, 0), 'almacenamientoBytes', coalesce(m.almacenamiento_bytes, 0),
    'ultimoAcceso', m.ultimo_acceso) AS metricas`;
const DESDE_EMPRESAS = 'FROM empresas e LEFT JOIN metricas_de_empresas() m ON m.empresa_id = e.id';
const COLUMNAS_ADMINISTRADOR = 'id, empresa_id AS "empresaId", nombre, email, dni, activo, creado_en AS "creadoEn"';

type FilaEmpresa = Omit<EmpresaConMetricas, 'metricas'> & { metricas: Omit<Metricas, 'ultimoAcceso'> & { ultimoAcceso: string | null } };

function aEmpresa({ metricas, ...empresa }: FilaEmpresa): EmpresaConMetricas {
  return { ...empresa, metricas: { ...metricas, ultimoAcceso: metricas.ultimoAcceso ? new Date(metricas.ultimoAcceso) : null } };
}

export async function listarEmpresas(db: Consultor): Promise<EmpresaConMetricas[]> {
  const { rows } = await db.query<FilaEmpresa>(
    `SELECT ${COLUMNAS_EMPRESA}, ${METRICAS} ${DESDE_EMPRESAS} ORDER BY e.activa DESC, normalizar(e.nombre), e.id`,
  );
  return rows.map(aEmpresa);
}

export async function buscarEmpresa(db: Consultor, id: string): Promise<EmpresaConMetricas | null> {
  const { rows } = await db.query<FilaEmpresa>(`SELECT ${COLUMNAS_EMPRESA}, ${METRICAS} ${DESDE_EMPRESAS} WHERE e.id = $1`, [id]);
  return rows[0] ? aEmpresa(rows[0]) : null;
}

export async function insertarEmpresa(db: Consultor, datos: { nombre: string; ruc: string | null }): Promise<Empresa> {
  const { rows } = await db.query<Empresa>(
    `INSERT INTO empresas AS e (nombre, ruc) VALUES ($1, $2) RETURNING ${COLUMNAS_EMPRESA}`,
    [datos.nombre, datos.ruc],
  );
  return primeraFila(rows);
}

export async function actualizarEmpresa(db: Consultor, id: string, valores: Record<string, unknown>): Promise<void> {
  const { sql, parametros } = clausulaSet(valores, { nombre: 'nombre', ruc: 'ruc', activa: 'activa' }, 2);
  await db.query(`UPDATE empresas SET ${sql} WHERE id = $1`, [id, ...parametros]);
}

export async function insertarCategoriasIniciales(db: Consultor, empresaId: string, nombres: readonly string[]): Promise<void> {
  await db.query('INSERT INTO categorias (empresa_id, nombre) SELECT $1, unnest($2::text[])', [empresaId, nombres]);
}

/** Cierra las sesiones de todos los usuarios de la empresa, también los que el Master no ve. */
export async function revocarSesionesDeEmpresa(db: Consultor, empresaId: string): Promise<number> {
  const { rows } = await db.query<{ cerradas: number }>('SELECT revocar_sesiones_de_empresa($1) AS cerradas', [empresaId]);
  return rows[0]?.cerradas ?? 0;
}

export async function listarAdministradores(db: Consultor, empresaId: string): Promise<Administrador[]> {
  const { rows } = await db.query<Administrador>(
    `SELECT ${COLUMNAS_ADMINISTRADOR} FROM usuarios WHERE empresa_id = $1 AND rol = 'administrador'
     ORDER BY activo DESC, normalizar(nombre), id`,
    [empresaId],
  );
  return rows;
}

export async function buscarAdministrador(db: Consultor, id: string): Promise<Administrador | null> {
  const { rows } = await db.query<Administrador>(
    `SELECT ${COLUMNAS_ADMINISTRADOR} FROM usuarios WHERE id = $1 AND rol = 'administrador'`,
    [id],
  );
  return rows[0] ?? null;
}

export async function insertarAdministrador(
  db: Consultor,
  datos: { empresaId: string; nombre: string; email: string; dni: string | null; claveHash: string },
): Promise<Administrador> {
  const { rows } = await db.query<Administrador>(
    `INSERT INTO usuarios (empresa_id, nombre, email, dni, clave_hash, rol)
     VALUES ($1, $2, $3, $4, $5, 'administrador') RETURNING ${COLUMNAS_ADMINISTRADOR}`,
    [datos.empresaId, datos.nombre, datos.email, datos.dni, datos.claveHash],
  );
  return primeraFila(rows);
}

export async function actualizarAdministrador(db: Consultor, id: string, valores: Record<string, unknown>): Promise<void> {
  const { sql, parametros } = clausulaSet(
    valores,
    { nombre: 'nombre', email: 'email', dni: 'dni', claveHash: 'clave_hash', activo: 'activo' },
    2,
  );
  await db.query(`UPDATE usuarios SET ${sql} WHERE id = $1 AND rol = 'administrador'`, [id, ...parametros]);
}

/** Las cifras de toda la plataforma, para el panel del Master. */
export async function metricasGlobales(db: Consultor): Promise<Metricas & { empresas: number; empresasActivas: number }> {
  const { rows } = await db.query<Metricas & { empresas: number; empresasActivas: number }>(
    `SELECT count(*)::int AS empresas,
            count(*) FILTER (WHERE e.activa)::int AS "empresasActivas",
            coalesce(sum(m.usuarios), 0)::int AS usuarios,
            coalesce(sum(m.usuarios_activos), 0)::int AS "usuariosActivos",
            coalesce(sum(m.documentos), 0)::int AS documentos,
            coalesce(sum(m.almacenamiento_bytes), 0)::bigint::float8 AS "almacenamientoBytes",
            max(m.ultimo_acceso) AS "ultimoAcceso"
     ${DESDE_EMPRESAS}`,
  );
  return primeraFila(rows);
}
