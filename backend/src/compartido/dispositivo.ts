const PATRON_MOVIL = /Mobi|Android|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini/i;

/**
 * ¿La petición viene de un móvil? Es el dato del indicador 5. Chrome y Edge lo declaran sin
 * ambigüedad en la cabecera Sec-CH-UA-Mobile; para el resto, como Safari, se mira el user-agent.
 */
export function esMovil(userAgent: string | null, pistaDelNavegador?: string): boolean {
  if (pistaDelNavegador === '?1') return true;
  if (pistaDelNavegador === '?0') return false;
  return userAgent !== null && PATRON_MOVIL.test(userAgent);
}
