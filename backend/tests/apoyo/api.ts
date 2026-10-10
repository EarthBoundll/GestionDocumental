import { randomUUID } from 'node:crypto';
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
import { DepositoEnDisco, type DepositoDeRespaldos } from '../../src/respaldos/deposito.js';

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
const correos = new WeakMap<App, Correo>();
const tokensDelMaster = new WeakMap<App, string>();

/** Los respaldos de las pruebas, en una carpeta temporal propia de cada app. */
export function depositoDePruebas(): DepositoEnDisco {
  return new DepositoEnDisco(join(tmpdir(), `gestion-documental-respaldos-${randomUUID()}`));
}

export function crearAppDePruebas(
  pool: pg.Pool,
  cambios: Record<string, string> = {},
  almacenamiento: Almacenamiento = almacenamientoDePruebas(),
  correo: Correo = new CorreoDePruebas(),
  respaldos: DepositoDeRespaldos = depositoDePruebas(),
) {
  const app = crearApp({ pool, entorno: entornoDePruebas(cambios), almacenamiento, correo, respaldos });
  pools.set(app, pool);
  correos.set(app, correo);
  return app;
}

/** El token del último enlace que se le envió a un correo: lo que va tras el «#» en el mensaje. */
export function tokenDelUltimoEnlace(correo: CorreoDePruebas, para: string): string {
  const mensaje = correo.enviados.findLast((enviado) => enviado.para === para);
  const token = mensaje?.texto.match(/#([\w-]{20,})/)?.[1];
  if (!token) throw new Error(`No le llegó ningún enlace a ${para}`);
  return token;
}

/**
 * Acepta la invitación de una cuenta como lo haría su dueño (D41): lee el correo que le llegó, abre el enlace
 * y define su contraseña. No hay atajo en el código: las pruebas pasan por el mismo camino que una persona.
 */
export async function activarCuenta(app: App, email: string, clave = CLAVE): Promise<void> {
  const correo = correos.get(app);
  if (!(correo instanceof CorreoDePruebas)) throw new Error('Para activar una cuenta, la app necesita un CorreoDePruebas');
  const respuesta = await request(app).post('/api/v1/auth/activacion').send({ token: tokenDelUltimoEnlace(correo, email), claveNueva: clave });
  if (respuesta.status !== 200) throw new Error(`No se pudo activar la cuenta: ${respuesta.status} ${JSON.stringify(respuesta.body)}`);
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
 * (decisión B), ese administrador acepta su invitación (D41) y después inicia sesión. Devuelve su sesión:
 * token, usuario y empresa.
 */
export async function registrarEmpresa(app: App, { userAgent = UA_ESCRITORIO } = {}) {
  const n = ++secuencia;
  const email = `admin${n}.${Date.now()}@ejemplo.pe`;
  const creada = await request(app)
    .post('/api/v1/plataforma/empresas')
    .set('Authorization', `Bearer ${await tokenDelMaster(app)}`)
    .send({
      empresa: { nombre: `Empresa de prueba ${n}` },
      administrador: { nombre: `Administradora ${n}`, email },
    });
  if (creada.status !== 201) throw new Error(`No se pudo crear la empresa: ${creada.status} ${JSON.stringify(creada.body)}`);
  await activarCuenta(app, email);
  const respuesta = await request(app).post('/api/v1/auth/login').set('User-Agent', userAgent).send({ email, clave: CLAVE });
  if (respuesta.status !== 200) throw new Error(`El inicio de sesión falló: ${respuesta.status} ${JSON.stringify(respuesta.body)}`);
  return respuesta.body as {
    token: string;
    expiraEn: string;
    usuario: { id: string; nombre: string; email: string; rol: Rol; dni: string | null };
    empresa: { id: string; nombre: string };
  };
}

/**
 * Crea directamente en la base un usuario de la empresa, con la contraseña CLAVE y el correo ya verificado:
 * como si hubiera aceptado su invitación. Es un dato de partida de la base de pruebas, escrito por su dueño;
 * la API no tiene forma de hacerlo. Las pruebas de la invitación usan el camino completo.
 */
export async function crearUsuarioEn(pool: pg.Pool, empresaId: string, rol: 'administrador' | 'usuario' = 'usuario') {
  const email = `persona${++secuencia}.${Date.now()}@ejemplo.pe`;
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO usuarios (empresa_id, nombre, email, clave_hash, rol, email_verificado_en)
     VALUES ($1, $2, $3, $4, $5, now()) RETURNING id`,
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
