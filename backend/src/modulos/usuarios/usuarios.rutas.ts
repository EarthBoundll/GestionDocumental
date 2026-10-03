import { Router, type RequestHandler } from 'express';
import type { Permiso } from '../../compartido/permisos.js';
import type { crearControladorUsuarios } from './usuarios.controlador.js';

export function crearRutasUsuarios(
  controlador: ReturnType<typeof crearControladorUsuarios>,
  /** La puerta de empresa: sesión válida y un rol que pertenece a una empresa. */
  entrar: RequestHandler,
  exigir: (permiso: Permiso) => RequestHandler,
): Router {
  const rutas = Router();
  rutas.use(entrar, exigir('GESTIONAR_USUARIOS'));
  rutas.get('/', controlador.listar);
  rutas.post('/', controlador.crear);
  rutas.patch('/:id', controlador.editar);
  rutas.patch('/:id/estado', controlador.cambiarEstado);
  return rutas;
}
