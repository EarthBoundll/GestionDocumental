import type { RequestHandler } from 'express';
import type pg from 'pg';
import { actorDe } from '../compartido/peticion.js';
import { tienePermiso, type Permiso } from '../compartido/permisos.js';
import { denegarAcceso } from '../modulos/historial/historial.registro.js';

/**
 * Deja pasar solo a quien tenga el permiso; a los demás, 403 y un ACCESO_DENEGADO en el historial.
 * Va siempre después de autenticar.
 */
export function crearExigir(pool: pg.Pool) {
  return (permiso: Permiso): RequestHandler => async (req, _res, next) => {
    const actor = actorDe(req);
    if (tienePermiso(actor.autenticacion.usuario.rol, permiso)) {
      next();
      return;
    }
    throw await denegarAcceso(pool, actor, permiso, {
      detalle: { metodo: req.method, ruta: req.originalUrl.split('?')[0] },
    });
  };
}
