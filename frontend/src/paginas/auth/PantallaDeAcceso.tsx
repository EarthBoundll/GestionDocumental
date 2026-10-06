import type { ReactNode } from 'react';

/** El marco de iniciar sesión y registrarse: centrado, sin barra lateral, cómodo en un celular. */
export function PantallaDeAcceso({ titulo, subtitulo, children, pie }: { titulo: string; subtitulo: string; children: ReactNode; pie: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/icono.svg" alt="" className="size-12" />
          <h1 className="mt-4 text-2xl font-semibold text-slate-900">{titulo}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitulo}</p>
        </div>
        <div className="rounded-xl bg-superficie p-6 shadow-xs ring-1 ring-slate-200 sm:p-8">{children}</div>
        <p className="mt-6 text-center text-sm text-slate-600">{pie}</p>
      </div>
    </main>
  );
}
