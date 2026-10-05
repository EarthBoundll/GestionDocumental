/**
 * El contraste de WCAG 2.1, el mismo que valida la API (identidad.color.ts). Aquí sirve para avisar
 * mientras se elige el color, antes de guardar; quien decide sigue siendo la API.
 */

export const CONTRASTE_MINIMO = 4.5;

export const esColorHex = (valor: string): boolean => /^#[0-9a-f]{6}$/i.test(valor);

function canalLineal(valor: number): number {
  const s = valor / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminancia(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((inicio) => canalLineal(Number.parseInt(hex.slice(inicio, inicio + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Cuánto se lee el texto blanco sobre el color: 21 sobre negro, 1 sobre blanco. */
export function contrasteConBlanco(hex: string): number {
  return 1.05 / (luminancia(hex) + 0.05);
}
