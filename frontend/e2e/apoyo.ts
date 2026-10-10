import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { CARPETA_CORREOS, MASTER, URL_API } from './entorno';

// Los datos de cada caso se preparan por la API, que es más rápida; lo que se prueba se hace en pantalla.

let contador = 0;
/** Un sufijo distinto por llamada: cada caso trabaja con su propia empresa y no depende de los demás. */
export const unico = () => `${Date.now().toString(36)}${(contador++).toString(36)}`;

export const CLAVE = 'clave-de-pruebas-1';

/** Un PDF mínimo pero válido: el servidor mira los primeros bytes, no la extensión. */
export const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

/** Un PNG de 1×1 válido, para lo que se muestra como imagen (vista previa, logo). */
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

export function archivoPdf(nombre: string) {
  return { name: nombre, mimeType: 'application/pdf', buffer: PDF };
}

async function comoJson<T>(respuesta: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  expect(respuesta.ok(), `${respuesta.url()} respondió ${respuesta.status()}: ${await respuesta.text()}`).toBe(true);
  return respuesta.status() === 204 ? (undefined as T) : ((await respuesta.json()) as T);
}

export async function tokenDe(request: APIRequestContext, email: string, clave: string): Promise<string> {
  const { token } = await comoJson<{ token: string }>(await request.post(`${URL_API}/auth/login`, { data: { email, clave } }));
  return token;
}

const conToken = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export interface Cuenta {
  id: string;
  nombre: string;
  email: string;
  clave: string;
}

export interface EmpresaDePrueba {
  id: string;
  nombre: string;
  administrador: Cuenta;
}

/**
 * Acepta la invitación que le llegó a ese correo (D41), como lo haría su dueño: sin ella la cuenta no entra.
 * No hay atajo: el token sale del correo que la API dejó en la carpeta, igual que en una bandeja de entrada.
 */
export async function activarPorCorreo(request: APIRequestContext, email: string, clave = CLAVE): Promise<void> {
  const token = new URL(enlaceDelCorreo(email, '/activar-cuenta')).hash.slice(1);
  await comoJson<{ email: string }>(await request.post(`${URL_API}/auth/activacion`, { data: { token, claveNueva: clave } }));
}

/** El Master da de alta una empresa con su primer administrador (RF01), que acepta su invitación. */
export async function nuevaEmpresa(request: APIRequestContext, nombre = `Empresa ${unico()}`): Promise<EmpresaDePrueba> {
  const master = await tokenDe(request, MASTER.email, MASTER.clave);
  const sufijo = unico();
  const administrador = { nombre: `Admin ${sufijo}`, email: `admin.${sufijo}@e2e.pe` };
  const { empresa, administrador: creado } = await comoJson<{ empresa: { id: string }; administrador: { id: string } }>(
    await request.post(`${URL_API}/plataforma/empresas`, { ...conToken(master), data: { empresa: { nombre }, administrador } }),
  );
  await activarPorCorreo(request, administrador.email);
  return { id: empresa.id, nombre, administrador: { ...administrador, clave: CLAVE, id: creado.id } };
}

/** Una cuenta de la empresa, creada por su administrador y ya activada por su dueño. */
export async function nuevaCuenta(request: APIRequestContext, empresa: EmpresaDePrueba, rol: 'usuario' | 'administrador', nombre?: string): Promise<Cuenta> {
  const token = await tokenDe(request, empresa.administrador.email, empresa.administrador.clave);
  const sufijo = unico();
  const datos = { nombre: nombre ?? `${rol === 'usuario' ? 'Usuaria' : 'Admin'} ${sufijo}`, email: `${rol}.${sufijo}@e2e.pe`, rol };
  const { id } = await comoJson<{ id: string }>(await request.post(`${URL_API}/usuarios`, { ...conToken(token), data: datos }));
  await activarPorCorreo(request, datos.email);
  return { id, nombre: datos.nombre, email: datos.email, clave: CLAVE };
}

