/**
 * La cláusula SET de un UPDATE con solo los campos indicados. Los nombres de columna salen de
 * `columnas`, una tabla fija del repositorio, nunca de la petición: así no hay forma de inyectar SQL.
 */
export function clausulaSet(
  valores: Record<string, unknown>,
  columnas: Record<string, string>,
  primerParametro: number,
): { sql: string; parametros: unknown[] } {
  const entradas = Object.entries(valores);
  const asignaciones = entradas.map(([campo], posicion) => {
    const columna = columnas[campo];
    if (!columna) throw new Error(`El campo «${campo}» no se puede actualizar`);
    return `${columna} = $${primerParametro + posicion}`;
  });
  return { sql: asignaciones.join(', '), parametros: entradas.map(([, valor]) => valor) };
}
