import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { crearPool } from '../../src/db/pool.js';
import { crearAppDePruebas } from '../apoyo/api.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

describe('API: base común', () => {
  let base: BaseDePruebas;
  let app: ReturnType<typeof crearAppDePruebas>;

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    app = crearAppDePruebas(base.pool);
  });
  afterAll(() => base.cerrar());

  describe('GET /api/v1/salud', () => {
    it('responde 200 cuando la base está migrada y responde', async () => {
      const respuesta = await request(app).get('/api/v1/salud');

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ estado: 'ok' });
    });

    it('responde 503 si las migraciones no están aplicadas', async () => {
      const sinMigrar = await crearBaseDePruebas({ migrada: false });
      const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const respuesta = await request(crearAppDePruebas(sinMigrar.pool)).get('/api/v1/salud');

        expect(respuesta.status).toBe(503);
        expect(respuesta.body.error.codigo).toBe('SERVICIO_NO_DISPONIBLE');
        expect(registro).toHaveBeenCalled();
      } finally {
        registro.mockRestore();
        await sinMigrar.cerrar();
      }
    });

    it('responde 503 si la base no está disponible', async () => {
      const inalcanzable = crearPool({ DATABASE_URL: 'postgresql://postgres@127.0.0.1:1/postgres', DATABASE_CA: undefined });
      const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const respuesta = await request(crearAppDePruebas(inalcanzable)).get('/api/v1/salud');

        expect(respuesta.status).toBe(503);
        expect(respuesta.body).toEqual({
          error: { codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: 'La base de datos no responde' },
        });
      } finally {
        registro.mockRestore();
        await inalcanzable.end();
      }
    });
  });

  it('una ruta inexistente responde 404 con el formato de error común', async () => {
    const respuesta = await request(app).get('/api/v1/no-existe');

    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toEqual({
      error: { codigo: 'NO_ENCONTRADO', mensaje: 'No existe la ruta GET /api/v1/no-existe' },
    });
  });

  it('un cuerpo que no es JSON válido responde 400', async () => {
    const respuesta = await request(app)
      .post('/api/v1/salud')
      .set('Content-Type', 'application/json')
      .send('{"nombre": ');

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toEqual({ codigo: 'VALIDACION', mensaje: 'El cuerpo de la petición no es JSON válido' });
  });

  it('un cuerpo de más de 100 kB responde 413', async () => {
    const respuesta = await request(app)
      .post('/api/v1/salud')
      .send({ relleno: 'x'.repeat(101 * 1024) });

    expect(respuesta.status).toBe(413);
    expect(respuesta.body.error.codigo).toBe('CUERPO_DEMASIADO_GRANDE');
  });

  it('no anuncia la tecnología del servidor y prohíbe al navegador adivinar tipos', async () => {
    const respuesta = await request(app).get('/api/v1/salud');

    expect(respuesta.headers['x-powered-by']).toBeUndefined();
    expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
  });
});
