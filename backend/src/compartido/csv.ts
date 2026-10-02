// Excel solo reconoce un CSV como UTF-8 si empieza por esta marca; sin ella, las tildes salen rotas.
const BOM = '﻿';

function celda(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const texto = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

/** Un CSV según RFC 4180: comas, comillas dobles escapadas duplicándolas y saltos de línea CRLF. */
export function aCsv(encabezados: string[], filas: unknown[][]): string {
  return BOM + [encabezados, ...filas].map((fila) => fila.map(celda).join(',')).join('\r\n') + '\r\n';
}
