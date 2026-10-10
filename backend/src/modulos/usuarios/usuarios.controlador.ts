import type { RequestHandler } from 'express';
import { actorDe, idDeRuta } from '../../compartido/peticion.js';
import { esquemaCambiosUsuario, esquemaEstadoUsuario, esquemaFiltroUsuarios, esquemaNuevoUsuario } from './usuarios.esquemas.js';
import type { ServicioUsuarios } from './usuarios.servicio.js';

export function crearControladorUsuarios(servicio: ServicioUsuarios) {
  const listar: RequestHandler = async (req, res) => {
    res.json(await servicio.listar(actorDe(req), esquemaFiltroUsuarios.parse(req.query)));
  };

  const crear: RequestHandler = async (req, res) => {
    const datos = esquemaNuevoUsuario.parse(req.body);
    res.status(201).json(await servicio.crear(actorDe(req), datos));
  };

  const editar: RequestHandler = async (req, res) => {
    const id = idDeRuta(req);
    const cambios = esquemaCambiosUsuario.parse(req.body);
    res.json(await servicio.editar(actorDe(req), id, cambios));
  };

  const cambiarEstado: RequestHandler = async (req, res) => {
    const id = idDeRuta(req);
    const { activo } = esquemaEstadoUsuario.parse(req.body);
    res.json(await servicio.cambiarEstado(actorDe(req), id, activo));
  };

  const reenviarInvitacion: RequestHandler = async (req, res) => {
    res.json(await servicio.reenviarInvitacion(actorDe(req), idDeRuta(req)));
  };

  return { listar, crear, editar, cambiarEstado, reenviarInvitacion };
}
