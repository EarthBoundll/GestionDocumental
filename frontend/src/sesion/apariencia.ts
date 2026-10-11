import type { Esquinas, EstiloDeZona, TamanoDeTexto, Tema } from '../api/tipos';

const OSCURO = '(prefers-color-scheme: dark)';
/** El verde azulado del icono, el de estilos.css e index.html: el de las empresas que no eligen otro. */
export const COLOR_DE_LA_PLATAFORMA = '#0f766e';

/** El estilo de una empresa (D47): el menú, la barra de arriba y las esquinas. */
export interface Estilo {
  estiloMenu: EstiloDeZona;
  estiloBarra: EstiloDeZona;
  esquinas: Esquinas;
}

/** El de las empresas que no eligen otro: el de siempre. */
export const ESTILO_DE_LA_PLATAFORMA: Estilo = { estiloMenu: 'claro', estiloBarra: 'claro', esquinas: 'suaves' };

const consultaOscuro = (): MediaQueryList | null => (typeof window.matchMedia === 'function' ? window.matchMedia(OSCURO) : null);

/**
 * Pone el tema en <html data-tema>, que es lo que lee estilos.css. «sistema» se resuelve aquí y se sigue
 * mientras dure: si el celular pasa a modo oscuro al anochecer, la pantalla también. Devuelve cómo dejar de seguirlo.
 */
export function aplicarTema(tema: Tema): () => void {
  const raiz = document.documentElement;
  const consulta = tema === 'sistema' ? consultaOscuro() : null;
  const poner = () => {
    raiz.dataset.tema = tema === 'sistema' ? (consulta?.matches ? 'oscuro' : 'claro') : tema;
  };
  poner();
  consulta?.addEventListener('change', poner);
  return () => consulta?.removeEventListener('change', poner);
}

/**
 * El color de fondo de la empresa: estilos.css toma su tono y fija la claridad, clara u oscura según el tema
 * (D39). Sin color, el gris neutro de siempre.
 */
export function aplicarFondo(color: string | null): void {
  const raiz = document.documentElement;
  if (color) raiz.style.setProperty('--fondo', color);
  else raiz.style.removeProperty('--fondo');
}

/** El color de la empresa en toda la interfaz (estilos.css deriva de él los demás tonos); sin color, el de la plataforma. */
export function aplicarColor(color: string | null): void {
  const raiz = document.documentElement;
  if (color) raiz.style.setProperty('--marca', color);
  else raiz.style.removeProperty('--marca');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color ?? COLOR_DE_LA_PLATAFORMA);
}

/** El estilo de la empresa (D47): estilos.css lo lee de <html data-menu data-barra data-esquinas>. Solo opciones cerradas. */
export function aplicarEstilo({ estiloMenu, estiloBarra, esquinas }: Estilo): void {
  const { dataset } = document.documentElement;
  dataset.menu = estiloMenu;
  dataset.barra = estiloBarra;
  dataset.esquinas = esquinas;
}

/** El tamaño del texto de la persona (D47), en <html data-texto>: estilos.css agranda la letra de la página. */
export function aplicarTamanoDeTexto(tamano: TamanoDeTexto): void {
  document.documentElement.dataset.texto = tamano;
}

/** Un enlace dentro de url("…") de CSS. Ya viene codificado (lleva su firma): solo se escapa lo que cerraría la cadena. */
export const urlDeCss = (url: string): string => `url("${url.replace(/["\\\n]/g, encodeURIComponent)}")`;
