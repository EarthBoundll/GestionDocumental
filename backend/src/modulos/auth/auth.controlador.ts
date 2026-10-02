import type { RequestHandler } from 'express';
import { actorDe } from '../../compartido/peticion.js';
import { esquemaCambioClave, esquemaInicioSesion, esquemaRegistro } from './auth.esquemas.js';
import type { ServicioAuth } from './auth.servicio.js';

export function crearControladorAuth(servicio: ServicioAuth) {
  const registrar: RequestHandler = async (req, res) => {
    const datos = esquemaRegistro.parse(req.body);
    res.status(201).json(await servicio.registrarOrganizacion(datos, req.contexto));
  };

  const iniciarSesion: RequestHandler = async (req, res) => {
    const datos = esquemaInicioSesion.parse(req.body);
    res.json(await servicio.iniciarSesion(datos, req.contexto));
  };

  const cerrarSesion: RequestHandler = async (req, res) => {
    await servicio.cerrarSesion(actorDe(req));
    res.status(204).end();
  };

  const perfil: RequestHandler = async (req, res) => {
    res.json(await servicio.obtenerPerfil(actorDe(req)));
  };

  const cambiarClave: RequestHandler = async (req, res) => {
    const datos = esquemaCambioClave.parse(req.body);
    await servicio.cambiarClave(actorDe(req), datos);
    res.status(204).end();
  };

  return { registrar, iniciarSesion, cerrarSesion, perfil, cambiarClave };
}