export async function subirDocumento(
  request: APIRequestContext,
  cuenta: Cuenta,
  { nombre, categoria = 'Otros', fecha = '2026-09-15', archivo = 'documento.pdf', contenido = { mimeType: 'application/pdf', buffer: PDF }, descripcion }: {
    nombre: string; categoria?: string; fecha?: string; archivo?: string; contenido?: { mimeType: string; buffer: Buffer }; descripcion?: string;
  },
): Promise<string> {
  const token = await tokenDe(request, cuenta.email, cuenta.clave);
  const { datos } = await comoJson<{ datos: { id: string; nombre: string }[] }>(await request.get(`${URL_API}/categorias`, conToken(token)));
  const categoriaId = datos.find((c) => c.nombre === categoria)!.id;
  const { id } = await comoJson<{ id: string }>(await request.post(`${URL_API}/documentos`, {
    ...conToken(token),
    multipart: { nombre, categoriaId, fechaDocumento: fecha, ...(descripcion && { descripcion }), archivo: { name: archivo, ...contenido } },
  }));
  return id;
}

/** Manda un documento a la papelera por la API (RF09, RF26). */
export async function eliminarDocumento(request: APIRequestContext, cuenta: Cuenta, id: string): Promise<void> {
  const token = await tokenDe(request, cuenta.email, cuenta.clave);
  await comoJson<void>(await request.delete(`${URL_API}/documentos/${id}`, conToken(token)));
}

/** Crea una categoría por la API, restringida a esas personas si se indican (RF06, RF25). */
export async function nuevaCategoria(
  request: APIRequestContext, empresa: EmpresaDePrueba, nombre: string, autorizados?: Cuenta[],
): Promise<string> {
  const token = await tokenDe(request, empresa.administrador.email, empresa.administrador.clave);
  const datos = autorizados ? { nombre, restringida: true, usuariosAutorizados: autorizados.map((cuenta) => cuenta.id) } : { nombre };
  const { id } = await comoJson<{ id: string }>(await request.post(`${URL_API}/categorias`, { ...conToken(token), data: datos }));
  return id;
}

/** Inicia sesión en pantalla, como lo haría la persona. */
export async function entrar(page: Page, cuenta: { email: string; clave: string }) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(cuenta.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(cuenta.clave);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Cierra sesión como una persona: el botón de la cabecera y su confirmación (D37). */
export async function salir(page: Page) {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.getByRole('dialog', { name: '¿Cerrar sesión?' }).getByRole('button', { name: 'Sí, cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login\?motivo=salida$/);
}

/** En el celular el menú está plegado; en el escritorio, a la vista. */
export async function irDesdeElMenu(page: Page, enlace: string) {
  const abrir = page.getByRole('button', { name: 'Abrir el menú' });
  // Se espera a que esté en pantalla uno de los dos: decidir antes de que cargue el marco elegiría mal.
  await expect(abrir.or(page.getByRole('navigation', { name: 'Principal' })).first()).toBeVisible();
  if (await abrir.isVisible()) {
    await abrir.click();
    await page.getByRole('dialog', { name: 'Menú' }).getByRole('link', { name: enlace, exact: true }).click();
  } else {
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: enlace, exact: true }).click();
  }
}

/** El último correo enviado a esa dirección (en estas pruebas, los correos van a una carpeta). */
export function ultimoCorreoPara(email: string): string {
  const correos = readdirSync(CARPETA_CORREOS)
    .map((nombre) => join(CARPETA_CORREOS, nombre))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .map((ruta) => readFileSync(ruta, 'utf8'))
    .filter((texto) => texto.startsWith(`Para: ${email}`));
  expect(correos.length, `no llegó ningún correo para ${email}`).toBeGreaterThan(0);
  return correos[0]!;
}

/** El enlace de ese tipo («/activar-cuenta», «/restablecer-clave»…) en el último correo que le llegó. */
export function enlaceDelCorreo(email: string, ruta: string): string {
  const enlace = new RegExp(`https?://\\S+${ruta}#[\\w-]+`).exec(ultimoCorreoPara(email))?.[0];
  expect(enlace, `el último correo para ${email} no trae un enlace a ${ruta}`).toBeTruthy();
  return enlace!;
}
