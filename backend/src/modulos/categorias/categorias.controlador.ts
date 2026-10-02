import type { RequestHandler } from 'express';
import { actorDe, idDeRuta } from '../../compartido/peticion.js';
import { esquemaCambiosCategoria, esquemaFiltroCategorias, esquemaNuevaCategoria } from './categorias.esquemas.js';
import type { ServicioCategorias } from './categorias.servicio.js';

export function crearControladorCategorias(servicio: ServicioCategorias) {
  const listar: RequestHandler = async (req, res) => {
    const filtro = esquemaFiltroCategorias.parse(req.query);
    res.json({ datos: await servicio.listar(actorDe(req), filtro) });
  };

  const crear: RequestHandler = async (req, res) => {
    const datos = esquemaNuevaCategoria.parse(req.body);
    res.status(201).json(await servicio.crear(actorDe(req), datos));
  };

  const editar: RequestHandler = async (req, res) => {
    const id = idDeRuta(req);
    const cambios = esquemaCambiosCategoria.parse(req.body);
    res.json(await servicio.editar(actorDe(req), id, cambios));
  };

  return { listar, crear, editar };
}
