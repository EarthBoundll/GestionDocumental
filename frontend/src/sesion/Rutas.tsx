import { Navigate, Outlet, useLocation } from 'react-router';
import { useSesion } from './SesionContext';

/**
 * Sin sesión, a iniciar sesión. No comprueba roles: si un usuario abre una pantalla de administración,
 * la API responde 403 y lo registra (D8). Bloquearlo aquí lo ocultaría al indicador 6.
 */
export function RutaConSesion() {
  const { sesion } = useSesion();
  const ubicacion = useLocation();
  if (!sesion) return <Navigate to="/login" replace state={{ desde: ubicacion.pathname + ubicacion.search }} />;
  return <Outlet />;
}

/** Iniciar sesión o registrarse no tiene sentido con una sesión abierta. */
export function RutaSinSesion() {
  const { sesion } = useSesion();
  return sesion ? <Navigate to="/documentos" replace /> : <Outlet />;
}
