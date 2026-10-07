// Excel solo reconoce un CSV como UTF-8 si empieza por esta marca; sin ella, las tildes salen rotas.
const BOM = '﻿';

/**
 * Un texto que empieza por =, +, -, @, un tabulador o un retorno, Excel lo toma por una fórmula: un
 * documento llamado «=HIPERVINCULO(…)» se ejecutaría al abrir el listado (inyección CSV). Con un
 * apóstrofo delante, Excel lo muestra tal cual. Solo a los textos: un número negativo sigue siendo número.
 */
const PARECE_FORMULA = /^[=+\-@\t\r]/;

function celda(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const texto = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
  const seguro = typeof valor === 'string' && PARECE_FORMULA.test(texto) ? `'${texto}` : texto;
  return /[",\r\n]/.test(seguro) ? `"${seguro.replaceAll('"', '""')}"` : seguro;
}

/** Un CSV según RFC 4180: comas, comillas dobles escapadas duplicándolas y saltos de línea CRLF. */
export function aCsv(encabezados: string[], filas: unknown[][]): string {
  return BOM + [encabezados, ...filas].map((fila) => fila.map(celda).join(',')).join('\r\n') + '\r\n';
}
