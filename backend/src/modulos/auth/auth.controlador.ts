import type { RequestHandler } from 'express';
import { actorDe } from '../../compartido/peticion.js';
import {
  esquemaCambioClave, esquemaConfirmacionRecuperacion, esquemaInicioSesion, esquemaSolicitudRecuperacion,
} from './auth.esquemas.js';
import { MINUTOS_DE_RECUPERACION, type ServicioAuth } from './auth.servicio.js';

export function crearControladorAuth(servicio: ServicioAuth) {
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

  // La misma respuesta exista o no el correo (CLAUDE.md v2): no revela qué cuentas hay.
  const solicitarRecuperacion: RequestHandler = async (req, res) => {
    const { email } = esquemaSolicitudRecuperacion.parse(req.body);
    await servicio.solicitarRecuperacion(email, req.contexto);
    res.status(202).json({
      mensaje: `Si el correo corresponde a una cuenta, en unos minutos llegará un enlace para definir una contraseña nueva. Vale ${MINUTOS_DE_RECUPERACION} minutos y una sola vez.`,
    });
  };

  const confirmarRecuperacion: RequestHandler = async (req, res) => {
    const datos = esquemaConfirmacionRecuperacion.parse(req.body);
    await servicio.confirmarRecuperacion(datos, req.contexto);
    res.status(204).end();
  };

  return { iniciarSesion, cerrarSesion, perfil, cambiarClave, solicitarRecuperacion, confirmarRecuperacion };
}
