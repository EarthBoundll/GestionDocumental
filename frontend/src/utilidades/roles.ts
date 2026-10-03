import type { Rol } from '../api/tipos';

export const NOMBRES_DE_ROLES: Record<Rol, string> = {
  master: 'Administrador Master',
  administrador: 'Administrador',
  usuario: 'Usuario',
};

/** La primera pantalla de cada rol: el Master no tiene documentos, tiene la plataforma. */
export function inicioDe(rol: Rol): string {
  return rol === 'master' ? '/plataforma' : '/documentos';
}
