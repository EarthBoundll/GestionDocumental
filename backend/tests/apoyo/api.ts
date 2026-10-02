import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import request from 'supertest';
import type { Almacenamiento } from '../../src/almacenamiento/almacenamiento.js';
import { AlmacenamientoEnDisco } from '../../src/almacenamiento/en-disco.js';
import { crearApp } from '../../src/app.js';
import { hashearClave } from '../../src/compartido/claves.js';
import type { Rol } from '../../src/compartido/permisos.js';
import { leerEntorno, type Entorno } from '../../src/config/entorno.js';

export const SECRETO_DE_PRUEBAS = 'secreto-de-pruebas-con-mas-de-32-caracteres';
export const CLAVE = 'clave-de-prueba-1';
export const UA_ESCRITORIO = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';
export const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

export function entornoDePruebas(cambios: Record<string, string> = {}): Entorno {
  return leerEntorno({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://postgres@localhost/no-se-usa',
    JWT_SECRETO: SECRETO_DE_PRUEBAS,
    ...cambios,
  });
}

export const URL_PUBLICA_DE_PRUEBAS = 'http://localhost:4000';

/** El almacenamiento real en disco, en una carpeta temporal: las pruebas suben y descargan de verdad. */
export function almacenamientoDePruebas(): AlmacenamientoEnDisco {
  return new AlmacenamientoEnDisco({
    directorio: join(tmpdir(), 'gestion-documental-archivos-de-prueba'),
    urlPublica: URL_PUBLICA_DE_PRUEBAS,
    secreto: SECRETO_DE_PRUEBAS,
  });
}

export function crearAppDePruebas(
  pool: pg.Pool,
  cambios: Record<string, string> = {},
  almacenamiento: Almacenamiento = almacenamientoDePruebas(),
) {
  return crearApp({ pool, entorno: entornoDePruebas(cambios), almacenamiento });
}

type App = ReturnType<typeof crearApp>;

let secuencia = 0;

/** Registra una organización por la API y devuelve su respuesta: token, usuario y organización. */
export async function registrarOrganizacion(app: App, { userAgent = UA_ESCRITORIO } = {}) {
  const n = ++secuencia;
  const respuesta = await request(app)
    .post('/api/v1/auth/registro')
    .set('User-Agent', userAgent)
    .send({
      organizacion: { nombre: `Empresa de prueba ${n}` },
      administrador: { nombre: `Administradora ${n}`, email: `admin${n}.${Date.now()}@ejemplo.pe`, clave: CLAVE },
    });
  if (respuesta.status !== 201) throw new Error(`El registro falló: ${respuesta.status} ${JSON.stringify(respuesta.body)}`);
  return respuesta.body as {
    token: string;
    expiraEn: string;
    usuario: { id: string; nombre: string; email: string; rol: Rol };
    organizacion: { id: string; nombre: string };
  };
}

/** Crea directamente en la base un usuario de la organización, con la contraseña CLAVE. */
export async function crearUsuarioEn(pool: pg.Pool, organizacionId: string, rol: Rol = 'usuario') {
  const email = `persona${++secuencia}.${Date.now()}@ejemplo.pe`;
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO usuarios (organizacion_id, nombre, email, clave_hash, rol)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [organizacionId, `Persona ${secuencia}`, email, await hashearClave(CLAVE), rol],
  );
  return { id: rows[0]!.id, email };
}

export async function iniciarSesion(app: App, email: string, { userAgent = UA_ESCRITORIO, clave = CLAVE } = {}) {
  const respuesta = await request(app).post('/api/v1/auth/login').set('User-Agent', userAgent).send({ email, clave });
  if (respuesta.status !== 200) throw new Error(`El inicio de sesión falló: ${respuesta.status} ${JSON.stringify(respuesta.body)}`);
  return respuesta.body.token as string;
}

/** Las acciones del historial de una organización, en orden de inserción. */
export async function historialDe(pool: pg.Pool, organizacionId: string | null) {
  const { rows } = await pool.query(
    `SELECT accion, usuario_id, rol_usuario, entidad_tipo, entidad_id, detalle, user_agent, es_movil
     FROM historial WHERE organizacion_id IS NOT DISTINCT FROM $1 ORDER BY id`,
    [organizacionId],
  );
  return rows;
}
