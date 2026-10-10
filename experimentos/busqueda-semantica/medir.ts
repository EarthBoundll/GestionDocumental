/*
 * Prueba aislada de búsqueda semántica (D43, docs/12). Compara, con las mismas búsquedas sobre los mismos
 * documentos ficticios, la búsqueda de producción con la semántica de un modelo que corre en este proceso.
 * No toca producción ni ninguna base real: levanta un PostgreSQL desechable y lo borra al terminar.
 *
 *   npm run medir              mide todo y escribe docs/evidencias/busqueda-semantica.md
 *   npm run medir -- --sin-ia  solo la búsqueda actual, en la consola, sin escribir el informe
 */
import { writeFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { prepararBuscadoresActuales, PRIMEROS } from './buscador-actual.js';
import { cargarModelo, MODELO, prepararBuscadorSemantico, textoConContenido, textoDeMetadatos, type Recursos } from './buscador-semantico.js';
import { BUSQUEDAS, GRUPOS, type Busqueda, type Grupo } from './busquedas.js';
import { crearCorpus, type Documento } from './corpus.js';
import { medir, percentil, resumir } from './metricas.js';

const INFORME = fileURLToPath(new URL('../../docs/evidencias/busqueda-semantica.md', import.meta.url));
/** Render gratuito da 0,1 CPU: un trabajo de CPU tarda allí unas diez veces su tiempo de CPU. */
const CPU_DE_RENDER = 0.1;

const SISTEMAS = {
  A: 'La búsqueda actual (D42)',
  C: 'La actual, con el texto del archivo',
  B: 'Semántica, sobre el nombre, la categoría y la descripción',
  'B+': 'Semántica, además sobre el texto del archivo',
  'A→B': 'La actual y, solo si no encuentra nada, la semántica',
} as const;
type Sistema = keyof typeof SISTEMAS;

interface Fila {
  busqueda: Busqueda;
  resultados: Partial<Record<Sistema, string[]>>;
  similitudB?: number;
  similitudBMas?: number;
}

async function principal() {
  const { values: opciones } = parseArgs({ options: { 'sin-ia': { type: 'boolean', default: false } } });
  const corpus = crearCorpus();
  const actuales = await prepararBuscadoresActuales(corpus);
  try {
    const filas: Fila[] = [];
    for (const busqueda of BUSQUEDAS) {
      filas.push({ busqueda, resultados: { A: await actuales.actual.buscar(busqueda.texto), C: await actuales.conContenido.buscar(busqueda.texto) } });
    }
    if (opciones['sin-ia']) {
      mostrarEnConsola(filas, ['A', 'C']);
      return;
    }
    const recursos = await medirSemantica(filas, corpus);
    await writeFile(INFORME, informe(filas, recursos, corpus));
    mostrarEnConsola(filas, Object.keys(SISTEMAS) as Sistema[]);
    console.log(`\nInforme en ${INFORME}`);
  } finally {
    await actuales.cerrar();
  }
}

async function medirSemantica(filas: Fila[], documentos: Documento[]): Promise<Recursos> {
  const recursos: Partial<Recursos> = { cpuPorDocumentoMs: [], cpuPorBusquedaMs: [] };
  const extractor = await cargarModelo(recursos).catch((error: unknown) => {
    throw new Error(`No se pudo cargar ${MODELO}: ${error instanceof Error ? error.message : error}. ` +
      'Sin el modelo no hay medición de la IA, y el informe no se escribe a medias (npm run medir -- --sin-ia mide solo la actual).');
  });
  const semantica = await prepararBuscadorSemantico(extractor, documentos, textoDeMetadatos, recursos.cpuPorDocumentoMs);
  const conContenido = await prepararBuscadorSemantico(extractor, documentos, textoConContenido);
  for (const fila of filas) {
    const b = await semantica.buscar(fila.busqueda.texto, recursos.cpuPorBusquedaMs);
    const bMas = await conContenido.buscar(fila.busqueda.texto);
    fila.resultados.B = b.map(({ clave }) => clave);
    fila.resultados['B+'] = bMas.map(({ clave }) => clave);
    fila.resultados['A→B'] = fila.resultados.A!.length > 0 ? fila.resultados.A! : fila.resultados.B;
    fila.similitudB = b[0]?.similitud;
    fila.similitudBMas = bMas[0]?.similitud;
  }
  return recursos as Recursos;
}

const conRespuesta = (fila: Fila) => fila.busqueda.correctos.length > 0;
const delGrupo = (filas: Fila[], grupo: Grupo) => filas.filter((fila) => fila.busqueda.grupo === grupo);

function mostrarEnConsola(filas: Fila[], sistemas: Sistema[]) {
  for (const grupo of Object.keys(GRUPOS) as Grupo[]) {
    const deEste = delGrupo(filas, grupo);
    const celdas = sistemas.map((sistema) => `${sistema}: ${celdaDeGrupo(deEste, sistema)}`);
    console.log(`${GRUPOS[grupo].padEnd(32)} ${celdas.join('   ')}`);
  }
}

/** Con respuesta: en cuántas hubo un correcto entre los cinco primeros. Sin respuesta: cuántas devolvieron algo. */
function celdaDeGrupo(filas: Fila[], sistema: Sistema): string {
  if (filas.every((fila) => !conRespuesta(fila))) {
    return `${filas.filter((fila) => (fila.resultados[sistema]?.length ?? 0) > 0).length} de ${filas.length} devuelven algo`;
  }
  const { enLosCinco, busquedas } = resumir(filas.map((fila) => medir(fila.resultados[sistema] ?? [], fila.busqueda.correctos)));
  return `${enLosCinco} de ${busquedas}`;
}

// --- El informe ---

const formato = (numero: number, decimales = 0) => numero.toLocaleString('es-PE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
const ms = (valor: number) => `${formato(valor, valor < 10 ? 1 : 0)} ms`;
/** Una tabla en Markdown: las primeras columnas son texto, a la izquierda; las demás, cifras, a la derecha. */
const tabla = (cabecera: string[], filas: string[][], deTexto = 1) =>
  [`| ${cabecera.join(' | ')} |`, `|${cabecera.map((_, i) => (i < deTexto ? '---' : '---:')).join('|')}|`,
    ...filas.map((fila) => `| ${fila.join(' | ')} |`)].join('\n');
const sistemas = Object.keys(SISTEMAS) as Sistema[];
const gruposConRespuesta = (Object.keys(GRUPOS) as Grupo[]).filter((grupo) => grupo !== 'sinRespuesta');

function tablaPorGrupo(filas: Fila[], valor: (resumen: ReturnType<typeof resumir>) => string): string {
  const filasDeTabla = gruposConRespuesta.map((grupo) => {
    const deEste = delGrupo(filas, grupo);
    return [GRUPOS[grupo], String(deEste.length),
      ...sistemas.map((sistema) => valor(resumir(deEste.map((fila) => medir(fila.resultados[sistema]!, fila.busqueda.correctos)))))];
  });
  const todas = filas.filter(conRespuesta);
  filasDeTabla.push(['**Todas con respuesta**', String(todas.length),
    ...sistemas.map((sistema) => `**${valor(resumir(todas.map((fila) => medir(fila.resultados[sistema]!, fila.busqueda.correctos))))}**`)]);
  return tabla(['Grupo', 'Búsquedas', ...sistemas], filasDeTabla);
}

/** La posición del primer correcto entre los cinco primeros («1.º», «3.º» o «—»); sin respuesta, cuántos devolvió. */
function celdaDeBusqueda(fila: Fila, sistema: Sistema): string {
  const resultados = fila.resultados[sistema]!;
  if (!conRespuesta(fila)) return resultados.length === 0 ? 'nada ✓' : `${resultados.length} ✗`;
  const posicion = resultados.findIndex((clave) => fila.busqueda.correctos.includes(clave));
  return posicion < 0 ? '—' : `${posicion + 1}.º`;
}

function informe(filas: Fila[], recursos: Recursos, documentos: Documento[]): string {
  const ahora = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'long', timeStyle: 'short' });
  const sinRespuesta = delGrupo(filas, 'sinRespuesta');
  const aciertoB = filas.filter((fila) => conRespuesta(fila) && fila.busqueda.correctos.includes(fila.resultados.B![0]!));
  const minimoAcierto = aciertoB.length ? Math.min(...aciertoB.map((fila) => fila.similitudB!)) : Number.NaN;
  const maximoSinRespuesta = Math.max(...sinRespuesta.map((fila) => fila.similitudB!));
  const [procesador] = cpus();
  const resumenDe = (sistema: Sistema) => resumir(filas.filter(conRespuesta).map((fila) => medir(fila.resultados[sistema]!, fila.busqueda.correctos)));
  const conTexto = documentos.filter((documento) => documento.texto).length;

  return `# Prueba aislada: búsqueda semántica

Generado por \`npm run medir\` (\`experimentos/busqueda-semantica/\`) el ${ahora}, hora de Lima.

**Pregunta.** ¿La búsqueda semántica con un modelo que corre dentro de la API encuentra documentos que la
búsqueda actual (D42) no encuentra, y cabe en Render gratuito? Es la prueba de concepto aislada de
[12 · Búsqueda e IA §4](../12-busqueda-e-ia.md): no toca producción ni ninguna base real.

**Resultado, en las ${filas.filter(conRespuesta).length} búsquedas con respuesta correcta:** un documento correcto entre los cinco primeros en
${sistemas.map((sistema) => `${resumenDe(sistema).enLosCinco} con ${sistema}`).join(', ')}.
En las ${sinRespuesta.length} búsquedas sin respuesta correcta, devolvieron algo
${sistemas.map((sistema) => `${sinRespuesta.filter((fila) => fila.resultados[sistema]!.length > 0).length} con ${sistema}`).join(', ')}.

## Los datos

- ${documentos.length} documentos ficticios de un taller textil: los 40 del piloto (D34) y ${documentos.length - 40} de su administración
  (alquiler, luz, contador, impuestos, seguro, licencia, planilla…), de los que ${documentos.length - conTexto} son fotos sin texto.
- ${filas.length} búsquedas en seis grupos (\`busquedas.ts\`), cada una con los documentos que una persona aceptaría como
  respuesta. Las escribió quien conoce los documentos, lo que favorece a todos los buscadores por igual pero no
  reemplaza búsquedas de personas reales: el archivo se puede ampliar con las de otras personas.
- Ningún dato es real ni sale de esta máquina.

## Cómo se mide

| Buscador | Qué es |
|---|---|
${sistemas.map((sistema) => `| ${sistema} | ${SISTEMAS[sistema]} |`).join('\n')}

- **A y C** son la búsqueda de producción, con su código, sus migraciones y su RLS, en un PostgreSQL desechable;
  cada una es una empresa. En C el texto de cada archivo va en la descripción: así se vería la búsqueda en el
  contenido si se extrajera al subir (en producción iría con menos peso que la descripción).
- **B y B+** usan \`${MODELO}\` cuantizado a 8 bits, en este proceso: el nombre, la categoría y la descripción
  de cada documento (B), más el texto del archivo (B+), convertidos en vectores; cada búsqueda devuelve los cinco
  más parecidos. Sin umbral: siempre devuelve cinco.
- **A→B** muestra lo de A y, solo si A no encuentra nada, lo de B, como la pasada por parecido de D42.
- Se miran los **${PRIMEROS} primeros resultados**: lo que muestran las sugerencias y lo que se ve sin desplazarse
  en el celular.

## Resultados

Búsquedas con un correcto entre los cinco primeros:

${tablaPorGrupo(filas, (resumen) => `${resumen.enLosCinco} de ${resumen.busquedas}`)}

Búsquedas con un correcto en el primer lugar:

${tablaPorGrupo(filas, (resumen) => `${resumen.enElPrimero} de ${resumen.busquedas}`)}

Rango recíproco medio (MRR: 1 si el primer correcto está primero, 0,5 si está segundo… y 0 si no está entre los cinco):

${tablaPorGrupo(filas, (resumen) => formato(resumen.mrr, 2))}

### Sin respuesta correcta

Lo que devuelve cada buscador cuando no hay ningún documento que sirva. Devolver algo es un falso positivo.

${tabla(['Búsqueda', ...sistemas, 'Similitud del primero en B'],
  sinRespuesta.map((fila) => [`«${fila.busqueda.texto}»`, ...sistemas.map((sistema) => celdaDeBusqueda(fila, sistema)), formato(fila.similitudB!, 3)]))}

¿Un umbral de similitud separaría lo correcto de lo inventado? ${Number.isNaN(minimoAcierto)
    ? 'B no acertó ninguna búsqueda en el primer lugar, así que no hay con qué compararlo.'
    : `Cuando B acierta en el primer lugar, la similitud de ese primero va desde ${formato(minimoAcierto, 3)}; en las búsquedas sin
respuesta, la del primero llega a ${formato(maximoSinRespuesta, 3)}. ${maximoSinRespuesta < minimoAcierto
      ? 'Un umbral entre ambos valores las separa en estas búsquedas, aunque con tan pocas no se puede fijar con confianza.'
      : 'Los rangos se superponen: ningún umbral descarta todo lo inventado sin perder aciertos.'}`}

## Recursos

Medido en este equipo: ${procesador?.model ?? 'procesador desconocido'}, ${cpus().length} núcleos, ${formato(totalmem() / 1024 ** 3)} GB, Node ${process.version}.
El tiempo en Render se estima dividiendo el tiempo de CPU entre los ${formato(CPU_DE_RENDER, 1)} CPU del plan gratuito.

| Medida | Valor |
|---|---:|
| Modelo en disco | ${formato(recursos.disco / 1024 ** 2)} MB |
| Carga del modelo | ${ms(recursos.cargaMs)} |
| Memoria del proceso antes de cargarlo | ${formato(recursos.memoriaAntesMb)} MB |
| Memoria del proceso con el modelo cargado | ${formato(recursos.memoriaDespuesMb)} MB |
| **Memoria que suma el modelo** | **${formato(recursos.memoriaDespuesMb - recursos.memoriaAntesMb)} MB** |
| CPU por documento al subirlo (mediana / p95) | ${ms(percentil(recursos.cpuPorDocumentoMs, 50))} / ${ms(percentil(recursos.cpuPorDocumentoMs, 95))} |
| CPU por búsqueda (mediana / p95) | ${ms(percentil(recursos.cpuPorBusquedaMs, 50))} / ${ms(percentil(recursos.cpuPorBusquedaMs, 95))} |
| Estimado en Render por búsqueda (mediana / p95) | ${ms(percentil(recursos.cpuPorBusquedaMs, 50) / CPU_DE_RENDER)} / ${ms(percentil(recursos.cpuPorBusquedaMs, 95) / CPU_DE_RENDER)} |

Render gratuito tiene 512 MB de memoria para toda la API. Lo que la API usa hoy en producción se ve en las métricas de
Render; la memoria que suma el modelo se sumaría a eso.

## Cada búsqueda

La posición del primer documento correcto entre los cinco primeros («—» si no hay ninguno). En las búsquedas sin
respuesta, «nada ✓» o cuántos resultados devolvió.

${tabla(['Grupo', 'Búsqueda', 'Correctos', ...sistemas],
  filas.map((fila) => [GRUPOS[fila.busqueda.grupo], `«${fila.busqueda.texto}»`, fila.busqueda.correctos.join(', ') || '—',
    ...sistemas.map((sistema) => celdaDeBusqueda(fila, sistema))]), 3)}
`;
}

try {
  await principal();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
