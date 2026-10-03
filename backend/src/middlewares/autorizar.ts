import { Router, type RequestHandler } from 'express';
import { actorDe } from '../compartido/peticion.js';
import { tienePermiso, type Permiso } from '../compartido/permisos.js';
import { denegarAcceso } from '../modulos/historial/historial.registro.js';

export type Exigir = (permiso: Permiso) => RequestHandler;

/**
 * Deja pasar solo a quien tenga el permiso; a los demás, 403 y un ACCESO_DENEGADO en el historial.
 * Va siempre después de autenticar.
 */
export const exigir: Exigir = (permiso) => async (req, _res, next) => {
  const actor = actorDe(req);
  if (tienePermiso(actor.autenticacion.usuario.rol, permiso)) {
    next();
    return;
  }
  throw await denegarAcceso(actor, permiso, {
    detalle: { metodo: req.method, ruta: req.originalUrl.split('?')[0] },
  });
};

/**
 * Las dos puertas de la API. Toda ruta con datos de una empresa entra por `empresa`, y toda ruta de la
 * plataforma por `plataforma`: así ningún módulo puede olvidarse de comprobar en qué lado está quien
 * llama. El Master no pasa por la de empresa: no pertenece a ninguna (decisión E).
 */
export function crearPuertas(autenticar: RequestHandler) {
  return {
    empresa: Router().use(autenticar, exigir('USAR_DATOS_DE_EMPRESA')),
    plataforma: Router().use(autenticar, exigir('GESTIONAR_PLATAFORMA')),
  };
}
