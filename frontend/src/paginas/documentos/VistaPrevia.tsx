import { ExternalLink, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Boton } from '../../componentes/Boton';
import { Tarjeta } from '../../componentes/Pagina';

const IMAGENES = ['image/png', 'image/jpeg'];

/**
 * Si este navegador puede mostrar el archivo dentro de la página. Las imágenes, siempre; un PDF, solo con
 * visor propio: Chrome en Android no lo tiene (`pdfViewerEnabled` es falso) y un PDF incrustado se
 * descargaría. Word y Excel no se previsualizan: haría falta un servicio externo que lea el documento.
 */
export function sePuedePrevisualizar(tipoMime: string): boolean {
  if (IMAGENES.includes(tipoMime)) return true;
  return tipoMime === 'application/pdf' && (navigator.pdfViewerEnabled ?? true);
}

interface Props {
  nombre: string;
  tipoMime: string;
  /** El enlace firmado de «Ver»: pedirlo ya dejó el asiento DOCUMENTO_VISUALIZADO. */
  url: string;
  alCerrar(): void;
}

/** RF33: el archivo dentro de la ficha. Sustituye a abrir otra pestaña, no al documento completo. */
export function VistaPrevia({ nombre, tipoMime, url, alCerrar }: Props) {
  const titulo = useRef<HTMLHeadingElement>(null);

  // Se lleva a la vista y recibe el foco: en el celular aparece debajo de los botones, fuera de la pantalla.
  // A mano y no con scrollIntoView: la tarjeta recorta su contenido (overflow-hidden), y Chrome aplica el
  // margen dentro de ella; la vista quedaba debajo de la barra superior fija.
  useEffect(() => {
    const elemento = titulo.current;
    if (!elemento) return;
    const barra = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
    const sinAnimaciones = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: elemento.getBoundingClientRect().top + window.scrollY - barra - 16, behavior: sinAnimaciones ? 'auto' : 'smooth' });
    elemento.focus({ preventScroll: true });
  }, [url]);

  return (
    <Tarjeta className="mb-4 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2">
        <h2 ref={titulo} tabIndex={-1} className="min-w-0 flex-1 font-semibold text-slate-900 outline-none">Vista previa</h2>
        {/* El mismo enlace, sin pedir otro: abrirlo en una pestaña no es una segunda consulta. */}
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-marca-700 hover:underline">
          <ExternalLink aria-hidden className="size-4" />
          {/* En 360 px el texto largo cortaba el título. */}
          <span className="sm:hidden">Abrir</span><span className="hidden sm:inline">Abrir en otra pestaña</span>
        </a>
        <Boton variante="fantasma" tamano="pequeno" icono={X} onClick={alCerrar} aria-label="Cerrar la vista previa" />
      </div>
      {IMAGENES.includes(tipoMime) ? (
        <div className="flex justify-center bg-slate-100 p-2 sm:p-4">
          <img src={url} alt={nombre} referrerPolicy="no-referrer" className="max-h-[75vh] max-w-full rounded object-contain" />
        </div>
      ) : (
        // Sin sandbox: el visor de PDF del navegador no funciona en un marco aislado. El archivo viene de otro
        // dominio (el almacenamiento), así que de todos modos no puede tocar esta página.
        <iframe src={url} title={`Vista previa de ${nombre}`} referrerPolicy="no-referrer" className="block h-[75vh] min-h-96 w-full bg-slate-100" />
      )}
      <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
        El enlace vale 5 minutos. Si no ves el documento completo (en el iPhone el visor muestra solo la primera página), ábrelo en otra pestaña.
      </p>
    </Tarjeta>
  );
}
