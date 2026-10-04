import { Router, type RequestHandler } from 'express';
import { actorDe } from '../../compartido/peticion.js';
import type { Exigir } from '../../middlewares/autorizar.js';
import { esquemaPeriodo, type ServicioTablero } from './tablero.servicio.js';

export function crearRutasTablero(servicio: ServicioTablero, entrar: RequestHandler, exigir: Exigir): Router {
  const rutas = Router();
  rutas.use(entrar, exigir('VER_TABLERO'));
  rutas.get('/', async (req, res) => {
    res.json(await servicio.obtener(actorDe(req), esquemaPeriodo.parse(req.query)));
  });
  return rutas;
}
