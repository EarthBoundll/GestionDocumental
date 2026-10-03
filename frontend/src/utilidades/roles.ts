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

/**
 * Adónde volver tras iniciar sesión. Si la sesión caducó, a la pantalla donde se estaba; pero si entra
 * otra persona con otro rol en el mismo navegador, a su propia portada: el Master no tiene documentos
 * y los demás no tienen plataforma.
 */
export function destinoTrasEntrar(rol: Rol, desde?: string): string {
  if (!desde?.startsWith('/') || desde === '/') return inicioDe(rol);
  if (desde.startsWith('/cuenta')) return desde;
  return (rol === 'master') === desde.startsWith('/plataforma') ? desde : inicioDe(rol);
}
