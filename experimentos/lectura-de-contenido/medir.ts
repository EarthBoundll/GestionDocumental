/**
 * Mide el lector candidato con los archivos ficticios de archivos.ts y escribe el informe en
 * docs/evidencias/lectura-de-contenido.md: qué responde con cada archivo, cuánto del texto recupera, cuánto
 * tarda, cuánta memoria pide, cuánto ocuparía en la base y qué palabras clave saca.
 *
 *   npm run medir                 # todo; el espacio en la base necesita un usuario que no sea root
 *   npm run medir -- --sin-base   # sin arrancar PostgreSQL
 */
import { spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arrancarPostgresDesechable } from '../../backend/scripts/postgres-desechable.js';
import { crearPool } from '../../backend/src/db/pool.js';
import { crearArchivos, type Archivo, type Grupo } from './archivos.js';
import { LIMITES, leerContenido, type Lectura } from './leer.js';
import { contarPalabras, normalizar, palabrasClave } from './palabras-clave.js';

const REPETICIONES = 3;
/** Render gratuito da 0,1 CPU: el mismo trabajo, unas diez veces más lento. Es una estimación. */
const FACTOR_RENDER = 10;
const MB = 1024 * 1024;

const formato = (numero: number, decimales = 0) => numero.toLocaleString('es-ES', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
const ms = (valor: number) => (valor >= 1000 ? `${formato(valor / 1000, 1)} s` : `${formato(valor, valor < 10 ? 1 : 0)} ms`);
const megas = (bytes: number) => `${formato(bytes / MB, bytes < 10 * MB ? 1 : 0)} MB`;
const tamano = (bytes: number) => (bytes < MB ? `${formato(bytes / 1024, bytes < 10 * 1024 ? 1 : 0)} KB` : megas(bytes));
const porcentaje = (fraccion: number) => `${formato(fraccion * 100, 0)} %`;
const mediana = (valores: number[]) => {
  const orden = [...valores].sort((a, b) => a - b);
  const medio = orden.length >> 1;
  return orden.length % 2 ? orden[medio]! : (orden[medio - 1]! + orden[medio]!) / 2;
};

interface Resultado {
  archivo: Archivo;
  lectura: Lectura;
  ms: number;
  cpuMs: number;
}

interface EnProcesoAparte {
  rssInicial: number;
  rssCargado: number;
  msCarga: number;
  rssBase: number;
  pico: number;
  msLectura: number;
  cpuMs: number;
  estado: string;
}

const AQUI = fileURLToPath(new URL('.', import.meta.url));

function enProcesoAparte(ruta: string, mime: string): EnProcesoAparte {
  const salida = spawnSync(process.execPath, ['--import', 'tsx', 'medir-uno.ts', ruta, mime], { cwd: AQUI, encoding: 'utf8' });
  if (salida.status !== 0) throw new Error(`medir-uno.ts falló con ${ruta}: ${salida.stderr}`);
  return JSON.parse(salida.stdout) as EnProcesoAparte;
}

const fichas = (texto: string) => new Set((normalizar(texto).match(/[\p{L}\p{N}]+/gu) ?? []).filter((ficha) => ficha.length >= 2));

/**
 * Cuántas palabras del original aparecen en lo leído y cuántas de lo leído no estaban en el original
 * (palabras pegadas o partidas). Si el lector cortó el texto, se compara con el mismo largo del original.
 */
function calidad(archivo: Archivo, lectura: Lectura) {
  if (lectura.estado !== 'leido' || !archivo.original) return null;
  const original = lectura.truncado ? archivo.original.slice(0, Math.ceil(lectura.texto.length * 1.05)) : archivo.original;
  const esperadas = fichas(original);
  const leidas = fichas(lectura.texto);
  const todas = fichas(archivo.original);
  const ajenas = [...leidas].filter((ficha) => !todas.has(ficha));
  return { recuperadas: [...esperadas].filter((ficha) => leidas.has(ficha)).length / esperadas.size, ajenas, leidas: leidas.size };
}

const comoSeEsperaba = ({ archivo, lectura }: Resultado) =>
  archivo.esperado === 'sin_romperse' || archivo.esperado === lectura.estado;

function describir(lectura: Lectura): string {
  switch (lectura.estado) {
    case 'leido': {
      const paginas = lectura.paginas ? `, ${lectura.paginas.leidas} de ${lectura.paginas.total} págs.` : '';
      const corte = lectura.truncado ? `, cortado por ${lectura.truncado === 'caracteres' ? 'largo' : lectura.truncado}` : '';
      return `leído: ${formato(lectura.texto.length)} caracteres${paginas}${corte}`;
    }
    case 'sin_texto': return `sin texto${lectura.paginas ? ` (${lectura.paginas.total} págs.)` : ''}`;
    case 'no_admitido': return 'no se lee (tipo sin texto)';
    case 'ilegible': return `ilegible: ${lectura.motivo}`;
  }
}

async function espacioEnLaBase(textos: { grupo: Grupo; texto: string }[]) {
  const servidor = await arrancarPostgresDesechable();
  const pool = crearPool({ DATABASE_URL: `postgresql://${servidor.usuario}:${servidor.clave}@127.0.0.1:${servidor.puerto}/postgres`, DATABASE_CA: undefined });
  try {
    // Como quedaría en documentos: el texto y su tsvector en español, guardados (con TOAST y su compresión).
    await pool.query(`CREATE TABLE contenido (grupo text, texto text,
      vector tsvector GENERATED ALWAYS AS (to_tsvector('spanish', texto)) STORED)`);
    for (const { grupo, texto } of textos) await pool.query('INSERT INTO contenido (grupo, texto) VALUES ($1, $2)', [grupo, texto]);
    const { rows } = await pool.query<{ grupo: Grupo; documentos: number; caracteres: number; texto: number; vector: number }>(
      `SELECT grupo, count(*)::int AS documentos, avg(length(texto))::float AS caracteres,
              avg(pg_column_size(texto))::float AS texto, avg(pg_column_size(vector))::float AS vector
       FROM contenido GROUP BY grupo ORDER BY min(ctid)`);
    return rows;
  } finally {
    await pool.end();
    await servidor.detener();
  }
}

const NOMBRES_DE_GRUPO: Record<Grupo, string> = {
  piloto: 'PDF del piloto (D34)', comprobante: 'Comprobantes electrónicos', contrato: 'Contrato largo', escaneo: 'Escaneo',
  word: 'Word (.docx)', excel: 'Excel (.xlsx)', no_admitido: 'Sin texto que leer', hostil: 'Hostiles',
};

async function principal() {
  const sinBase = process.argv.includes('--sin-base');
  console.log('Generando los archivos ficticios…');
  const archivos = await crearArchivos();
  const carpeta = join(AQUI, '.archivos');
  await rm(carpeta, { recursive: true, force: true });
  await mkdir(carpeta, { recursive: true });
  const rutas = new Map<string, string>();
  for (const archivo of archivos) {
    const ruta = join(carpeta, `${archivo.clave}.${archivo.extension}`);
    await writeFile(ruta, archivo.contenido);
    rutas.set(archivo.clave, ruta);
  }
  const buscar = (prueba: (archivo: Archivo) => boolean) => archivos.find(prueba)!;
  const factura = buscar((archivo) => archivo.grupo === 'comprobante');

  console.log('Arranque en un proceso nuevo…');
  const arranque = enProcesoAparte(rutas.get(factura.clave)!, factura.mime);

  console.log(`Leyendo ${archivos.length} archivos, ${REPETICIONES} veces cada uno…`);
  await leerContenido(archivos[0]!.contenido, archivos[0]!.mime); // calienta pdf.js
  const resultados: Resultado[] = [];
  for (const archivo of archivos) {
    const tiempos: number[] = [];
    const cpus: number[] = [];
    let lectura: Lectura | undefined;
    for (let vez = 0; vez < REPETICIONES; vez++) {
      const cpuInicial = process.cpuUsage();
      const inicio = performance.now();
      lectura = await leerContenido(archivo.contenido, archivo.mime);
      tiempos.push(performance.now() - inicio);
      const cpu = process.cpuUsage(cpuInicial);
      cpus.push((cpu.user + cpu.system) / 1000);
    }
    resultados.push({ archivo, lectura: lectura!, ms: mediana(tiempos), cpuMs: mediana(cpus) });
  }

  console.log('Picos de memoria, cada archivo pesado en su propio proceso…');
  const pesados = archivos.filter((archivo) => archivo.grupo !== 'piloto' && archivo.grupo !== 'no_admitido'
    && (archivo.grupo !== 'comprobante' || archivo === factura));
  const picos = pesados.map((archivo) => ({ archivo, medida: enProcesoAparte(rutas.get(archivo.clave)!, archivo.mime) }));

  const leidos = resultados.filter((resultado) => resultado.lectura.estado === 'leido');
  const textoDe = (resultado: Resultado) => (resultado.lectura.estado === 'leido' ? resultado.lectura.texto : '');

  // TF-IDF: en cuántos documentos de la «empresa» aparece cada palabra.
  const apariciones = new Map<string, number>();
  for (const resultado of leidos) for (const clave of contarPalabras(textoDe(resultado)).keys()) apariciones.set(clave, (apariciones.get(clave) ?? 0) + 1);
  const rareza = (clave: string) => Math.log((1 + leidos.length) / (1 + (apariciones.get(clave) ?? 0))) + 1;

  let espacio: Awaited<ReturnType<typeof espacioEnLaBase>> | string;
  if (sinBase) {
    espacio = 'No se midió (`--sin-base`).';
  } else {
    console.log('Espacio en una base desechable…');
    try {
      espacio = await espacioEnLaBase(leidos.map((resultado) => ({ grupo: resultado.archivo.grupo, texto: textoDe(resultado) })));
    } catch (error) {
      espacio = `No se pudo medir: ${error instanceof Error ? error.message : error}`;
    }
  }

  const informe = escribirInforme({ archivos, resultados, arranque, picos, espacio, rareza, leidos });
  const destino = fileURLToPath(new URL('../../docs/evidencias/lectura-de-contenido.md', import.meta.url));
  await writeFile(destino, informe);
  console.log(`Informe en ${destino}`);
  const fallidos = resultados.filter((resultado) => !comoSeEsperaba(resultado));
  if (fallidos.length) {
    console.error(`Respuestas inesperadas: ${fallidos.map((r) => `${r.archivo.clave} (${describir(r.lectura)})`).join(', ')}`);
    process.exitCode = 1;
  }
}

interface DatosDelInforme {
  archivos: Archivo[];
  resultados: Resultado[];
  arranque: EnProcesoAparte;
  picos: { archivo: Archivo; medida: EnProcesoAparte }[];
  espacio: Awaited<ReturnType<typeof espacioEnLaBase>> | string;
  rareza: (clave: string) => number;
  leidos: Resultado[];
}

function escribirInforme({ archivos, resultados, arranque, picos, espacio, rareza, leidos }: DatosDelInforme): string {
  const ahora = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'long', timeStyle: 'short' });
  const piloto = resultados.filter((resultado) => resultado.archivo.grupo === 'piloto');
  const otros = resultados.filter((resultado) => resultado.archivo.grupo !== 'piloto');
  const calidades = new Map(resultados.map((resultado) => [resultado, calidad(resultado.archivo, resultado.lectura)]));
  const comoEsperado = resultados.filter(comoSeEsperaba).length;
  const recuperadasPiloto = piloto.map((resultado) => calidades.get(resultado)?.recuperadas ?? 0);
  const ajenasPiloto = piloto.flatMap((resultado) => calidades.get(resultado)?.ajenas ?? []);
  const textoDe = (resultado: Resultado) => (resultado.lectura.estado === 'leido' ? resultado.lectura.texto : '');
  const maximoCpu = Math.max(...resultados.map((resultado) => resultado.cpuMs));

  const filaDe = (resultado: Resultado) => {
    const q = calidades.get(resultado);
    return `| ${resultado.archivo.clave} | ${resultado.archivo.nombre} | ${tamano(resultado.archivo.contenido.length)} | ${describir(resultado.lectura)} | ${
      q ? porcentaje(q.recuperadas) : '—'} | ${ms(resultado.cpuMs)} | ${ms(resultado.cpuMs * FACTOR_RENDER)} | ${comoSeEsperaba(resultado) ? 'Sí' : '**No**'} |`;
  };

  const muestra = [
    ...leidos.filter((resultado) => resultado.archivo.grupo === 'comprobante').slice(0, 3),
    leidos.find((resultado) => resultado.archivo.grupo === 'comprobante' && resultado.archivo.nombre.startsWith('guía')),
    leidos.find((resultado) => resultado.archivo.grupo === 'piloto' && resultado.archivo.nombre.startsWith('Factura')),
    leidos.find((resultado) => resultado.archivo.grupo === 'piloto' && resultado.archivo.nombre.startsWith('Contrato')),
    ...leidos.filter((resultado) => ['contrato', 'word', 'excel'].includes(resultado.archivo.grupo)),
  ].filter((resultado, indice, todos): resultado is Resultado => resultado !== undefined && todos.indexOf(resultado) === indice);

  const ETIQUETAS = { ruc: 'RUC', comprobante: 'Comprobante', monto: 'Monto', fecha: 'Fecha' } as const;
  const palabras = muestra.map((resultado) => {
    const tf = palabrasClave(textoDe(resultado));
    const tfidf = palabrasClave(textoDe(resultado), rareza);
    const datos = tf.datos.map((dato) => `${ETIQUETAS[dato.tipo]} ${dato.valor}`).join(' · ') || '—';
    return `| ${resultado.archivo.nombre} | ${datos} | ${tf.frecuentes.join(', ')} | ${tfidf.frecuentes.join(', ')} |`;
  });

  const tablaDeEspacio = typeof espacio === 'string' ? espacio : [
    '| Grupo | Documentos | Caracteres (promedio) | Texto guardado | Índice de búsqueda (`tsvector`) | Por cada 1.000 documentos así |',
    '|---|---:|---:|---:|---:|---:|',
    ...espacio.map((fila) => `| ${NOMBRES_DE_GRUPO[fila.grupo]} | ${fila.documentos} | ${formato(fila.caracteres)} | ${formato(fila.texto / 1024, 1)} KB | ${
      formato(fila.vector / 1024, 1)} KB | ${megas((fila.texto + fila.vector) * 1000)} |`),
  ].join('\n');

  return `# Prueba aislada: leer el contenido de los documentos

Generado por \`npm run medir\` (\`experimentos/lectura-de-contenido/\`) el ${ahora}, hora de Lima, con Node ${process.version}.

**Pregunta.** ¿Puede la API leer el texto de los PDF, Word y Excel que se suben, y sacar sus palabras clave, sin
IA, sin OCR, sin mandar nada a terceros y dentro de Render gratuito (512 MB y 0,1 CPU)? Es el paso 1 de la
búsqueda en el contenido: no toca el sistema, ni producción, ni ninguna base real.

**Resultado:** ${comoEsperado} de ${resultados.length} archivos respondieron lo esperado. La lectura más lenta gastó
${ms(maximoCpu)} de CPU, unos ${ms(maximoCpu * FACTOR_RENDER)} estimados en Render. Cargar el lector suma
${megas(arranque.rssCargado - arranque.rssInicial)} de memoria, y el mayor pico de una lectura fue de
${megas(Math.max(...picos.map(({ medida }) => medida.pico - medida.rssBase)))}.

## Los archivos

${archivos.length} archivos ficticios (\`archivos.ts\`), que se generan iguales cada vez:

- **${piloto.length} PDF del piloto** (D34): una página, sin comprimir, con la fuente Helvetica.
- **${archivos.filter((a) => a.grupo === 'comprobante').length} comprobantes electrónicos** (facturas, boletas y una guía de remisión), como los de un
  sistema de facturación: comprimidos, con la fuente incrustada y el detalle en columnas.
- **Un contrato de ${(resultados.find((r) => r.archivo.grupo === 'contrato')?.lectura as { paginas?: { total: number } }).paginas?.total ?? '?'} páginas**, para ver dónde corta el lector.
- **Un escaneo de dos páginas** sin capa de texto, de ${megas(archivos.find((a) => a.grupo === 'escaneo')!.contenido.length)}, cerca del límite de subida de 10 MB.
- **Un Word y un Excel** generados sin Office, con lo que Word y Excel guardan por dentro: el texto partido en
  trozos, encabezados, tablas, textos comunes y celdas escritas en la hoja.
- **Lo que no tiene texto que leer:** una foto y un Word antiguo (.doc).
- **Lo que intenta romper el lector:** una bomba de compresión (un Word de
  ${tamano(archivos.find((a) => a.nombre.startsWith('Bomba'))!.contenido.length)} que se infla a 200 MB), un PDF cortado a la mitad, uno con contraseña y uno falso.

Los RUC tienen el dígito verificador mal a propósito: ninguno es el de una empresa real.

## Cómo se mide

- **Respuesta:** lo que devuelve \`leerContenido\` (\`leer.ts\`), el lector que entraría a la API: «leído» con su
  texto, «sin texto», «no se lee» o «ilegible» con el motivo. Nunca lanza un error: el documento se subiría igual.
- **Recuperación:** cuántas palabras de las que se escribieron en el archivo aparecen en el texto leído. Si el
  lector cortó el texto, se compara con el mismo largo del original.
- **CPU:** la mediana de ${REPETICIONES} lecturas en un proceso ya caliente; en Render, multiplicada por ${FACTOR_RENDER}
  porque tiene 0,1 CPU. Es una estimación, no una medición en Render.
- **Memoria:** cada archivo pesado se lee en un proceso nuevo, que informa su pico (\`maxRSS\`) frente a lo que
  ocupaba antes de leer.
- **Límites del lector:** ${formato(LIMITES.caracteres)} caracteres, ${LIMITES.paginas} páginas, ${formato(LIMITES.milisegundos / 1000)} s entre página y página y
  ${megas(LIMITES.bytesDeXml)} de XML descomprimido.

## Resultados

### Qué respondió con cada archivo

| # | Archivo | Tamaño | Respuesta | Recuperación | CPU | En Render (est.) | Lo esperado |
|---|---|---:|---|---:|---:|---:|---|
${otros.map(filaDe).join('\n')}

**Los ${piloto.length} PDF del piloto:** ${piloto.filter(comoSeEsperaba).length} de ${piloto.length} leídos; recuperación mínima ${porcentaje(Math.min(...recuperadasPiloto))} y mediana
${porcentaje(mediana(recuperadasPiloto))}; CPU mediana ${ms(mediana(piloto.map((r) => r.cpuMs)))} y máxima ${ms(Math.max(...piloto.map((r) => r.cpuMs)))}.

Palabras leídas que no estaban en el original (pegadas o partidas):
${[...otros, ...piloto].map((resultado) => ({ resultado, q: calidades.get(resultado) })).filter(({ q }) => q && q.ajenas.length)
    .map(({ resultado, q }) => `- ${resultado.archivo.nombre}: ${q!.ajenas.length} de ${q!.leidas} (${q!.ajenas.slice(0, 6).map((ficha) => `«${ficha}»`).join(', ')})`)
    .join('\n') || '- Ninguna.'}${ajenasPiloto.length ? '' : ''}

### Arranque y memoria

| Medida | Valor |
|---|---:|
| Memoria que suma cargar el lector (unpdf y pdf.js) | ${megas(arranque.rssCargado - arranque.rssInicial)} |
| Tiempo de carga del lector | ${ms(arranque.msCarga)} |
| Primera lectura de una factura tras cargar | ${ms(arranque.msLectura)} (CPU ${ms(arranque.cpuMs)}) |

Pico de memoria de cada lectura pesada, en su propio proceso:

| Archivo | Respuesta | Pico sobre lo ya cargado | Pico total del proceso |
|---|---|---:|---:|
${picos.map(({ archivo, medida }) => `| ${archivo.nombre} | ${medida.estado} | ${megas(Math.max(0, medida.pico - medida.rssBase))} | ${megas(medida.pico)} |`).join('\n')}

### Espacio en la base

Cada texto leído, guardado como lo guardaría el sistema: la columna de texto y su índice de búsqueda en español,
en un PostgreSQL 17 desechable.

${tablaDeEspacio}

### Palabras clave

Los datos que se reconocen por su forma y las palabras más repetidas, contadas solo en el documento (TF) o
pesando cuánto escasean en el resto (TF-IDF, con los ${leidos.length} documentos leídos como si fueran una empresa).

| Documento | Datos reconocidos | Más repetidas (TF) | Más repetidas y propias (TF-IDF) |
|---|---|---|---|
${palabras.join('\n')}

## Límites de la prueba

- Los archivos son ficticios y generados por programa. Los comprobantes imitan a los de un sistema de
  facturación, pero cada emisor arma su PDF a su manera: conviene repetir la medición con comprobantes reales
  del piloto, sin guardarlos, antes de confiar en la recuperación.
- El Word y el Excel se generaron sin Office: tienen la estructura de los reales, no todas sus variantes.
- El contrato largo repite siete cláusulas, así que la base lo comprime mucho más que a uno real: para estimar
  el espacio, conviene suponer de 2 a 3 veces lo medido en el texto guardado.
- Los tiempos de Render son una estimación (por ${FACTOR_RENDER}), no una medición.
- Los picos de memoria son de un proceso que solo lee; en la API se suman al resto de su trabajo.
`;
}

try {
  await principal();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
