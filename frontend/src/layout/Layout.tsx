import { CircleUser, LogOut, Menu, X } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Link, Outlet, useLocation } from 'react-router';
import { Boton } from '../componentes/Boton';
import { Modal } from '../componentes/Modal';
import { urlDeCss } from '../sesion/apariencia';
import { useSesion } from '../sesion/SesionContext';
import { inicioDe, NOMBRES_DE_ROLES } from '../utilidades/roles';
import { Campana } from './Campana';
import { Navegacion } from './Navegacion';

/**
 * El logo (o el icono), el producto y la empresa, con su nombre comercial si lo tiene (RF31). En la barra del
 * celular no cabe todo: queda la empresa, que es lo que orienta.
 */
function Marca({ compacta = false }: { compacta?: boolean }) {
  const { sesion } = useSesion();
  // El enlace del logo caduca con la sesión: si falla, vuelve el icono en lugar de una imagen rota.
  const [logoFallido, setLogoFallido] = useState<string | null>(null);
  const empresa = sesion?.empresa;
  const nombre = empresa ? (empresa.marca.nombreComercial ?? empresa.nombre) : 'Administración de la plataforma';
  const logo = empresa?.marca.logoUrl;
  return (
    <Link to={sesion ? inicioDe(sesion.usuario.rol) : '/'} className="flex min-w-0 items-center gap-3 rounded-lg px-1">
      {logo && logo !== logoFallido ? (
        // Sobre blanco también en el modo oscuro: un logo con letras oscuras y fondo transparente no desaparece.
        <img src={logo} alt="" onError={() => setLogoFallido(logo)}
          className={`shrink-0 rounded-md bg-white object-contain p-0.5 ring-1 ring-slate-200 ${compacta ? 'h-8 max-w-20' : 'h-9 max-w-24'}`} />
      ) : (
        <img src="/icono.svg" alt="" className={`shrink-0 ${compacta ? 'size-8' : 'size-9'}`} />
      )}
      {compacta ? (
        <p className="truncate text-sm font-semibold text-slate-900">{nombre}</p>
      ) : (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">Gestión documental</p>
          <p className="truncate text-xs text-slate-500">{nombre}</p>
        </div>
      )}
    </Link>
  );
}

