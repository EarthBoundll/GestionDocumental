import { History, Search, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import oficinaAncha from '../../assets/acceso/oficina-1408.webp';
import oficinaAngosta from '../../assets/acceso/oficina-800.webp';

const VENTAJAS = [
  { icono: Search, texto: 'Un documento se encuentra en segundos, sin importar tildes ni mayúsculas' },
  { icono: ShieldCheck, texto: 'Cada empresa ve solo lo suyo, y cada persona, lo que le corresponde' },
  { icono: History, texto: 'Cada acción queda en un historial que nadie puede modificar' },
];

/**
 * El marco de iniciar sesión, recuperar y restablecer la contraseña (D37): la imagen y el mensaje ocupan la
 * mayor parte, y el formulario va a la derecha. En el celular la imagen es una franja arriba, para que el
 * formulario quede a la vista sin desplazarse.
 *
 * Los colores de la imagen van fijos (negro y blanco), no de la escala slate: el modo oscuro la invierte, y
 * el texto sobre la foto tiene que leerse igual en los dos temas.
 */
export function PantallaDeAcceso({ titulo, subtitulo, children, pie }: { titulo: string; subtitulo: string; children: ReactNode; pie: ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1.6fr)_minmax(26rem,1fr)]">
      <section className="relative isolate flex min-h-52 overflow-hidden bg-[#0b1220] text-white sm:min-h-64 lg:min-h-dvh">
        <img
          src={oficinaAncha}
          srcSet={`${oficinaAngosta} 800w, ${oficinaAncha} 1408w`}
          sizes="(min-width: 1024px) 62vw, 100vw"
          alt=""
          fetchPriority="high"
          className="absolute inset-0 -z-10 size-full object-cover motion-safe:animate-acercar"
        />
        <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/45 to-black/10 lg:bg-linear-to-tr lg:via-black/35" />
        <div className="mt-auto w-full p-5 sm:p-8 lg:p-14">
          <p className="flex items-center gap-2 text-sm font-semibold motion-safe:animate-subir">
            <img src="/icono.svg" alt="" className="size-8 rounded-lg bg-white p-1" />
            Gestión documental
          </p>
          <p className="mt-3 max-w-xl text-2xl leading-tight font-bold text-balance sm:text-3xl lg:mt-6 lg:text-5xl motion-safe:animate-subir motion-safe:[animation-delay:120ms]">
            Los documentos de tu empresa, en orden y a la mano
          </p>
          <p className="mt-4 hidden max-w-lg text-base text-white/85 sm:block lg:text-lg motion-safe:animate-subir motion-safe:[animation-delay:240ms]">
            Súbelos, encuéntralos y apruébalos desde la oficina o desde el celular, en la nube.
          </p>
          <ul className="mt-8 hidden max-w-lg space-y-3 lg:block">
            {VENTAJAS.map(({ icono: Icono, texto }, indice) => (
              <li key={texto} className="flex items-start gap-3 text-sm text-white/90 motion-safe:animate-subir" style={{ animationDelay: `${360 + indice * 120}ms` }}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25 backdrop-blur">
                  <Icono aria-hidden className="size-4" />
                </span>
                <span className="pt-1.5">{texto}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="flex flex-col justify-center px-4 py-8 sm:px-10 lg:py-12">
        <div className="mx-auto w-full max-w-sm motion-safe:animate-desde-derecha motion-safe:[animation-delay:150ms]">
          <h1 className="text-2xl font-semibold text-slate-900">{titulo}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitulo}</p>
          <div className="mt-6 rounded-xl bg-superficie p-6 shadow-xs ring-1 ring-slate-200 sm:p-8">{children}</div>
          <p className="mt-6 text-center text-sm text-slate-600">{pie}</p>
        </div>
      </div>
    </main>
  );
}
