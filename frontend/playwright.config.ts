import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { CARPETA, MASTER, PUERTO_API, PUERTO_BASE, PUERTO_WEB, URL_API, URL_WEB } from './e2e/entorno';

/**
 * Pruebas funcionales de punta a punta (Fase 8): cada requisito de docs/01-analisis.md §3 en un navegador
 * de verdad, como lo usaría una persona, contra el sistema completo: la API con un PostgreSQL 17 propio y
 * desechable, y la compilación de producción del frontend (no el servidor de desarrollo, que esconde
 * fallos que solo aparecen al desplegar). El informe queda en docs/evidencias/pruebas-funcionales.md.
 */
const WEB = join(CARPETA, 'web');

/**
 * `npm run pruebas:demo`: el guion de la sustentación (casos @demo) en un navegador visible y a velocidad
 * de lectura, para proyectarlo ante el jurado. npm fija el nombre del script en todos los sistemas.
 */
const DEMO = process.env.npm_lifecycle_event === 'pruebas:demo';
/** El informe HTML de Playwright, con capturas y vídeo de lo que falle. Se abre con `npm run pruebas:informe`. */
export const INFORME_HTML = 'informe-pruebas';

export default defineConfig({
  testDir: './e2e',
  outputDir: join(CARPETA, 'resultados'),
  // En serie: comparten la API, y así los tiempos del informe no se pisan entre sí.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['./e2e/informe.ts'], ['html', { outputFolder: INFORME_HTML, open: 'never' }]],
  use: {
    baseURL: URL_WEB,
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    // De lo que falla queda la evidencia para entender por qué: captura, vídeo y traza paso a paso.
    screenshot: 'only-on-failure',
    video: DEMO ? 'on' : 'retain-on-failure',
    trace: 'retain-on-failure',
    // Solo si este equipo ya tiene un Chromium propio; si no, el de `npx playwright install chromium`.
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined, slowMo: DEMO ? 600 : 0 },
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    // El indicador 5: los casos marcados @movil se repiten en un celular de 360 px.
    { name: 'celular', grep: /@movil/, use: { ...devices['Pixel 5'], viewport: { width: 360, height: 740 } } },
  ],
  webServer: [
    {
      command: 'npm run local',
      cwd: '../backend',
      url: `${URL_API}/salud`,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      env: {
        DIRECTORIO_LOCAL: CARPETA,
        PUERTO_BASE_LOCAL: String(PUERTO_BASE),
        PORT: String(PUERTO_API),
        CORS_ORIGEN: URL_WEB,
        URL_FRONTEND: URL_WEB,
        MASTER_EMAIL: MASTER.email,
        MASTER_PASSWORD: MASTER.clave,
        MASTER_NOMBRE: MASTER.nombre,
        MASTER_DNI: MASTER.dni,
      },
    },
    {
      command: `npx vite build --outDir "${WEB}" --emptyOutDir && npx vite preview --outDir "${WEB}" --port ${PUERTO_WEB} --strictPort`,
      url: URL_WEB,
      timeout: 120_000,
      // Un contacto de prueba (D38): así se recorre también «Solicita una cuenta».
      env: { VITE_API_URL: URL_API, VITE_CONTACTO_EMAIL: 'contacto@ejemplo.pe' },
    },
  ],
});
