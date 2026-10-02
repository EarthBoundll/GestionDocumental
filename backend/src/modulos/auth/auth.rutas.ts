import { Router, type RequestHandler } from 'express';
import type { crearLimitadores } from '../../middlewares/limitar-intentos.js';
import type { crearControladorAuth } from './auth.controlador.js';

export function crearRutasAuth(
  controlador: ReturnType<typeof crearControladorAuth>,
  autenticar: RequestHandler,
  limitadores: ReturnType<typeof crearLimitadores>,
): Router {
  const rutas = Router();
  rutas.post('/registro', limitadores.registro, controlador.registrar);
  rutas.post('/login', limitadores.inicioSesion, controlador.iniciarSesion);
  rutas.post('/logout', autenticar, controlador.cerrarSesion);
  rutas.get('/yo', autenticar, controlador.perfil);
  rutas.put('/clave', autenticar, controlador.cambiarClave);
  return rutas;
}
