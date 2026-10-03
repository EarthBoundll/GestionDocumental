import { Router, type RequestHandler } from 'express';
import { actorDe, idDeRuta } from '../../compartido/peticion.js';
import { z } from '../../compartido/validacion.js';
import type { ServicioTiempos } from './tiempos-respuesta.servicio.js';

const esquemaDuracion = z.object({ duracionClienteMs: z.number().int().min(0).max(120_000) });

// Un solo endpoint sin reglas propias: controlador y rutas en el mismo archivo.
export function crearRutasTiempos(servicio: ServicioTiempos, entrar: RequestHandler): Router {
  const rutas = Router();
  rutas.patch('/:id', entrar, async (req, res) => {
    const id = idDeRuta(req);
    const { duracionClienteMs } = esquemaDuracion.parse(req.body);
    await servicio.completar(actorDe(req), id, duracionClienteMs);
    res.status(204).end();
  });
  return rutas;
}
