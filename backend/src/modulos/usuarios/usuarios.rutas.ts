import { Router, type RequestHandler } from 'express';
import type { Permiso } from '../../compartido/permisos.js';
import type { crearControladorUsuarios } from './usuarios.controlador.js';

export function crearRutasUsuarios(
  controlador: ReturnType<typeof crearControladorUsuarios>,
  autenticar: RequestHandler,
  exigir: (permiso: Permiso) => RequestHandler,
): Router {
  const rutas = Router();
  rutas.use(autenticar, exigir('GESTIONAR_USUARIOS'));
  rutas.get('/', controlador.listar);
  rutas.post('/', controlador.crear);
  rutas.patch('/:id', controlador.editar);
  rutas.patch('/:id/estado', controlador.cambiarEstado);
  return rutas;
}
