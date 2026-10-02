import type { RequestHandler } from 'express';
import type pg from 'pg';
import { noAutenticado } from '../compartido/errores.js';
import type { Firmador } from '../compartido/tokens.js';
import { buscarSesionVigente } from '../modulos/auth/auth.repositorio.js';

const PREFIJO = 'Bearer ';

/**
 * Exige un token válido y una sesión vigente (docs/02-arquitectura.md §4.1). La firma descarta los
 * tokens manipulados o caducados sin tocar la base; la consulta descarta las sesiones cerradas y los
 * usuarios desactivados, y trae el rol vigente, no el que tenía al iniciar sesión.
 */
export function crearAutenticar(pool: pg.Pool, firmador: Firmador): RequestHandler {
  return async (req, _res, next) => {
    const cabecera = req.get('authorization');
    if (!cabecera?.startsWith(PREFIJO)) throw noAutenticado();

    const credencial = await firmador.verificar(cabecera.slice(PREFIJO.length));
    if (!credencial) throw noAutenticado();

    const usuario = await buscarSesionVigente(pool, credencial);
    if (!usuario) throw noAutenticado();

    req.autenticacion = { sesionId: credencial.sesionId, usuario };
    next();
  };
}
