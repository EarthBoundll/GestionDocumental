import { CircleCheck, FileText, History, Search, ShieldCheck, Smartphone } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import oficinaAncha from '../../assets/acceso/oficina-1408.webp';
import oficinaAngosta from '../../assets/acceso/oficina-800.webp';
import { contacto, correoParaSolicitarCuenta, whatsappParaSolicitarCuenta } from '../../utilidades/contacto';

const VENTAJAS = [
  { icono: Search, texto: 'Un documento se encuentra en segundos, sin importar tildes ni mayúsculas' },
  { icono: ShieldCheck, texto: 'Cada empresa ve solo lo suyo, y cada persona, lo que le corresponde' },
  { icono: History, texto: 'Cada acción queda en un historial que nadie puede modificar' },
];

/** Las que rotan en el titular. La primera se repite al final para que la vuelta no se note (estilos.css). */
const PALABRAS = ['documentos,', 'facturas,', 'contratos,', 'guías,', 'planillas,'];

/**
 * El marco de iniciar sesión, recuperar y restablecer la contraseña (D37, D40): la imagen y el mensaje ocupan la
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
        <Aurora />
        <TarjetasDeMuestra />

        <div className="mt-auto w-full p-5 sm:p-8 lg:p-14">
          <p className="flex items-center gap-2 text-sm font-semibold motion-safe:animate-enfocar">
            <img src="/icono.svg" alt="" className="size-8 rounded-lg bg-white p-1" />
            Gestión documental
          </p>
          <Titular />
          <p className="mt-4 hidden max-w-lg text-base text-white/85 sm:block lg:text-lg motion-safe:animate-enfocar motion-safe:[animation-delay:260ms]">
            Súbelos, encuéntralos y apruébalos desde la oficina o desde el celular, en la nube.
          </p>
          <ul className="mt-8 hidden max-w-lg space-y-3 lg:block">
            {VENTAJAS.map(({ icono: Icono, texto }, indice) => (
              <li key={texto} className="flex items-start gap-3 text-sm text-white/90 motion-safe:animate-subir" style={{ animationDelay: `${400 + indice * 120}ms` }}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25 backdrop-blur">
                  <Icono aria-hidden className="size-4" />
                </span>
                <span className="pt-1.5">{texto}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="relative isolate flex flex-col justify-center overflow-hidden px-4 py-8 sm:px-10 lg:py-12">
        <div aria-hidden className="fondo-de-puntos pointer-events-none absolute inset-0 -z-10" />
        <div className="mx-auto w-full max-w-sm motion-safe:animate-desde-derecha motion-safe:[animation-delay:150ms]">
          <h1 className="text-2xl font-semibold text-slate-900">{titulo}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitulo}</p>
          {/* Una línea de luz del color de la marca sobre el borde de arriba de la tarjeta. */}
          <div className="formulario-escalonado relative mt-6 rounded-2xl bg-superficie p-6 shadow-xl shadow-slate-900/5 ring-1 ring-slate-200 before:absolute before:inset-x-10 before:-top-px before:h-px before:bg-linear-to-r before:from-transparent before:via-marca-500 before:to-transparent sm:p-8">
            {children}
          </div>
          <p className="mt-6 text-center text-sm text-slate-600">{pie}</p>
          <PieDeAcceso />
        </div>
      </div>
    </main>
  );
}

/**
 * «Tus documentos, en orden y a la mano», con la palabra cambiando: facturas, contratos, guías… Lo que se lee
 * con un lector de pantalla es la frase entera y quieta; con «reducir movimiento» se queda en «documentos».
 */
function Titular() {
  return (
    <p className="mt-3 max-w-xl text-2xl leading-tight font-bold sm:text-3xl lg:mt-6 lg:text-5xl motion-safe:animate-enfocar motion-safe:[animation-delay:120ms]">
      <span className="sr-only">Los documentos de tu empresa, en orden y a la mano</span>
      <span aria-hidden className="block">
        Tus{' '}
        <span data-testid="palabras-que-rotan" className="inline-flex h-[1.25em] overflow-hidden align-bottom">
          <span className="flex flex-col motion-safe:animate-palabras">
            {[...PALABRAS, PALABRAS[0]].map((palabra, indice) => (
              <span key={indice} className="block h-[1.25em] bg-linear-to-r from-teal-300 via-cyan-200 to-sky-300 bg-clip-text leading-[1.25] text-transparent">
                {palabra}
              </span>
            ))}
          </span>
        </span>
      </span>
      <span aria-hidden className="block">en orden y a la mano</span>
    </p>
  );
}

/**
 * Tres halos de color que se desplazan despacio sobre la foto. Son degradados que solo se trasladan: el
 * navegador los mueve sin volver a dibujarlos, también en un celular.
 */