function MenuDeUsuario() {
  const { sesion, cerrar } = useSesion();
  const [confirmando, setConfirmando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  if (!sesion) return null;

  async function salir() {
    setConfirmando(false);
    setSaliendo(true);
    // Un instante para que se vea la despedida; con «reducir movimiento» (o sin forma de saberlo), sin espera.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === false) await new Promise((listo) => setTimeout(listo, 600));
    await cerrar();
  }

  return (
    <div className="flex items-center gap-1">
      <Link to="/cuenta" className="hidden items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-100 sm:flex">
        <CircleUser aria-hidden className="size-5 text-slate-500" />
        <span className="max-w-40 truncate font-medium text-slate-700">{sesion.usuario.nombre}</span>
        <span className="text-xs text-slate-500">{NOMBRES_DE_ROLES[sesion.usuario.rol]}</span>
      </Link>
      {/* Se confirma: en el celular este botón queda junto a la campana, y un toque de más obligaría a volver a entrar. */}
      <button type="button" onClick={() => setConfirmando(true)} className="rounded-lg p-2.5 text-slate-600 hover:bg-slate-100" aria-label="Cerrar sesión" title="Cerrar sesión">
        <LogOut aria-hidden className="size-5" />
      </button>
      <Modal
        abierto={confirmando}
        alCerrar={() => setConfirmando(false)}
        titulo="¿Cerrar sesión?"
        acciones={<>
          <Boton variante="secundario" onClick={() => setConfirmando(false)}>Cancelar</Boton>
          <Boton icono={LogOut} onClick={() => void salir()}>Sí, cerrar sesión</Boton>
        </>}
      >
        <p className="text-sm text-slate-600">Para volver a entrar necesitarás tu correo y tu contraseña.</p>
      </Modal>
      {saliendo && <Despedida nombre={sesion.usuario.nombre} />}
    </div>
  );
}

/**
 * Mientras se cierra la sesión, la pantalla se despide en lugar de quedarse quieta. Va a <body> con un portal:
 * dentro de la cabecera, que tiene backdrop-blur, «fixed» se mediría contra ella y no contra la pantalla.
 */
function Despedida({ nombre }: { nombre: string }) {
  return createPortal(
    <div role="status" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-superficie/85 px-6 text-center backdrop-blur-sm motion-safe:animate-aparecer">
      <span className="flex size-14 items-center justify-center rounded-full bg-marca-50 text-marca-700 motion-safe:animate-subir">
        <LogOut aria-hidden className="size-6" />
      </span>
      <p className="text-lg font-semibold text-slate-900">Cerrando sesión…</p>
      <p className="text-sm text-slate-600">Hasta pronto, {nombre.split(' ')[0]}</p>
    </div>,
    document.body,
  );
}

/** Al pie del menú: la cuenta y, con la sesión iniciada, los términos y la privacidad (D38). */
function PieDelMenu() {
  return (
    <div className="mt-auto">
      <Link to="/cuenta" className="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Mi cuenta</Link>
      <nav aria-label="Información legal" className="mt-1 flex gap-3 px-3 text-xs text-slate-500">
        <Link to="/terminos" className="py-1 hover:text-marca-700 hover:underline">Términos</Link>
        <Link to="/privacidad" className="py-1 hover:text-marca-700 hover:underline">Privacidad</Link>
      </nav>
    </div>
  );
}

/**
 * La imagen de fondo de la empresa (D39), fija detrás de todo. La pide estilos.css solo desde 1024 px, así que
 * en el celular este elemento queda vacío y la imagen no se descarga.
 */
function ImagenDeFondo({ url }: { url: string }) {
  return (
    <div aria-hidden data-testid="imagen-de-fondo" className="imagen-de-fondo pointer-events-none fixed inset-0 -z-10 bg-cover bg-center print:hidden"
      style={{ '--imagen-de-fondo': urlDeCss(url) } as CSSProperties} />
  );
}

/**
 * Con imagen de fondo, el contenido va en un panel opaco del color de la página y la imagen se ve alrededor:
 * ningún texto queda encima de una foto, que con cualquier velo podría dejarlo ilegible (D39).
 */
const PANEL_SOBRE_LA_IMAGEN = 'lg:my-6 lg:w-[calc(100%-3rem)] lg:rounded-2xl lg:bg-pagina lg:shadow-sm lg:ring-1 lg:ring-slate-900/5 ' +
  'print:my-0 print:w-full print:rounded-none print:bg-transparent print:shadow-none print:ring-0';

/** El marco de todas las pantallas con sesión: barra lateral en escritorio, menú desplegable en el celular. */
export function Layout() {
  const { sesion, esMaster } = useSesion();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const ubicacion = useLocation();
  const imagenDeFondo = sesion?.empresa?.marca.fondoUrl;

  // Al navegar desde el menú del celular, el menú se cierra solo.
  useEffect(() => setMenuAbierto(false), [ubicacion.pathname]);

  return (
    <div className="min-h-dvh lg:pl-64 print:pl-0">
      {imagenDeFondo && <ImagenDeFondo url={imagenDeFondo} />}
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-superficie focus:px-3 focus:py-2">
        Saltar al contenido
      </a>

      {/* Al imprimir (el historial, RF36) sale solo el contenido: sin menú ni barra. */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-6 border-r border-slate-200 bg-superficie px-4 py-5 lg:flex print:hidden">
        <Marca />
        <Navegacion />
        <PieDelMenu />
      </aside>

      {menuAbierto && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <button type="button" aria-label="Cerrar el menú" className="absolute inset-0 bg-black/40" onClick={() => setMenuAbierto(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 overflow-y-auto bg-superficie px-4 py-5 shadow-xl">
            <div className="flex items-center justify-between">
              <Marca />
              <button type="button" onClick={() => setMenuAbierto(false)} aria-label="Cerrar el menú" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <Navegacion alNavegar={() => setMenuAbierto(false)} />
            <PieDelMenu />
          </div>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-slate-200 bg-superficie/95 px-4 backdrop-blur sm:px-6 print:hidden">
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

      <main id="contenido" className={`mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 print:max-w-none print:p-0 ${imagenDeFondo ? PANEL_SOBRE_LA_IMAGEN : ''}`}>
        <Outlet />
      </main>
    </div>
  );
}
