import { Router } from 'express';
import type pg from 'pg';
import { crearControladorSalud } from './salud.controlador.js';

export function crearRutasSalud(pool: pg.Pool, { diagnosticoRed }: { diagnosticoRed: boolean }): Router {
  const rutas = Router();
  rutas.get('/', crearControladorSalud(pool));
  if (diagnosticoRed) {
    // Solo para el primer despliegue: muestra qué IP ve la API, para fijar PROXIES_DE_CONFIANZA (backend/README.md).
    rutas.get('/red', (req, res) => {
      res.json({ ip: req.ip, cadena: req.ips, xForwardedFor: req.get('x-forwarded-for') ?? null });
    });
  }
  return rutas;
}
