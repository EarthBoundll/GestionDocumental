import { Navigate, Outlet, useLocation } from 'react-router';
import { inicioDe } from '../utilidades/roles';
import { useSesion } from './SesionContext';

/**
 * Sin sesión, a iniciar sesión. No comprueba roles: si un usuario abre una pantalla de administración,
 * la API responde 403 y lo registra (D8). Bloquearlo aquí lo ocultaría al indicador 6.
 */
export function RutaConSesion() {
  const { sesion, caducada } = useSesion();
  const ubicacion = useLocation();
  if (!sesion) {
    return <Navigate to={caducada ? '/login?motivo=sesion' : '/login'} replace state={{ desde: ubicacion.pathname + ubicacion.search }} />;
  }
  return <Outlet />;
}

/** Iniciar sesión o recuperar la contraseña no tiene sentido con una sesión abierta. */
export function RutaSinSesion() {
  const { sesion } = useSesion();
  return sesion ? <Navigate to={inicioDe(sesion.usuario.rol)} replace /> : <Outlet />;
}

/** La raíz lleva a la primera pantalla de cada rol. */
export function Inicio() {
  const { sesion } = useSesion();
  return <Navigate to={sesion ? inicioDe(sesion.usuario.rol) : '/login'} replace />;
}
