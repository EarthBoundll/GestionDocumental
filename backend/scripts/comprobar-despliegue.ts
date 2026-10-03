/**
 * Comprueba un despliegue desde fuera, como lo vería un navegador: que la API responde, que admite al
 * frontend (CORS), que el frontend se sirve con su CSP y sus rutas, y que su JavaScript apunta a esta
 * API. Son los errores de configuración más probables al desplegar (docs/07-despliegue.md). No crea
 * datos ni inicia sesión.
 *
 *   npm run comprobar-despliegue -- https://<api>.onrender.com https://<app>.vercel.app
 */
const [api, web] = process.argv.slice(2).map((url) => url?.replace(/\/+$/, ''));
if (!api || !web || !URL.canParse(api) || !URL.canParse(web)) {
  console.error('Uso: npm run comprobar-despliegue -- <URL de la API> <URL del frontend>');
  process.exit(2);
}
const base = `${api}/api/v1`;
const origen = new URL(web).origin;
let fallos = 0;

function informar(correcto: boolean, que: string, siFalla = '') {
  console.log(`${correcto ? '✔' : '✘'} ${que}${correcto || !siFalla ? '' : `\n    → ${siFalla}`}`);
  if (!correcto) fallos++;
}

async function pedir(url: string, opciones: RequestInit = {}, segundos = 20): Promise<Response | null> {
  try {
    return await fetch(url, { ...opciones, redirect: 'manual', signal: AbortSignal.timeout(segundos * 1000) });
  } catch {
    return null;
  }
}

// Render gratuito duerme la API: la primera petición puede tardar alrededor de un minuto (D13).
const salud = await pedir(`${base}/salud`, {}, 90);
const cuerpoSalud = salud ? await salud.json().catch(() => null) as { estado?: string } | null : null;
informar(salud?.status === 200 && cuerpoSalud?.estado === 'ok', `La API responde y su base de datos también (${salud?.status ?? 'sin respuesta'})`,
  salud?.status === 503
    ? 'La API no llega a la base: revisa DATABASE_URL (Session pooler, puerto 5432) y DATABASE_CA en Render'
    : 'Revisa en Render que el despliegue terminó y mira sus registros (Logs)');

const previa = await pedir(`${base}/auth/login`, {
  method: 'OPTIONS',
  headers: { Origin: origen, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
});
informar(previa?.headers.get('access-control-allow-origin') === origen, `La API admite peticiones del frontend (CORS para ${origen})`,
  `CORS_ORIGEN en Render debe ser exactamente ${origen}, sin barra final`);

const conOrigen = await pedir(`${base}/salud`, { headers: { Origin: origen } });
informar(Boolean(conOrigen?.headers.get('access-control-expose-headers')?.includes('Content-Disposition')),
  'El frontend puede leer el nombre del CSV del historial (Content-Disposition expuesta)');

const diagnostico = await pedir(`${base}/salud/red`);
informar(diagnostico?.status === 404, 'El diagnóstico de red está apagado',
  'Cuando la IP que ve la API sea la tuya (backend/README.md, paso 4), pon DIAGNOSTICO_RED=false en Render');

const portada = await pedir(`${web}/`);
const csp = portada?.headers.get('content-security-policy') ?? '';
informar(portada?.status === 200 && Boolean(portada.headers.get('content-type')?.includes('text/html')), `El frontend se sirve (${portada?.status ?? 'sin respuesta'})`,
  'Revisa en Vercel que el proyecto usa la carpeta frontend y que el último despliegue terminó');
const hostApi = new URL(api).host;
const conectaConLaApi = csp.split(';').find((directiva) => directiva.trim().startsWith('connect-src'))?.split(/\s+/)
  .some((fuente) => fuente === api || (fuente.startsWith('https://*.') && hostApi.endsWith(fuente.slice('https://*'.length))));
informar(conectaConLaApi === true, 'La política de seguridad (CSP) del frontend permite hablar con la API',
  csp ? `connect-src en frontend/vercel.json no incluye ${api}` : 'Vercel no envía la cabecera Content-Security-Policy: ¿se publicó frontend/vercel.json?');

const rutaInterna = await pedir(`${web}/documentos/una-ruta-interna`);
informar(rutaInterna?.status === 200, 'Abrir un enlace interno directamente (o recargar) no da 404',
  'Falta la reescritura a index.html de frontend/vercel.json');

const html = portada ? await portada.text() : '';
const guion = /<script[^>]+src="([^"]+\.js)"/.exec(html)?.[1];
const codigo = guion ? await (await pedir(new URL(guion, web).toString()))?.text() : undefined;
informar(Boolean(codigo?.includes(base)), `El frontend publicado llama a esta API (${base})`,
  `En Vercel, VITE_API_URL debe ser ${base}; después hay que volver a desplegar: se lee al compilar`);

informar(api.startsWith('https://') && web.startsWith('https://'), 'API y frontend van por HTTPS');

console.log(fallos === 0 ? '\nTodo en orden.' : `\n${fallos} ${fallos === 1 ? 'comprobación falló' : 'comprobaciones fallaron'}.`);
process.exitCode = fallos === 0 ? 0 : 1;
