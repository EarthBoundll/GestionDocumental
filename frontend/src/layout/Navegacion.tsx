import {
  Bell, Building2, ClipboardCheck, DatabaseBackup, FileText, History, LayoutDashboard, Palette, ShieldCheck, Tags, Trash2, Upload, Users,
  type LucideIcon,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import type { Rol } from '../api/tipos';
import { useSesion } from '../sesion/SesionContext';

interface Enlace {
  a: string;
  texto: string;
  icono: LucideIcon;
}

/**
 * Los grupos del menú y quién los ve. Esconder un enlace solo evita mostrar algo que la API rechazaría
 * igualmente; la protección es la API, que además registra el intento (D8).
 */
const GRUPOS: { titulo: string; roles: readonly Rol[]; enlaces: Enlace[] }[] = [
  {
    titulo: 'Plataforma',
    roles: ['master'],
    enlaces: [
      { a: '/plataforma', texto: 'Empresas', icono: Building2 },
      { a: '/plataforma/auditoria', texto: 'Auditoría', icono: ShieldCheck },
      { a: '/plataforma/respaldos', texto: 'Respaldos', icono: DatabaseBackup },
    ],
  },
  {
    titulo: 'Documentos',
    roles: ['administrador', 'usuario'],
    enlaces: [
      { a: '/documentos', texto: 'Buscar documentos', icono: FileText },
      { a: '/documentos/nuevo', texto: 'Subir documento', icono: Upload },
    ],
  },
  {
    titulo: 'Aprobaciones',
    roles: ['administrador', 'usuario'],
    enlaces: [
      { a: '/solicitudes', texto: 'Solicitudes', icono: ClipboardCheck },
      { a: '/notificaciones', texto: 'Notificaciones', icono: Bell },
    ],
  },
  {
    titulo: 'Administración',
    roles: ['administrador'],
    enlaces: [
      { a: '/admin/tablero', texto: 'Tablero', icono: LayoutDashboard },
      { a: '/admin/usuarios', texto: 'Usuarios', icono: Users },
      { a: '/admin/categorias', texto: 'Categorías', icono: Tags },
      { a: '/admin/historial', texto: 'Historial', icono: History },
      { a: '/admin/papelera', texto: 'Papelera', icono: Trash2 },
      { a: '/admin/identidad', texto: 'Identidad', icono: Palette },
    ],
  },
];

export function Navegacion({ alNavegar }: { alNavegar?: () => void }) {
  const { sesion } = useSesion();
  const { pathname } = useLocation();
  const rol = sesion?.usuario.rol;
  // «Empresas» sigue marcado dentro de una empresa (/plataforma/empresas/…), pero no en las otras secciones.
  const marcado = (a: string, isActive: boolean) =>
    isActive && !(a === '/plataforma' && /^\/plataforma\/(auditoria|respaldos)/.test(pathname));
  return (
    <nav aria-label="Principal" className="space-y-6">
      {GRUPOS.filter((grupo) => rol && grupo.roles.includes(rol)).map(({ titulo, enlaces }) => (
        <div key={titulo}>
          <p className="px-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">{titulo}</p>
          <ul className="mt-2 space-y-1">
            {enlaces.map(({ a, texto, icono: Icono }) => (
              <li key={a}>
                <NavLink
                  to={a}
                  end={a !== '/plataforma'}
                  onClick={alNavegar}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                      marcado(a, isActive) ? 'bg-marca-50 text-marca-800 shadow-[inset_3px_0_0_var(--color-marca-600)]' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                >
                  <Icono aria-hidden className="size-5 shrink-0" />
                  {texto}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
