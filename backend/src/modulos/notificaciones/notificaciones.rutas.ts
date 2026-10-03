import { Router, type RequestHandler } from 'express';
import { noEncontrado } from '../../compartido/errores.js';
import { esquemaPaginacion } from '../../compartido/paginacion.js';
import { actorDe, idDeRuta } from '../../compartido/peticion.js';
import { sinVacios, z } from '../../compartido/validacion.js';
import { listarNotificaciones, marcarLeida, marcarTodasLeidas } from './notificaciones.repositorio.js';

const esquemaFiltro = esquemaPaginacion.extend({ soloNoLeidas: sinVacios(z.stringbool().default(false)) });

// Leer las propias notificaciones no tiene reglas de negocio ni se audita (docs/01-analisis.md §7):
// las rutas llaman directamente al repositorio, siempre a través del acceso del actor.
export function crearRutasNotificaciones(entrar: RequestHandler): Router {
  const rutas = Router();
  rutas.use(entrar);

  rutas.get('/', async (req, res) => {
    const filtro = esquemaFiltro.parse(req.query);
    const actor = actorDe(req);
    const { filas, total, noLeidas } = await actor.datos.ejecutar((db) => listarNotificaciones(db, actor.autenticacion.usuario.id, filtro));
    res.json({ datos: filas, paginacion: { pagina: filtro.pagina, porPagina: filtro.porPagina, total }, noLeidas });
  });

  // Antes que /:id/leida, para que «leidas» no se tome por un id.
  rutas.patch('/leidas', async (req, res) => {
    const actor = actorDe(req);
    await actor.datos.ejecutar((db) => marcarTodasLeidas(db, actor.autenticacion.usuario.id));
    res.status(204).end();
  });

  rutas.patch('/:id/leida', async (req, res) => {
    const actor = actorDe(req);
    const id = idDeRuta(req);
    if (!(await actor.datos.ejecutar((db) => marcarLeida(db, actor.autenticacion.usuario.id, id)))) {
      throw noEncontrado('La notificación no existe');
    }
    res.status(204).end();
  });

  return rutas;
}
