/**
 * El contraste de WCAG 2.1 entre dos colores, y si el color de una empresa sirve para sus botones.
 * Las fórmulas son las de la norma: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

/** AA para texto normal: lo exige el texto blanco de los botones, y los enlaces sobre fondo blanco. */
export const CONTRASTE_MINIMO = 4.5;

function canalLineal(valor: number): number {
  const s = valor / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** La luminancia relativa de un color #rrggbb: 0 el negro, 1 el blanco. */
export function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((inicio) => canalLineal(Number.parseInt(hex.slice(inicio, inicio + 2), 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contraste(a: string, b: string): number {
  const [clara, oscura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (clara! + 0.05) / (oscura! + 0.05);
}

/**
 * Por qué un color no sirve como color de marca, o null si sirve. Ocupa el lugar de los botones (texto
 * blanco encima) y de los enlaces sobre fondo blanco: es el mismo contraste. En el modo oscuro los
 * enlaces usan el color mezclado con un 60 % de blanco, que por construcción supera 6:1 sobre el fondo
 * oscuro, así que no hace falta comprobarlo aparte.
 */
export function problemaDeColor(hex: string): string | null {
  const razon = contraste(hex, '#ffffff');
  if (razon >= CONTRASTE_MINIMO) return null;
  const legible = razon.toLocaleString('es-PE', { maximumFractionDigits: 1 });
  return `Con texto blanco encima se lee mal (${legible}:1; hace falta ${CONTRASTE_MINIMO.toLocaleString('es-PE')}:1). Elige un tono más oscuro`;
}
