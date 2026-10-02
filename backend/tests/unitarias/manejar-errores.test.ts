import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorAplicacion } from '../../src/compartido/errores.js';
import { z } from '../../src/compartido/validacion.js';
import { manejarErrores } from '../../src/middlewares/manejar-errores.js';

/** Una app mínima cuyas rutas lanzan cada tipo de error, delante del manejador real. */
function appQueLanza(error: () => unknown) {
  const app = express();
  app.get('/sincrono', () => {
    throw error();
  });
  app.get('/asincrono', async () => {
    await Promise.resolve();
    throw error();
  });
  app.use(manejarErrores);
  return app;
}

describe('manejarErrores', () => {
  const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
  afterEach(() => registro.mockClear());

  it('un ErrorAplicacion sale con su estado, su código y sus detalles, y no se registra', async () => {
    const app = appQueLanza(() => new ErrorAplicacion(404, 'NO_ENCONTRADO', 'Ese documento no existe', {
      detalles: [{ campo: 'id', mensaje: 'Sin coincidencias' }],
    }));

    const respuesta = await request(app).get('/sincrono');

    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toEqual({
      error: { codigo: 'NO_ENCONTRADO', mensaje: 'Ese documento no existe', detalles: [{ campo: 'id', mensaje: 'Sin coincidencias' }] },
    });
    expect(registro).not.toHaveBeenCalled();
  });

  it('un error de Zod sale como 400 VALIDACION, campo por campo y en español', async () => {
    const esquema = z.object({ nombre: z.string(), archivo: z.object({ pesoBytes: z.number().max(10) }) });
    const app = appQueLanza(() => {
      try {
        esquema.parse({ archivo: { pesoBytes: 99 } });
      } catch (error) {
        return error;
      }
    });

    const respuesta = await request(app).get('/sincrono');

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('VALIDACION');
    expect(respuesta.body.error.detalles).toEqual([
      { campo: 'nombre', mensaje: expect.stringContaining('se esperaba texto') },
      { campo: 'archivo.pesoBytes', mensaje: expect.stringContaining('10') },
    ]);
  });

  it('un error inesperado sale como 500 sin revelar nada, y queda registrado en el servidor', async () => {
    const app = appQueLanza(() => new Error('password authentication failed for user "postgres"'));

    const respuesta = await request(app).get('/sincrono');

    expect(respuesta.status).toBe(500);
    expect(respuesta.body).toEqual({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' } });
    expect(JSON.stringify(respuesta.body)).not.toContain('postgres');
    expect(registro).toHaveBeenCalledOnce();
  });

  it('también recoge los errores de funciones async, sin envoltorios (Express 5)', async () => {
    const app = appQueLanza(() => new ErrorAplicacion(503, 'SERVICIO_NO_DISPONIBLE', 'La base de datos no responde'));

    const respuesta = await request(app).get('/asincrono');

    expect(respuesta.status).toBe(503);
    expect(respuesta.body.error.codigo).toBe('SERVICIO_NO_DISPONIBLE');
  });
});
