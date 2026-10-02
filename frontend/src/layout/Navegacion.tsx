import { Bell, ClipboardCheck, FileText, History, Tags, Upload, Users, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router';
import { useSesion } from '../sesion/SesionContext';

interface Enlace {
  a: string;
  texto: string;
  icono: LucideIcon;
  /** Solo para no ver en el menú un error que la API daría igualmente; no es la protección (D8). */
  soloAdministrador?: boolean;
}

const GRUPOS: { titulo: string; enlaces: Enlace[] }[] = [
  {
    titulo: 'Documentos',
    enlaces: [
      { a: '/documentos', texto: 'Buscar documentos', icono: FileText },
      { a: '/documentos/nuevo', texto: 'Subir documento', icono: Upload },
    ],
  },
  {
    titulo: 'Aprobaciones',
    enlaces: [
      { a: '/solicitudes', texto: 'Solicitudes', icono: ClipboardCheck },
      { a: '/notificaciones', texto: 'Notificaciones', icono: Bell },
    ],
  },
  {
    titulo: 'Administración',
    enlaces: [
      { a: '/admin/usuarios', texto: 'Usuarios', icono: Users, soloAdministrador: true },
      { a: '/admin/categorias', texto: 'Categorías', icono: Tags, soloAdministrador: true },
      { a: '/admin/historial', texto: 'Historial', icono: History, soloAdministrador: true },
    ],
  },
];

export function Navegacion({ alNavegar }: { alNavegar?: () => void }) {
  const { esAdministrador } = useSesion();
  return (
    <nav aria-label="Principal" className="space-y-6">
      {GRUPOS.map(({ titulo, enlaces }) => {
        const visibles = enlaces.filter((enlace) => !enlace.soloAdministrador || esAdministrador);
        if (visibles.length === 0) return null;
        return (
          <div key={titulo}>
            <p className="px-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">{titulo}</p>
            <ul className="mt-2 space-y-1">
              {visibles.map(({ a, texto, icono: Icono }) => (
                <li key={a}>
                  <NavLink
                    to={a}
                    end
                    onClick={alNavegar}
                    className={({ isActive }) =>
                      `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                        isActive ? 'bg-marca-50 text-marca-800' : 'text-slate-700 hover:bg-slate-100'
                      }`}
                  >
                    <Icono aria-hidden className="size-5 shrink-0" />
                    {texto}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
