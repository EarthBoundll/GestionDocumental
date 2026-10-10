import type { UsuarioAutenticado } from '../../compartido/peticion.js';
import type { Rol } from '../../compartido/permisos.js';
import type { Credencial } from '../../compartido/tokens.js';
import { primeraFila } from '../../db/filas.js';
import type { Consultor } from '../../db/pool.js';
import { SELECT_IDENTIDAD, type FilaIdentidad } from '../identidad/identidad.repositorio.js';

/*
 * La capa de identidad. Averigua quién es alguien antes de saber a qué empresa pertenece, así que no
 * puede pasar por el acceso de una empresa: usa la conexión dueña de las tablas. Es la otra excepción
 * explícita al aislamiento (D17) y se limita a cuentas, sesiones y recuperaciones de contraseña.
 */

export interface Empresa {
  id: string;
  nombre: string;
}

export interface CuentaParaIniciarSesion extends UsuarioAutenticado {
  activo: boolean;
  /** Nula mientras la invitación no se acepta (D41): sin contraseña no se puede entrar. */
  claveHash: string | null;
  /** Si su dueño ya demostró que el buzón es suyo (D41). */
  verificado: boolean;
  /** Null solo para el Master. */
  empresa: (Empresa & { activa: boolean }) | null;
}

export const TEMAS = ['sistema', 'claro', 'oscuro'] as const;
export type Tema = (typeof TEMAS)[number];

/** Lo que la base sabe de alguien al entrar: su cuenta, su tema y su empresa con su identidad (008). */
export interface FilaPerfil {
  usuario: { id: string; nombre: string; email: string; rol: Rol; dni: string | null; tema: Tema };
  empresa: (Empresa & { identidad: FilaIdentidad }) | null;
}

interface FilaUsuario {
  id: string;
  empresa_id: string | null;
  nombre: string;
  email: string;
  rol: Rol;
}

const COLUMNAS_USUARIO = 'u.id, u.empresa_id, u.nombre, u.email, u.rol';

function aUsuario(fila: FilaUsuario): UsuarioAutenticado {
  return { id: fila.id, empresaId: fila.empresa_id, nombre: fila.nombre, email: fila.email, rol: fila.rol };
}

/**
 * Una sola consulta por petición: sesión abierta, sin caducar, de un usuario activo, de una empresa
 * activa (o el Master, que no tiene), con el rol y la empresa vigentes.
 */
export async function buscarSesionVigente(db: Consultor, { usuarioId, sesionId }: Credencial): Promise<UsuarioAutenticado | null> {
  const { rows } = await db.query<FilaUsuario>(
    `SELECT ${COLUMNAS_USUARIO}
     FROM sesiones s
     JOIN usuarios u ON u.id = s.usuario_id
     LEFT JOIN empresas e ON e.id = u.empresa_id
     WHERE s.id = $1 AND s.usuario_id = $2 AND s.revocada_en IS NULL AND s.expira_en > now()
       AND u.activo AND (u.empresa_id IS NULL OR e.activa) AND u.email_verificado_en IS NOT NULL`,
    [sesionId, usuarioId],
  );
  return rows[0] ? aUsuario(rows[0]) : null;
}

export async function buscarCuentaPorEmail(db: Consultor, email: string): Promise<CuentaParaIniciarSesion | null> {
  const { rows } = await db.query<FilaUsuario & {
    activo: boolean; clave_hash: string | null; verificado: boolean; empresa_nombre: string | null; empresa_activa: boolean | null;
  }>(
    `SELECT ${COLUMNAS_USUARIO}, u.activo, u.clave_hash, u.email_verificado_en IS NOT NULL AS verificado,
            e.nombre AS empresa_nombre, e.activa AS empresa_activa
     FROM usuarios u LEFT JOIN empresas e ON e.id = u.empresa_id
     WHERE u.email = $1`,
    [email],
  );
  const fila = rows[0];
  if (!fila) return null;
  return {
    ...aUsuario(fila),
    activo: fila.activo,
    claveHash: fila.clave_hash,
    verificado: fila.verificado,
    empresa: fila.empresa_id === null
      ? null
      : { id: fila.empresa_id, nombre: fila.empresa_nombre ?? '', activa: fila.empresa_activa === true },
  };
}

