/**
 * Lee un solo archivo en un proceso nuevo, como la API recién despertada: cuánto pesa cargar el lector,
 * cuánto tarda la primera lectura y hasta dónde sube la memoria. Lo llama medir.ts; responde en JSON.
 *
 *   node --import tsx medir-uno.ts <ruta> <tipo MIME>
 */
import { readFile } from 'node:fs/promises';

const [ruta, mime] = process.argv.slice(2);
if (!ruta || !mime) throw new Error('Uso: node --import tsx medir-uno.ts <ruta> <tipo MIME>');

const rssInicial = process.memoryUsage().rss;
const inicioDeCarga = performance.now();
const { leerContenido } = await import('./leer.js');
// unpdf carga pdf.js en la primera lectura: se fuerza aquí para medir la carga aparte.
const { getResolvedPDFJS } = await import('unpdf');
await getResolvedPDFJS();
const msCarga = performance.now() - inicioDeCarga;
const rssCargado = process.memoryUsage().rss;

const contenido = await readFile(ruta);
const rssBase = process.memoryUsage().rss;
const cpuInicial = process.cpuUsage();
const inicio = performance.now();
const lectura = await leerContenido(contenido, mime);
const msLectura = performance.now() - inicio;
const cpu = process.cpuUsage(cpuInicial);

process.stdout.write(JSON.stringify({
  rssInicial, rssCargado, msCarga, rssBase,
  pico: process.resourceUsage().maxRSS * 1024,
  msLectura, cpuMs: (cpu.user + cpu.system) / 1000,
  estado: lectura.estado,
}));
