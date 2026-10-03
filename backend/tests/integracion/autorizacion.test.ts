import express from 'express';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { crearFirmador } from '../../src/compartido/tokens.js';
import { crearAutenticar } from '../../src/middlewares/autenticar.js';
import { exigir } from '../../src/middlewares/autorizar.js';
import { contexto } from '../../src/middlewares/contexto.js';
import { manejarErrores } from '../../src/middlewares/manejar-errores.js';
import { ACCIONES } from '../../src/modulos/historial/historial.registro.js';
import {
  crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, registrarEmpresa, SECRETO_DE_PRUEBAS, UA_IPHONE,
} from '../apoyo/api.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

describe('Autorización por rol (indicador 6)', () => {
  let base: BaseDePruebas;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearAppDePruebas>;
  let protegida: express.Express;

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    pool = base.pool;
    app = crearAppDePruebas(pool);
    // Una ruta de administración con los middlewares reales, tal como la montarán las fases siguientes.
    protegida = express()
      .use(contexto)
      .get('/api/v1/usuarios', crearAutenticar(pool, crearFirmador(SECRETO_DE_PRUEBAS)), exigir('GESTIONAR_USUARIOS'),
        (_req, res) => { res.json({ datos: [] }); })
      .use(manejarErrores);
  });
  afterAll(() => base.cerrar());

  it('deja pasar al administrador', async () => {
    const { token } = await registrarEmpresa(app);

    const respuesta = await request(protegida).get('/api/v1/usuarios').set('Authorization', `Bearer ${token}`);

    expect(respuesta.status).toBe(200);
  });

  it('a un usuario le responde 403 y registra el intento con su rol, el permiso y la ruta', async () => {
    const { empresa } = await registrarEmpresa(app);
    const empleado = await crearUsuarioEn(pool, empresa.id, 'usuario');
    const token = await iniciarSesion(app, empleado.email);

    const respuesta = await request(protegida).get('/api/v1/usuarios?pagina=2')
      .set('Authorization', `Bearer ${token}`).set('User-Agent', UA_IPHONE);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe('SIN_PERMISO');
    expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({
      accion: 'ACCESO_DENEGADO',
      usuario_id: empleado.id,
      rol_usuario: 'usuario',
      es_movil: true,
      detalle: { permiso: 'GESTIONAR_USUARIOS', metodo: 'GET', ruta: '/api/v1/usuarios' },
    });
  });

  it('si el historial falla, deniega igualmente y deja constancia en el registro del servidor', async () => {
    const { empresa } = await registrarEmpresa(app);
    const empleado = await crearUsuarioEn(pool, empresa.id, 'usuario');
    const token = await iniciarSesion(app, empleado.email);
    const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
    await pool.query(`
      CREATE FUNCTION fallar_registro() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'historial no disponible'; END $$;
      CREATE TRIGGER historial_roto BEFORE INSERT ON historial FOR EACH ROW
        WHEN (NEW.accion = 'ACCESO_DENEGADO') EXECUTE FUNCTION fallar_registro();
    `);
    try {
      const respuesta = await request(protegida).get('/api/v1/usuarios').set('Authorization', `Bearer ${token}`);

      expect(respuesta.status).toBe(403);
      expect(registro).toHaveBeenCalledWith('[historial] no se pudo registrar un acceso denegado:', expect.anything());
    } finally {
      registro.mockRestore();
      await pool.query('DROP TRIGGER historial_roto ON historial; DROP FUNCTION fallar_registro();');
    }
  });

  it('sin sesión no llega a evaluar el permiso: 401, no 403, y no se registra nada', async () => {
    const antes = (await historialDe(pool, null)).length;

    const respuesta = await request(protegida).get('/api/v1/usuarios');

    expect(respuesta.status).toBe(401);
    expect((await historialDe(pool, null)).length).toBe(antes);
  });

  it('el catálogo de acciones del código es exactamente el que admite la base', async () => {
    const { rows } = await pool.query<{ definicion: string }>(
      "SELECT pg_get_constraintdef(oid) AS definicion FROM pg_constraint WHERE conname = 'historial_accion_del_catalogo'");
    const enLaBase = [...rows[0]!.definicion.matchAll(/'([A-Z_]+)'/g)].map((coincidencia) => coincidencia[1]);

    expect([...enLaBase].sort()).toEqual([...ACCIONES].sort());
  });
});
