import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/**
 * Escribe docs/evidencias/pruebas-funcionales.md: cada caso con el requisito que prueba, su resultado en el
 * escritorio y en el celular, y qué requisitos de docs/01-analisis.md §3 quedaron sin caso.
 */
const DESTINO = fileURLToPath(new URL('../../docs/evidencias/pruebas-funcionales.md', import.meta.url));
const REQUISITOS = Array.from({ length: 33 }, (_, i) => `RF${String(i + 1).padStart(2, '0')}`);

interface Fila {
  requisitos: string[];
  caso: string;
  resultados: Map<string, { estado: TestResult['status']; ms: number }>;
}

export default class InformeFuncional implements Reporter {
  readonly #filas = new Map<string, Fila>();

  onTestEnd(prueba: TestCase, resultado: TestResult) {
    // Las etiquetas (@movil, @demo) eligen dónde y cuándo corre un caso; no son parte de su nombre.
    const titulo = prueba.title.replace(/\s*@\w+/g, '');
    const [, codigos = '', caso = titulo] = /^([A-Z0-9, ]+?) · (.+)$/.exec(titulo) ?? [];
    const fila = this.#filas.get(titulo) ?? { requisitos: codigos.split(',').map((c) => c.trim()).filter(Boolean), caso, resultados: new Map() };
    fila.resultados.set(prueba.parent.project()?.name ?? '', { estado: resultado.status, ms: resultado.duration });
    this.#filas.set(titulo, fila);
  }

  onEnd(resultado: FullResult) {
    // El modo demostración corre solo el guion de la sustentación: no debe pisar el informe completo.
    if (process.env.npm_lifecycle_event === 'pruebas:demo') return;
    const filas = [...this.#filas.values()].sort((a, b) => (a.requisitos[0] ?? '').localeCompare(b.requisitos[0] ?? ''));
    const ejecuciones = filas.flatMap((fila) => [...fila.resultados.values()]);
    const superadas = ejecuciones.filter((r) => r.estado === 'passed').length;
    const cubiertos = new Set(filas.flatMap((fila) => fila.requisitos));
    const sinCaso = REQUISITOS.filter((requisito) => !cubiertos.has(requisito));
    const celda = (fila: Fila, proyecto: string) => {
      const r = fila.resultados.get(proyecto);
      if (!r) return '—';
      return `${r.estado === 'passed' ? 'Superado' : r.estado === 'skipped' ? 'Omitido' : '**Fallido**'} (${(r.ms / 1000).toFixed(1)} s)`;
    };
    const fecha = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'long', timeStyle: 'short' });

    const texto = `# Informe de pruebas funcionales

Generado el ${fecha} (hora de Lima) por \`npm run pruebas:funcionales\` en \`frontend/\`.

Cada caso recorre un requisito de [01 · Análisis §3](../01-analisis.md) en un navegador Chromium real, como lo haría
una persona: escribe en los formularios, pulsa los botones y comprueba lo que aparece en pantalla. Del otro lado está el
sistema completo: la API con un PostgreSQL 17 propio y vacío al empezar, y la compilación de producción del frontend.
Los casos marcados para el celular se repiten en una pantalla de 360 px (indicador 5). Los datos de partida de cada caso
(su empresa, sus usuarios) se crean por la API, y cada caso usa una empresa propia.

**Resultado: ${superadas} de ${ejecuciones.length} ejecuciones superadas (${filas.length} casos${resultado.status === 'passed' ? '' : `; estado final: ${resultado.status}`}).**
${sinCaso.length ? `\n**Requisitos sin caso:** ${sinCaso.join(', ')}.\n` : `\nLos ${REQUISITOS.length} requisitos funcionales tienen al menos un caso.\n`}
| Requisito | Caso | Escritorio (1280 px) | Celular (360 px) |
|---|---|---|---|
${filas.map((fila) => `| ${fila.requisitos.join(', ')} | ${fila.caso} | ${celda(fila, 'escritorio')} | ${celda(fila, 'celular')} |`).join('\n')}

## Cobertura por requisito

| Requisito | Casos |
|---|---|
${REQUISITOS.map((requisito) => `| ${requisito} | ${filas.filter((fila) => fila.requisitos.includes(requisito)).length} |`).join('\n')}
`;
    mkdirSync(dirname(DESTINO), { recursive: true });
    writeFileSync(DESTINO, texto);
    console.log(`\nInforme escrito en ${DESTINO}`);
  }
}
