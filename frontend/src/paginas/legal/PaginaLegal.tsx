import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { contacto } from '../../utilidades/contacto';

/** La fecha en que cambió el texto de los términos o de la privacidad: se actualiza junto con ellos. */
export const ULTIMA_ACTUALIZACION = '9 de octubre de 2026';

/**
 * El marco de los términos de uso y de la política de privacidad (D38): se leen con o sin sesión, en el
 * celular y en papel, con el contacto al pie para preguntar o ejercer un derecho.
 */
export function PaginaLegal({ titulo, introduccion, children }: { titulo: string; introduccion: string; children: ReactNode }) {
  const { correo } = contacto();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-superficie print:hidden">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <img src="/icono.svg" alt="" className="size-8" />
            Gestión documental
          </Link>
          <Link to="/" className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-marca-700 hover:bg-slate-100">
            <ArrowLeft aria-hidden className="size-4" />
            Volver
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold text-slate-900">{titulo}</h1>
        <p className="mt-2 text-sm text-slate-500">Última actualización: {ULTIMA_ACTUALIZACION}</p>
        <p className="mt-6 text-base text-slate-700">{introduccion}</p>
        {/* Los estilos de los títulos, párrafos y listas del texto, en un solo lugar. */}
        <div className="mt-8 space-y-8 text-base text-slate-700 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:mt-1.5 [&_p]:mt-3 [&_strong]:text-slate-900 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
          {children}
        </div>
      </main>

      <footer className="border-t border-slate-200 print:hidden">
        <nav aria-label="Información legal" className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-6 text-sm text-slate-600 sm:px-6">
          <Link to="/terminos" className="hover:text-marca-700 hover:underline">Términos de uso</Link>
          <Link to="/privacidad" className="hover:text-marca-700 hover:underline">Privacidad</Link>
          {correo && <a href={`mailto:${correo}`} className="hover:text-marca-700 hover:underline">Contacto: {correo}</a>}
        </nav>
      </footer>
    </div>
  );
}

/** Cómo escribir al responsable: el correo, si la plataforma lo tiene configurado. */
export function ComoEscribir() {
  const { correo } = contacto();
  return correo
    ? <>escribiendo a <a href={`mailto:${correo}`} className="font-medium text-marca-700 underline">{correo}</a></>
    : <>escribiendo al responsable por el medio indicado en el consentimiento que firmó</>;
}
