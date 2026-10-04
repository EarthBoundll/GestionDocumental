import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { aplicarRetencion, generarRespaldo, nombreDeRespaldo, restaurarRespaldo, TABLAS } from '../../src/respaldos/respaldo.js';
import { msHastaElProximo } from '../../src/tareas/respaldo-nocturno.js';
import {
  CLAVE, crearAppDePruebas, crearUsuarioEn, depositoDePruebas, historialDe, iniciarSesion, registrarEmpresa, tokenDelMaster,
} from '../apoyo/api.js';
import { PDF } from '../apoyo/archivos.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

/** Todas las filas de cada tabla respaldada, tal como las escribe PostgreSQL: para comparar dos bases. */
async function contenidoDe(pool: pg.Pool) {
  const tablas: Record<string, unknown> = {};
  for (const { nombre, orden } of TABLAS) {
    tablas[nombre] = (await pool.query(`SELECT coalesce(json_agg(t ORDER BY ${orden}), '[]'::json) AS filas FROM ${nombre} t`)).rows[0].filas;
  }
  return tablas;
}

describe('Respaldos de la base (RF29)', () => {
  let origen: BaseDePruebas;
  let app: ReturnType<typeof crearAppDePruebas>;
  let emailDeLaPersona: string;

  /** Una plataforma con de todo: dos empresas, una categoría restringida, papelera, una solicitud y búsquedas. */
  beforeAll(async () => {
    origen = await crearBaseDePruebas();
    app = crearAppDePruebas(origen.pool);
    for (let empresa = 0; empresa < 2; empresa++) {
      const { token: admin, empresa: { id: empresaId } } = await registrarEmpresa(app);
      const persona = await crearUsuarioEn(origen.pool, empresaId);
      emailDeLaPersona = persona.email;
      const usuario = await iniciarSesion(app, persona.email);
      const conToken = (token: string) => ({ Authorization: `Bearer ${token}` });
      const categoria = await request(app).post('/api/v1/categorias').set(conToken(admin))
        .send({ nombre: 'Planillas', restringida: true, usuariosAutorizados: [persona.id] });
      const subir = (nombre: string) => request(app).post('/api/v1/documentos').set(conToken(usuario))
        .field('nombre', nombre).field('categoriaId', categoria.body.id).field('fechaDocumento', '2026-09-15')
        .attach('archivo', PDF, 'planilla.pdf');
      const vigente = await subir('Planilla de septiembre');
      const eliminado = await subir('Planilla duplicada');
      await request(app).delete(`/api/v1/documentos/${eliminado.body.id}`).set(conToken(usuario));
      await request(app).post(`/api/v1/documentos/${vigente.body.id}/solicitudes`).set(conToken(usuario)).send({ comentario: 'Revisar' });
      await request(app).get('/api/v1/documentos').query({ q: 'planilla' }).set(conToken(usuario));
    }
  });
  afterAll(() => origen.cerrar());

  it('restaurar en una base nueva deja exactamente las mismas filas, y la plataforma sigue funcionando', async () => {
    const { contenido, filas } = await generarRespaldo(origen.pool);
    expect(filas).toMatchObject({ empresas: 2, categoria_accesos: 2, documentos: 4, solicitudes: 2, notificaciones: 2 });
    const destino = await crearBaseDePruebas();
    try {
      expect(await restaurarRespaldo(destino.pool, contenido)).toEqual(filas);
      expect(await contenidoDe(destino.pool)).toEqual(await contenidoDe(origen.pool));

      // Las contraseñas viajan como hash bcrypt y siguen valiendo; el historial continúa su numeración.
      const restaurada = crearAppDePruebas(destino.pool);
      const token = await iniciarSesion(restaurada, emailDeLaPersona, { clave: CLAVE });
      expect((await request(restaurada).get('/api/v1/documentos').set('Authorization', `Bearer ${token}`)).body.datos)
        .toHaveLength(1);
      const { rows: [{ maximo }] } = await origen.pool.query('SELECT max(id)::int AS maximo FROM historial');
      const { rows: [{ siguiente }] } = await destino.pool.query(
        "SELECT max(id)::int AS siguiente FROM historial WHERE accion = 'SESION_INICIADA'");
      expect(siguiente).toBeGreaterThan(maximo);
    } finally {
      await destino.cerrar();
    }
  });

  it('no restaura sobre una base con datos: sustituye una base perdida, no mezcla', async () => {
    const { contenido } = await generarRespaldo(origen.pool);

    await expect(restaurarRespaldo(origen.pool, contenido)).rejects.toThrow('ya tiene datos');
  });

  it('no restaura en una base con otras migraciones', async () => {
    const { contenido } = await generarRespaldo(origen.pool);
    const destino = await crearBaseDePruebas();
    try {
      await destino.pool.query("DELETE FROM esquema_migraciones WHERE archivo = '007_respaldos.sql'");
      await expect(restaurarRespaldo(destino.pool, contenido)).rejects.toThrow('misma versión del código');
    } finally {
      await destino.cerrar();
    }
  });

  it('el Master pide uno y lo ve en la lista, sin poder descargarlo; queda en el historial de la plataforma', async () => {
    const deposito = depositoDePruebas();
    const conRespaldos = crearAppDePruebas(origen.pool, {}, undefined, undefined, deposito);
    const master = await tokenDelMaster(conRespaldos);

    const creado = await request(conRespaldos).post('/api/v1/plataforma/respaldos').set('Authorization', `Bearer ${master}`);

    expect(creado.status).toBe(201);
    expect(creado.body).toMatchObject({ nombre: expect.stringMatching(/^respaldo-.+\.json\.gz$/), bytes: expect.any(Number) });
    const lista = await request(conRespaldos).get('/api/v1/plataforma/respaldos').set('Authorization', `Bearer ${master}`);
    expect(lista.body).toMatchObject({ diasDeRetencion: 30, datos: [{ nombre: creado.body.nombre, bytes: creado.body.bytes }] });
    expect((await request(conRespaldos).get(`/api/v1/plataforma/respaldos/${creado.body.nombre}`).set('Authorization', `Bearer ${master}`)).status)
      .toBe(404);
    expect((await historialDe(origen.pool, null)).at(-1)).toMatchObject({
      accion: 'RESPALDO_GENERADO', rol_usuario: 'master', detalle: { archivo: creado.body.nombre, filas: { empresas: 2 } },
    });
  });

  it('un administrador de empresa no ve ni pide respaldos (403)', async () => {
    const { token } = await registrarEmpresa(app);

    expect((await request(app).get('/api/v1/plataforma/respaldos').set('Authorization', `Bearer ${token}`)).status).toBe(403);
    expect((await request(app).post('/api/v1/plataforma/respaldos').set('Authorization', `Bearer ${token}`)).status).toBe(403);
  });

  it('guarda 30 días: al respaldar se borran los más antiguos', async () => {
    const deposito = depositoDePruebas();
    const ahora = new Date('2026-10-04T08:00:00Z');
    const antiguo = nombreDeRespaldo(new Date('2026-09-03T08:00:00Z'));
    const reciente = nombreDeRespaldo(new Date('2026-09-05T08:00:00Z'));
    await deposito.guardar(antiguo, Buffer.from('x'));
    await deposito.guardar(reciente, Buffer.from('x'));

    expect(await aplicarRetencion(deposito, ahora)).toEqual([antiguo]);
    expect((await deposito.listar()).map((respaldo) => respaldo.nombre)).toEqual([reciente]);
  });

  it('el respaldo nocturno toca a las 03:00 de Lima', () => {
    expect(msHastaElProximo(new Date('2026-10-04T07:00:00Z'))).toBe(3_600_000);
    expect(msHastaElProximo(new Date('2026-10-04T08:00:00Z'))).toBe(86_400_000);
    expect(msHastaElProximo(new Date('2026-10-04T09:30:00Z'))).toBe(81_000_000);
  });
});
