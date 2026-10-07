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
  // Antes que /:id, que si no tomaría «exportar» o «papelera» por un identificador.
  rutas.get('/exportar', exigir('EXPORTAR_LISTADO'), controlador.exportarListado);
  rutas.get('/papelera', exigir('GESTIONAR_PAPELERA'), controlador.papelera);
  rutas.post('/papelera/:id/restauracion', exigir('GESTIONAR_PAPELERA'), controlador.restaurar);
  rutas.delete('/papelera/:id', exigir('GESTIONAR_PAPELERA'), controlador.purgar);
  rutas.post('/', recibirArchivo, controlador.subir);
  rutas.get('/:id', controlador.obtener);
  rutas.patch('/:id', controlador.editar);
  rutas.delete('/:id', controlador.eliminar);
  rutas.get('/:id/archivo', controlador.archivo);
  rutas.get('/:id/actividad', controlador.actividad);
  // RF34: quién puede subir o restaurar depende del documento (su autor o un administrador): lo decide el servicio.
  rutas.get('/:id/versiones', controlador.versiones);
  rutas.post('/:id/versiones', recibirArchivo, controlador.subirVersion);
  rutas.post('/:id/versiones/:numero/restauracion', controlador.restaurarVersion);
  return rutas;
}
