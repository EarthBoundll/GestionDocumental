import { Router, type RequestHandler } from 'express';
import type { Exigir } from '../../middlewares/autorizar.js';
import { recibirArchivo } from '../../middlewares/recibir-archivo.js';
import type { crearControladorDocumentos } from './documentos.controlador.js';

export function crearRutasDocumentos(
  controlador: ReturnType<typeof crearControladorDocumentos>,
  /** La puerta de empresa: sesión válida y un rol que pertenece a una empresa. */
  entrar: RequestHandler,
  exigir: Exigir,
): Router {
  const rutas = Router();
  // Las reglas de propiedad («solo los suyos») dependen del documento: las aplica el servicio.
  rutas.use(entrar);
  rutas.get('/', controlador.listar);
  // Antes que /:id, que si no tomaría «papelera» por un identificador.
  rutas.get('/papelera', exigir('GESTIONAR_PAPELERA'), controlador.papelera);
  rutas.post('/papelera/:id/restauracion', exigir('GESTIONAR_PAPELERA'), controlador.restaurar);
  rutas.delete('/papelera/:id', exigir('GESTIONAR_PAPELERA'), controlador.purgar);
  rutas.post('/', recibirArchivo, controlador.subir);
  rutas.get('/:id', controlador.obtener);
  rutas.patch('/:id', controlador.editar);
  rutas.delete('/:id', controlador.eliminar);
  rutas.get('/:id/archivo', controlador.archivo);
  return rutas;
}
