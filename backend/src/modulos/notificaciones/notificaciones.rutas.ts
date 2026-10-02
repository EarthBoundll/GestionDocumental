import { Router, type RequestHandler } from 'express';
import type pg from 'pg';
import { noEncontrado } from '../../compartido/errores.js';
import { esquemaPaginacion } from '../../compartido/paginacion.js';
import { actorDe, idDeRuta } from '../../compartido/peticion.js';
import { sinVacios, z } from '../../compartido/validacion.js';
import { listarNotificaciones, marcarLeida, marcarTodasLeidas } from './notificaciones.repositorio.js';

const esquemaFiltro = esquemaPaginacion.extend({ soloNoLeidas: sinVacios(z.stringbool().default(false)) });

// Leer las propias notificaciones no tiene reglas de negocio ni se audita (docs/01-analisis.md §7):
// las rutas llaman directamente al repositorio.
export function crearRutasNotificaciones(pool: pg.Pool, autenticar: RequestHandler): Router {
  const rutas = Router();
  rutas.use(autenticar);

  rutas.get('/', async (req, res) => {
    const filtro = esquemaFiltro.parse(req.query);
    const { filas, total, noLeidas } = await listarNotificaciones(pool, actorDe(req).autenticacion.usuario.id, filtro);
    res.json({ datos: filas, paginacion: { pagina: filtro.pagina, porPagina: filtro.porPagina, total }, noLeidas });
  });

  // Antes que /:id/leida, para que «leidas» no se tome por un id.
  rutas.patch('/leidas', async (req, res) => {
    await marcarTodasLeidas(pool, actorDe(req).autenticacion.usuario.id);
    res.status(204).end();
  });

  rutas.patch('/:id/leida', async (req, res) => {
    if (!(await marcarLeida(pool, actorDe(req).autenticacion.usuario.id, idDeRuta(req)))) {
      throw noEncontrado('La notificación no existe');
    }
    res.status(204).end();
  });

  return rutas;
}
