import type { RequestHandler } from 'express';
import type pg from 'pg';
import { ErrorAplicacion } from '../../compartido/errores.js';
import { comprobarBase } from './salud.repositorio.js';

export function crearControladorSalud(pool: pg.Pool): RequestHandler {
  return async (_req, res) => {
    try {
      await comprobarBase(pool);
    } catch (error) {
      throw new ErrorAplicacion(503, 'SERVICIO_NO_DISPONIBLE', 'La base de datos no responde', { cause: error });
    }
    res.json({ estado: 'ok' });
  };
}
