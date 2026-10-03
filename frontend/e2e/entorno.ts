import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Puertos propios: las pruebas no chocan con `npm run local` (4000 y 5433) ni con `npm run dev` (5173).
export const PUERTO_API = 4100;
export const PUERTO_BASE = 5434;
export const PUERTO_WEB = 5174;
export const URL_API = `http://localhost:${PUERTO_API}/api/v1`;
export const URL_WEB = `http://localhost:${PUERTO_WEB}`;

// Una carpeta nueva por ejecución: la base empieza vacía y los correos de recuperación quedan en ella.
// Se fija en el entorno para que los procesos de las pruebas hereden la misma.
process.env.GD_E2E_DIR ??= mkdtempSync(join(tmpdir(), 'gestion-documental-e2e-'));
export const CARPETA = process.env.GD_E2E_DIR;
export const CARPETA_CORREOS = join(CARPETA, 'correos');

/** Valores de prueba del Master: solo existen en la base desechable de estas pruebas. */
export const MASTER = {
  email: 'plataforma@ejemplo.pe',
  clave: 'clave-maestra-de-pruebas-1',
  nombre: 'Master de pruebas',
  dni: '10000001',
};