export async function buscarPerfil(db: Consultor, usuarioId: string): Promise<FilaPerfil | null> {
  const { rows } = await db.query<FilaUsuario & FilaIdentidad & { dni: string | null; tema: Tema; empresa_nombre: string | null }>(
    `SELECT ${COLUMNAS_USUARIO}, u.dni, u.tema, e.nombre AS empresa_nombre, ${SELECT_IDENTIDAD}
     FROM usuarios u LEFT JOIN empresas e ON e.id = u.empresa_id
     WHERE u.id = $1`,
    [usuarioId],
  );
  const fila = rows[0];
  if (!fila) return null;
  return {
    usuario: { id: fila.id, nombre: fila.nombre, email: fila.email, rol: fila.rol, dni: fila.dni, tema: fila.tema },
    empresa: fila.empresa_id === null ? null : {
      id: fila.empresa_id,
      nombre: fila.empresa_nombre ?? '',
      identidad: {
        nombreComercial: fila.nombreComercial, colorPrimario: fila.colorPrimario, colorFondo: fila.colorFondo,
        logoRuta: fila.logoRuta, fondoRuta: fila.fondoRuta,
      },
    },
  };
}

/** El tema es de la persona: solo cambia el suyo, y no pasa por el historial (RF32). */
export async function actualizarTema(db: Consultor, usuarioId: string, tema: Tema): Promise<void> {
  await db.query('UPDATE usuarios SET tema = $2 WHERE id = $1', [usuarioId, tema]);
}

export async function buscarClaveHash(db: Consultor, usuarioId: string): Promise<string | null> {
  const { rows } = await db.query<{ clave_hash: string }>('SELECT clave_hash FROM usuarios WHERE id = $1', [usuarioId]);
  return rows[0]?.clave_hash ?? null;
}

export async function buscarDni(db: Consultor, usuarioId: string): Promise<string | null> {
  const { rows } = await db.query<{ dni: string | null }>('SELECT dni FROM usuarios WHERE id = $1', [usuarioId]);
  return rows[0]?.dni ?? null;
}

export async function buscarMaster(db: Consultor): Promise<UsuarioAutenticado | null> {
  const { rows } = await db.query<FilaUsuario>(`SELECT ${COLUMNAS_USUARIO} FROM usuarios u WHERE u.rol = 'master'`);
  return rows[0] ? aUsuario(rows[0]) : null;
}

/**
 * El Master, la única cuenta sin empresa. La base rechaza una segunda (usuarios_un_solo_master). Nace con el
 * correo verificado: lo crea el script de inicialización, que ejecuta quien ya controla la base y el entorno
 * (D41). No es una excepción del inicio de sesión, que exige la verificación a todos por igual.
 */
