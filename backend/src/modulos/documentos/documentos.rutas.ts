import { Router, type RequestHandler } from 'express';
import { recibirArchivo } from '../../middlewares/recibir-archivo.js';
import type { crearControladorDocumentos } from './documentos.controlador.js';

export function crearRutasDocumentos(
  controlador: ReturnType<typeof crearControladorDocumentos>,
  autenticar: RequestHandler,
): Router {
  const rutas = Router();
  // Las reglas de propiedad («solo los suyos») dependen del documento: las aplica el servicio.
  rutas.use(autenticar);
  rutas.get('/', controlador.listar);
  rutas.post('/', recibirArchivo, controlador.subir);
  rutas.get('/:id', controlador.obtener);
  rutas.patch('/:id', controlador.editar);
  rutas.delete('/:id', controlador.eliminar);
  rutas.get('/:id/archivo', controlador.archivo);
  return rutas;
}