function Aurora() {
  return (
    <div aria-hidden data-testid="aurora" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <span className="absolute -top-1/3 -left-1/4 size-[75%] rounded-full bg-[radial-gradient(closest-side,rgb(20_184_166/0.45),transparent)] motion-safe:animate-aurora" />
      <span className="absolute top-1/4 -right-1/4 size-[65%] rounded-full bg-[radial-gradient(closest-side,rgb(56_189_248/0.32),transparent)] motion-safe:animate-aurora motion-safe:[animation-delay:-8s] motion-safe:[animation-duration:28s]" />
      <span className="absolute -bottom-1/3 left-1/4 size-[60%] rounded-full bg-[radial-gradient(closest-side,rgb(99_102_241/0.28),transparent)] motion-safe:animate-aurora motion-safe:[animation-delay:-15s] motion-safe:[animation-duration:32s]" />
    </div>
  );
}

/** Vidrio oscuro y fijo (negro, no slate, que el modo oscuro invierte): el texto blanco se lee sobre cualquier parte de la foto. */
const VIDRIO = 'rounded-2xl bg-black/45 p-4 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-md';

/**
 * Lo que hace el sistema, en tres tarjetas de vidrio que flotan: un documento aprobado, una búsqueda y un
 * asiento del historial. Datos inventados, como los documentos de prueba (D34). Solo en pantallas anchas y
 * altas (estilos.css): en una laptop pequeña taparían el mensaje.
 */
function TarjetasDeMuestra() {
  return (
    <div aria-hidden data-testid="tarjetas-de-muestra" className="tarjetas-de-muestra pointer-events-none absolute top-[10%] right-[6%] w-84 flex-col gap-4">
      <div className="motion-safe:animate-enfocar motion-safe:[animation-delay:700ms]">
        <div className={`${VIDRIO} flex items-center gap-3 motion-safe:animate-flotar`}>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15"><FileText className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Factura F001-0245</p>
            <p className="text-xs text-white/75">Contabilidad · PDF</p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-emerald-400/20 px-2 py-1 text-xs font-medium text-[#a7f3d0] ring-1 ring-emerald-300/30">
            <CircleCheck className="size-3.5" /> Aprobada
          </span>
        </div>
      </div>
      <div className="-ml-10 motion-safe:animate-enfocar motion-safe:[animation-delay:880ms]">
        <div className={`${VIDRIO} motion-safe:animate-flotar motion-safe:[animation-delay:-2.5s]`}>
          <p className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm">
            <Search className="size-4 text-white/70" /> remision<span className="h-4 w-px bg-white/80 motion-safe:animate-pulse" />
          </p>
          <p className="mt-2 text-xs text-white/75">3 resultados en 0,3 s, sin importar tildes</p>
        </div>
      </div>
      <div className="motion-safe:animate-enfocar motion-safe:[animation-delay:1060ms]">
        <div className={`${VIDRIO} flex items-start gap-3 motion-safe:animate-flotar motion-safe:[animation-delay:-5s]`}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-500/80 text-xs font-semibold">AT</span>
          <div className="min-w-0">
            <p className="text-sm"><span className="font-semibold">Ana</span> subió «Guía de remisión 0098»</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-white/75"><Smartphone className="size-3.5" /> hace 2 min, desde el celular</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Lo que una empresa que aún no usa el sistema necesita (D38): cómo pedir su cuenta, ya que no hay registro
 * público, y los términos y la privacidad, que se leen antes de entrar.
 */
function PieDeAcceso() {
  const { correo, whatsapp } = contacto();
  return (
    <footer className="mt-8 border-t border-slate-200 pt-6 text-center">
      {correo && (
        <p className="text-sm text-slate-600">
          ¿Tu empresa aún no usa el sistema?{' '}
          <a href={correoParaSolicitarCuenta(correo)} className="font-medium text-marca-700 hover:underline">Solicita una cuenta</a>
          {whatsapp && <> o <a href={whatsappParaSolicitarCuenta(whatsapp)} target="_blank" rel="noopener noreferrer" className="font-medium text-marca-700 hover:underline">escríbenos por WhatsApp</a></>}
        </p>
      )}
      <nav aria-label="Información legal" className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <Link to="/terminos" className="py-1 hover:text-marca-700 hover:underline">Términos de uso</Link>
        <Link to="/privacidad" className="py-1 hover:text-marca-700 hover:underline">Privacidad</Link>
        {correo && <a href={`mailto:${correo}`} className="py-1 hover:text-marca-700 hover:underline">Contacto</a>}
      </nav>
      <p className="mt-2 text-xs text-slate-400">Proyecto de tesis · Universidad Privada del Norte, 2026</p>
    </footer>
  );
}