export async function insertarMaster(
  db: Consultor,
  datos: { nombre: string; email: string; dni: string | null; claveHash: string },
): Promise<UsuarioAutenticado> {
  const { rows } = await db.query<FilaUsuario>(
    `INSERT INTO usuarios AS u (empresa_id, nombre, email, dni, clave_hash, rol, email_verificado_en)
     VALUES (NULL, $1, $2, $3, $4, 'master', now()) RETURNING ${COLUMNAS_USUARIO}`,
    [datos.nombre, datos.email, datos.dni, datos.claveHash],
  );
  return aUsuario(primeraFila(rows));
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

/**
 * Para qué sirve un enlace que llega por correo (D41). Los tres comparten tabla, huella y forma de gastarse:
 * la recuperación define una contraseña nueva; la invitación, la primera, y verifica el correo; la
 * verificación solo confirma el correo de una cuenta que ya tiene contraseña.
 */
export type Proposito = 'recuperacion' | 'invitacion' | 'verificacion';

/** Anula los enlaces pendientes del usuario, sean para lo que sean: solo vale el último que se envió. */
export async function anularEnlacesDe(db: Consultor, usuarioId: string): Promise<void> {
  await db.query('UPDATE recuperaciones_clave SET usada_en = now() WHERE usuario_id = $1 AND usada_en IS NULL', [usuarioId]);
}

/** La vigencia se cuenta con el reloj de la base, el mismo que después comprueba si caducó. */
export async function insertarEnlace(
  db: Consultor,
  { usuarioId, tokenHash, minutos, proposito, enviadoA }: {
    usuarioId: string; tokenHash: string; minutos: number; proposito: Proposito; enviadoA: string;
  },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO recuperaciones_clave (usuario_id, token_hash, expira_en, proposito, enviado_a)
     VALUES ($1, $2, now() + make_interval(mins => $3), $4, $5) RETURNING id`,
    [usuarioId, tokenHash, minutos, proposito, enviadoA],
  );
  return primeraFila(rows).id;
}

/**
 * Gasta un enlace: lo marca como usado y devuelve su usuario, en una sola sentencia. Si dos peticiones llegan
 * a la vez con el mismo enlace, solo una lo consigue. Un enlace caducado, ya usado, de otro propósito, de
 * una cuenta desactivada o enviado a un correo que ya no es el de la cuenta no sirve: verificaría un buzón
 * que no lo recibió. El enlace solo actúa sobre su propia cuenta: no lleva ni rol ni empresa.
 */
export async function consumirEnlace(
  db: Consultor,
  tokenHash: string,
  propositos: readonly Proposito[],
): Promise<(UsuarioAutenticado & { tieneClave: boolean }) | null> {
  const { rows } = await db.query<FilaUsuario & { tiene_clave: boolean }>(
    `UPDATE recuperaciones_clave r SET usada_en = now()
     FROM usuarios u LEFT JOIN empresas e ON e.id = u.empresa_id
     WHERE r.token_hash = $1 AND r.usada_en IS NULL AND r.expira_en > now() AND r.proposito = ANY($2)
       AND u.id = r.usuario_id AND u.activo AND (u.empresa_id IS NULL OR e.activa)
       AND (r.enviado_a IS NULL OR r.enviado_a = u.email)
     RETURNING ${COLUMNAS_USUARIO}, u.clave_hash IS NOT NULL AS tiene_clave`,
    [tokenHash, propositos],
  );
  return rows[0] ? { ...aUsuario(rows[0]), tieneClave: rows[0].tiene_clave } : null;
}

/** Marca el correo como verificado si aún no lo estaba, y dice si cambió. Solo lo llama quien gastó un enlace. */
export async function marcarVerificado(db: Consultor, usuarioId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    'UPDATE usuarios SET email_verificado_en = now() WHERE id = $1 AND email_verificado_en IS NULL',
    [usuarioId],
  );
  return rowCount === 1;
}

/** Lo que hace falta para mandarle un enlace a alguien: su estado, y el nombre con que se ve su empresa. */
export interface CuentaParaEnlace {
  id: string;
  nombre: string;
  email: string;
  empresaId: string | null;
  rol: Rol;
  activo: boolean;
  empresaActiva: boolean;
  tieneClave: boolean;
  verificado: boolean;
  empresa: string | null;
}

/** Bloquea la fila del usuario hasta el final de la transacción: dos reenvíos a la vez no se saltan el freno. */
export async function bloquearCuentaParaEnlace(db: Consultor, usuarioId: string): Promise<CuentaParaEnlace | null> {
  const { rows } = await db.query<CuentaParaEnlace>(
    `SELECT u.id, u.nombre, u.email, u.empresa_id AS "empresaId", u.rol, u.activo,
            coalesce(e.activa, true) AS "empresaActiva", u.clave_hash IS NOT NULL AS "tieneClave",
            u.email_verificado_en IS NOT NULL AS verificado, coalesce(e.nombre_comercial, e.nombre) AS empresa
     FROM usuarios u LEFT JOIN empresas e ON e.id = u.empresa_id
     WHERE u.id = $1
     FOR UPDATE OF u`,
    [usuarioId],
  );
  return rows[0] ?? null;
}

/**
 * Cuándo se le mandó a un buzón su último enlace de invitación o verificación de esta cuenta, y cuántos en
 * las últimas 24 h. El freno protege un buzón: un correo nuevo empieza de cero.
 */
export async function enviosRecientes(
  db: Consultor, usuarioId: string, email: string,
): Promise<{ ultimo: Date | null; enUnDia: number }> {
  const { rows } = await db.query<{ ultimo: Date | null; en_un_dia: number }>(
    `SELECT max(creada_en) AS ultimo, count(*) FILTER (WHERE creada_en > now() - interval '24 hours')::int AS en_un_dia
     FROM recuperaciones_clave
     WHERE usuario_id = $1 AND enviado_a = $2 AND proposito IN ('invitacion', 'verificacion')`,
    [usuarioId, email],
  );
  return { ultimo: rows[0]?.ultimo ?? null, enUnDia: rows[0]?.en_un_dia ?? 0 };
}

/**
 * Las contraseñas incorrectas recientes para un correo (RN27), exista o no la cuenta. Un acceso correcto
 * o un restablecimiento por correo ponen la cuenta a cero; los intentos rechazados por el propio
 * bloqueo no cuentan, para que el bloqueo termine solo.
 */
export async function fallosRecientes(db: Consultor, email: string, usuarioId: string | null, minutos: number): Promise<number> {
  const { rows } = await db.query<{ fallos: number }>(
    `SELECT count(*)::int AS fallos FROM historial h
     WHERE h.accion = 'SESION_FALLIDA'
       AND h.detalle ->> 'email' = $1
       AND h.detalle ->> 'motivo' IN ('CLAVE_INCORRECTA', 'CORREO_DESCONOCIDO')
       AND h.creado_en > now() - make_interval(mins => $3)
       AND h.creado_en > coalesce(
         (SELECT max(r.creado_en) FROM historial r
          WHERE r.usuario_id = $2 AND (r.accion IN ('SESION_INICIADA', 'CLAVE_RESTABLECIDA')
            -- Aceptar la invitación también define la contraseña por correo (D41).
            OR (r.accion = 'CORREO_VERIFICADO' AND r.detalle ->> 'mediante' = 'invitacion'))),
         '-infinity')`,
    [email, usuarioId, minutos],
  );
  return rows[0]?.fallos ?? 0;
}
