import { CircleUser, LogOut, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useSesion } from '../sesion/SesionContext';
import { inicioDe, NOMBRES_DE_ROLES } from '../utilidades/roles';
import { Campana } from './Campana';
import { Navegacion } from './Navegacion';

/** El icono, el producto y la empresa. En la barra del celular no cabe todo: queda la empresa, que es lo que orienta. */
function Marca({ compacta = false }: { compacta?: boolean }) {
  const { sesion } = useSesion();
  const empresa = sesion?.empresa?.nombre ?? 'Administración de la plataforma';
  return (
    <Link to={sesion ? inicioDe(sesion.usuario.rol) : '/'} className="flex min-w-0 items-center gap-3 rounded-lg px-1">
      <img src="/icono.svg" alt="" className={`shrink-0 ${compacta ? 'size-8' : 'size-9'}`} />
      {compacta ? (
        <p className="truncate text-sm font-semibold text-slate-900">{empresa}</p>
      ) : (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">Gestión documental</p>
          <p className="truncate text-xs text-slate-500">{empresa}</p>
        </div>
      )}
    </Link>
  );
}

function MenuDeUsuario() {
  const { sesion, cerrar } = useSesion();
  if (!sesion) return null;
  return (
    <div className="flex items-center gap-1">
      <Link to="/cuenta" className="hidden items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-100 sm:flex">
        <CircleUser aria-hidden className="size-5 text-slate-500" />
        <span className="max-w-40 truncate font-medium text-slate-700">{sesion.usuario.nombre}</span>
        <span className="text-xs text-slate-500">{NOMBRES_DE_ROLES[sesion.usuario.rol]}</span>
      </Link>
      <button type="button" onClick={() => void cerrar()} className="rounded-lg p-2.5 text-slate-600 hover:bg-slate-100" aria-label="Cerrar sesión" title="Cerrar sesión">
        <LogOut aria-hidden className="size-5" />
      </button>
    </div>
  );
}

/** El marco de todas las pantallas con sesión: barra lateral en escritorio, menú desplegable en el celular. */
export function Layout() {
  const { esMaster } = useSesion();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const ubicacion = useLocation();

  // Al navegar desde el menú del celular, el menú se cierra solo.
  useEffect(() => setMenuAbierto(false), [ubicacion.pathname]);

  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2">
        Saltar al contenido
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-6 border-r border-slate-200 bg-white px-4 py-5 lg:flex">
        <Marca />
        <Navegacion />
        <Link to="/cuenta" className="mt-auto rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Mi cuenta</Link>
      </aside>

      {menuAbierto && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <button type="button" aria-label="Cerrar el menú" className="absolute inset-0 bg-slate-900/40" onClick={() => setMenuAbierto(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 overflow-y-auto bg-white px-4 py-5 shadow-xl">
            <div className="flex items-center justify-between">
              <Marca />
              <button type="button" onClick={() => setMenuAbierto(false)} aria-label="Cerrar el menú" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <Navegacion alNavegar={() => setMenuAbierto(false)} />
            <Link to="/cuenta" className="mt-auto rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Mi cuenta</Link>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
        <button type="button" onClick={() => setMenuAbierto(true)} aria-label="Abrir el menú" className="-ml-1 rounded-lg p-2.5 text-slate-600 hover:bg-slate-100 lg:hidden">
          <Menu aria-hidden className="size-5" />
        </button>
        <div className="min-w-0 flex-1 lg:hidden">
          <Marca compacta />
        </div>
        <div className="ml-auto flex items-center gap-1">
          {/* El Master no tiene notificaciones: son de las solicitudes de una empresa. */}
          {!esMaster && <Campana />}
          <MenuDeUsuario />
        </div>
      </header>

      <main id="contenido" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
