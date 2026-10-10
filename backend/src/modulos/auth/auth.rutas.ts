import { Router, type RequestHandler } from 'express';
import type { crearLimitadores } from '../../middlewares/limitar-intentos.js';
import type { crearControladorAuth } from './auth.controlador.js';

/** Sin registro público (decisión B): las empresas y su primer administrador los crea el Master. */
export function crearRutasAuth(
  controlador: ReturnType<typeof crearControladorAuth>,
  autenticar: RequestHandler,
  limitadores: ReturnType<typeof crearLimitadores>,
): Router {
  const rutas = Router();
  rutas.post('/login', limitadores.inicioSesion, controlador.iniciarSesion);
  rutas.post('/logout', autenticar, controlador.cerrarSesion);
  rutas.get('/yo', autenticar, controlador.perfil);
  rutas.put('/clave', autenticar, controlador.cambiarClave);
  rutas.put('/preferencias', autenticar, controlador.cambiarPreferencias);
  rutas.post('/recuperacion', limitadores.recuperacion, controlador.solicitarRecuperacion);
  rutas.post('/recuperacion/confirmar', limitadores.confirmacion, controlador.confirmarRecuperacion);
  // D41: aceptar una invitación y confirmar un correo. Con el mismo freno que la recuperación.
  rutas.post('/activacion', limitadores.confirmacion, controlador.activarCuenta);
  rutas.post('/verificacion', limitadores.confirmacion, controlador.verificarCorreo);
  return rutas;
}
