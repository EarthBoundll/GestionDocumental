import { Router, type RequestHandler } from 'express';
import type { Permiso } from '../../compartido/permisos.js';
import type { crearControladorCategorias } from './categorias.controlador.js';

export function crearRutasCategorias(
  controlador: ReturnType<typeof crearControladorCategorias>,
  /** La puerta de empresa: sesión válida y un rol que pertenece a una empresa. */
  entrar: RequestHandler,
  exigir: (permiso: Permiso) => RequestHandler,
): Router {
  const rutas = Router();
  rutas.use(entrar);
  rutas.get('/', controlador.listar);
  rutas.post('/', exigir('GESTIONAR_CATEGORIAS'), controlador.crear);
  rutas.patch('/:id', exigir('GESTIONAR_CATEGORIAS'), controlador.editar);
  return rutas;
}
