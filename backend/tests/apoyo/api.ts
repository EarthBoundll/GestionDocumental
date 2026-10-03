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
import type { Correo, Mensaje } from '../../src/correo/correo.js';
import { crearMaster } from '../../src/modulos/auth/master.js';

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

/** Un correo que no sale a ningún sitio: guarda lo enviado para que la prueba lo lea. */
export class CorreoDePruebas implements Correo {
  readonly enviados: Mensaje[] = [];
  async enviar(mensaje: Mensaje): Promise<void> {
    this.enviados.push(mensaje);
  }
}

type App = ReturnType<typeof crearApp>;

const pools = new WeakMap<App, pg.Pool>();
const tokensDelMaster = new WeakMap<App, string>();

export function crearAppDePruebas(
  pool: pg.Pool,
  cambios: Record<string, string> = {},
  almacenamiento: Almacenamiento = almacenamientoDePruebas(),
  correo: Correo = new CorreoDePruebas(),
) {
  const app = crearApp({ pool, entorno: entornoDePruebas(cambios), almacenamiento, correo });
  pools.set(app, pool);
  return app;
}

/** Valores de prueba del Master: solo existen en las bases temporales de las pruebas. */
export const MASTER_DE_PRUEBAS = {
  email: 'plataforma@ejemplo.pe',
  nombre: 'Master de pruebas',
  dni: '10000001',
  clave: 'clave-maestra-de-pruebas-1',
};

/** La sesión del Master en esta app; crea su cuenta si la base aún no la tiene. */
export async function tokenDelMaster(app: App): Promise<string> {
  const guardado = tokensDelMaster.get(app);
  if (guardado) return guardado;
  const pool = pools.get(app);
  if (!pool) throw new Error('La app no se creó con crearAppDePruebas');
  await crearMaster(pool, MASTER_DE_PRUEBAS);
  const token = await iniciarSesion(app, MASTER_DE_PRUEBAS.email, { clave: MASTER_DE_PRUEBAS.clave });
  tokensDelMaster.set(app, token);
  return token;
}

let secuencia = 0;

/**
 * Una empresa nueva, como en producción: la crea el Master por la API con su primer administrador
 * (decisión B), y después ese administrador inicia sesión. Devuelve su sesión: token, usuario y empresa.
 */
export async function registrarEmpresa(app: App, { userAgent = UA_ESCRITORIO } = {}) {
  const n = ++secuencia;
  const email = `admin${n}.${Date.now()}@ejemplo.pe`;
  const creada = await request(app)
    .post('/api/v1/plataforma/empresas')
    .set('Authorization', `Bearer ${await tokenDelMaster(app)}`)
    .send({
      empresa: { nombre: `Empresa de prueba ${n}` },
      administrador: { nombre: `Administradora ${n}`, email, clave: CLAVE },
    });
  if (creada.status !== 201) throw new Error(`No se pudo crear la empresa: ${creada.status} ${JSON.stringify(creada.body)}`);
  const respuesta = await request(app).post('/api/v1/auth/login').set('User-Agent', userAgent).send({ email, clave: CLAVE });
  if (respuesta.status !== 200) throw new Error(`El inicio de sesión falló: ${respuesta.status} ${JSON.stringify(respuesta.body)}`);
  return respuesta.body as {
    token: string;
    expiraEn: string;
    usuario: { id: string; nombre: string; email: string; rol: Rol; dni: string | null };
    empresa: { id: string; nombre: string };
  };
}

/** Crea directamente en la base un usuario de la empresa, con la contraseña CLAVE. */
export async function crearUsuarioEn(pool: pg.Pool, empresaId: string, rol: 'administrador' | 'usuario' = 'usuario') {
  const email = `persona${++secuencia}.${Date.now()}@ejemplo.pe`;
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO usuarios (empresa_id, nombre, email, clave_hash, rol)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [empresaId, `Persona ${secuencia}`, email, await hashearClave(CLAVE), rol],
  );
  return { id: rows[0]!.id, email };
}

export async function iniciarSesion(app: App, email: string, { userAgent = UA_ESCRITORIO, clave = CLAVE } = {}) {
  const respuesta = await request(app).post('/api/v1/auth/login').set('User-Agent', userAgent).send({ email, clave });
  if (respuesta.status !== 200) throw new Error(`El inicio de sesión falló: ${respuesta.status} ${JSON.stringify(respuesta.body)}`);
  return respuesta.body.token as string;
}

/** Las acciones del historial de una empresa, en orden de inserción. */
export async function historialDe(pool: pg.Pool, empresaId: string | null) {
  const { rows } = await pool.query(
    `SELECT accion, usuario_id, rol_usuario, entidad_tipo, entidad_id, detalle, user_agent, es_movil
     FROM historial WHERE empresa_id IS NOT DISTINCT FROM $1 ORDER BY id`,
    [empresaId],
  );
  return rows;
}
