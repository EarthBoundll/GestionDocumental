export type Cambios = Record<string, { antes: unknown; despues: unknown }>;

/**
 * Lo que de verdad cambia entre el estado actual y el propuesto: es el «antes → después» que guarda el
 * historial. Un campo que no se envía, o que se envía con el mismo valor, no es un cambio.
 */
export function calcularCambios<T extends object>(actual: T, propuesto: Partial<T>): Cambios {
  const cambios: Cambios = {};
  for (const [campo, despues] of Object.entries(propuesto)) {
    const antes = (actual as Record<string, unknown>)[campo];
    if (despues !== undefined && despues !== antes) cambios[campo] = { antes, despues };
  }
  return cambios;
}

/** Los valores nuevos de unos cambios, listos para actualizar. */
export function valoresNuevos(cambios: Cambios): Record<string, unknown> {
  return Object.fromEntries(Object.entries(cambios).map(([campo, { despues }]) => [campo, despues]));
}
