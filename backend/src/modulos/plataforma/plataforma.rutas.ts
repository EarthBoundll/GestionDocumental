import { Router, type RequestHandler } from 'express';
import { actorDe, idDeRuta } from '../../compartido/peticion.js';
import {
  esquemaCambiosAdministrador, esquemaCambiosEmpresa, esquemaEstadoAdministrador, esquemaEstadoEmpresa,
  esquemaNuevaEmpresa, esquemaNuevoAdministrador,
} from './plataforma.esquemas.js';
import type { ServicioPlataforma } from './plataforma.servicio.js';

/** El área del Master. Todas sus rutas entran por la puerta de plataforma. */
export function crearRutasPlataforma(servicio: ServicioPlataforma, entrar: RequestHandler, auditoria: Router): Router {
  const rutas = Router();
  rutas.use(entrar);
  rutas.use('/historial', auditoria);

  rutas.get('/metricas', async (req, res) => {
    res.json(await servicio.metricas(actorDe(req)));
  });

  rutas.get('/empresas', async (req, res) => {
    res.json({ datos: await servicio.listarEmpresas(actorDe(req)) });
  });

  rutas.post('/empresas', async (req, res) => {
    const datos = esquemaNuevaEmpresa.parse(req.body);
    res.status(201).json(await servicio.crearEmpresa(actorDe(req), datos));
  });

  rutas.get('/empresas/:id', async (req, res) => {
    res.json(await servicio.obtenerEmpresa(actorDe(req), idDeRuta(req)));
  });

  rutas.patch('/empresas/:id', async (req, res) => {
    const id = idDeRuta(req);
    res.json(await servicio.editarEmpresa(actorDe(req), id, esquemaCambiosEmpresa.parse(req.body)));
  });

  rutas.patch('/empresas/:id/estado', async (req, res) => {
    const id = idDeRuta(req);
    const { activa } = esquemaEstadoEmpresa.parse(req.body);
    res.json(await servicio.cambiarEstadoEmpresa(actorDe(req), id, activa));
  });

  rutas.post('/empresas/:id/administradores', async (req, res) => {
    const id = idDeRuta(req);
    res.status(201).json(await servicio.crearAdministrador(actorDe(req), id, esquemaNuevoAdministrador.parse(req.body)));
  });

  rutas.patch('/administradores/:id', async (req, res) => {
    const id = idDeRuta(req);
    res.json(await servicio.editarAdministrador(actorDe(req), id, esquemaCambiosAdministrador.parse(req.body)));
  });

  rutas.patch('/administradores/:id/estado', async (req, res) => {
    const id = idDeRuta(req);
    const { activo } = esquemaEstadoAdministrador.parse(req.body);
    res.json(await servicio.cambiarEstadoAdministrador(actorDe(req), id, activo));
  });

  return rutas;
}
