import { Router } from 'express';
import type pg from 'pg';
import { actorDe } from '../compartido/peticion.js';
import { autorDe, registrarAccion } from '../modulos/historial/historial.registro.js';
import type { DepositoDeRespaldos } from './deposito.js';
import { DIAS_DE_RETENCION, respaldar } from './respaldo.js';

/**
 * Los respaldos para el Master (RF29): ver cuáles hay y pedir uno ahora. No hay ruta para descargarlos
 * ni para restaurar: un respaldo contiene los datos de todas las empresas, y el Master no lee el
 * contenido de ninguna (D18). Restaurar es un procedimiento de operación (scripts/restaurar-respaldo.ts).
 */
export function crearRutasRespaldos(pool: pg.Pool, deposito: DepositoDeRespaldos): Router {
  const rutas = Router();

  rutas.get('/', async (_req, res) => {
    res.json({ datos: await deposito.listar(), diasDeRetencion: DIAS_DE_RETENCION });
  });

  rutas.post('/', async (req, res) => {
    const actor = actorDe(req);
    const respaldo = await respaldar(pool, deposito, {
      autor: autorDe(actor.autenticacion.usuario),
      contexto: actor.contexto,
      // El asiento lo escribe el Master con su propio acceso: queda en el historial de la plataforma.
      registrar: (asiento) => actor.datos.ejecutar((db) => registrarAccion(db, asiento)),
    });
    res.status(201).json(respaldo);
  });

  return rutas;
}
