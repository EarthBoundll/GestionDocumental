/** La fila de un INSERT … RETURNING o de una búsqueda que debe existir: si no llega, es un error del programa. */
export function primeraFila<T>(filas: T[]): T {
  const fila = filas[0];
  if (fila === undefined) throw new Error('La sentencia no devolvió ninguna fila');
  return fila;
}
