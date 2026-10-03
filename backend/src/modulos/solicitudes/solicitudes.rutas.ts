import { Router, type RequestHandler } from 'express';
import { actorDe, idDeRuta } from '../../compartido/peticion.js';
import type { Permiso } from '../../compartido/permisos.js';
import { esquemaFiltroSolicitudes, esquemaNuevaSolicitud, esquemaResolucion } from './solicitudes.esquemas.js';
import type { ServicioSolicitudes } from './solicitudes.servicio.js';

/**
 * Se monta en /api/v1 porque una de sus rutas cuelga de /documentos. Por eso cada ruta lleva su propia
 * puerta de empresa: un `use` aquí exigiría sesión a toda la API, salud e inicio de sesión incluidos.
 */
export function crearRutasSolicitudes(
  servicio: ServicioSolicitudes,
  entrar: RequestHandler,
  exigir: (permiso: Permiso) => RequestHandler,
): Router {
  const rutas = Router();

  rutas.post('/documentos/:id/solicitudes', entrar, async (req, res) => {
    const documentoId = idDeRuta(req);
    const datos = esquemaNuevaSolicitud.parse(req.body ?? {});
    res.status(201).json(await servicio.crear(actorDe(req), documentoId, datos));
  });

  rutas.get('/solicitudes', entrar, async (req, res) => {
    res.json(await servicio.listar(actorDe(req), esquemaFiltroSolicitudes.parse(req.query)));
  });

  rutas.post('/solicitudes/:id/resolucion', entrar, exigir('RESOLVER_SOLICITUDES'), async (req, res) => {
    const id = idDeRuta(req);
    const resolucion = esquemaResolucion.parse(req.body);
    res.json(await servicio.resolver(actorDe(req), id, resolucion));
  });

  return rutas;
}
