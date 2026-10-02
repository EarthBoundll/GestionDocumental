import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, registrarOrganizacion } from '../apoyo/api.js';
import { PDF } from '../apoyo/archivos.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

describe('Flujo de aprobación y notificaciones (RF15–RF18)', () => {
  let base: BaseDePruebas;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearAppDePruebas>;

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    pool = base.pool;
  });
  afterAll(() => base.cerrar());
  beforeEach(() => {
    app = crearAppDePruebas(pool);
  });

  /** Una organización con dos administradores y un usuario que ha subido un documento. */
  async function escenario() {
    const { token: admin, organizacion, usuario: administrador } = await registrarOrganizacion(app);
    const segundo = await crearUsuarioEn(pool, organizacion.id, 'administrador');
    const empleado = await crearUsuarioEn(pool, organizacion.id, 'usuario');
    const admin2 = await iniciarSesion(app, segundo.email);
    const usuario = await iniciarSesion(app, empleado.email);
    const categoriaId = (await request(app).get('/api/v1/categorias').set('Authorization', `Bearer ${usuario}`)).body.datos[0].id;
    const { body: documento } = await request(app).post('/api/v1/documentos').set('Authorization', `Bearer ${usuario}`)
      .field('nombre', 'Contrato de alquiler').field('categoriaId', categoriaId).field('fechaDocumento', '2026-09-15')
      .attach('archivo', PDF, 'contrato.pdf');
    return { admin, admin2, usuario, organizacion, documento, ids: { admin: administrador.id, admin2: segundo.id, empleado: empleado.id } };
  }

  const solicitar = (token: string, documentoId: string, cuerpo: object = {}) =>
    request(app).post(`/api/v1/documentos/${documentoId}/solicitudes`).set('Authorization', `Bearer ${token}`).send(cuerpo);
  const resolver = (token: string, id: string, cuerpo: object) =>
    request(app).post(`/api/v1/solicitudes/${id}/resolucion`).set('Authorization', `Bearer ${token}`).send(cuerpo);
  const notificaciones = (token: string, query = '') =>
    request(app).get(`/api/v1/notificaciones${query}`).set('Authorization', `Bearer ${token}`);
  const ficha = (token: string, id: string) => request(app).get(`/api/v1/documentos/${id}`).set('Authorization', `Bearer ${token}`);

  it('solicitar → aprobar → notificar, con cada paso en el historial', async () => {
    const { admin, admin2, usuario, organizacion, documento, ids } = await escenario();

    const creada = await solicitar(usuario, documento.id, { comentario: 'Para la firma del gerente' });
    expect(creada.status).toBe(201);
    expect(creada.body).toMatchObject({
      estado: 'pendiente', documento: { id: documento.id, nombre: 'Contrato de alquiler', eliminado: false },
      solicitante: { id: ids.empleado }, revisor: null, comentarioSolicitud: 'Para la firma del gerente',
    });

    // RN15: avisa a los dos administradores, no al solicitante.
    for (const token of [admin, admin2]) {
      const { body } = await notificaciones(token);
      expect(body.noLeidas).toBe(1);
      expect(body.datos[0]).toMatchObject({ tipo: 'SOLICITUD_CREADA', leida: false, documentoId: documento.id, solicitudId: creada.body.id });
      expect(body.datos[0].mensaje).toMatch(/pide aprobar «Contrato de alquiler»$/);
    }
    expect((await notificaciones(usuario)).body.noLeidas).toBe(0);
    expect((await ficha(admin, documento.id)).body.permisos.resolverSolicitud).toBe(true);

    const aprobada = await resolver(admin, creada.body.id, { decision: 'aprobada' });
    expect(aprobada.status).toBe(200);
    expect(aprobada.body).toMatchObject({ estado: 'aprobada', revisor: { id: ids.admin }, resueltaEn: expect.any(String) });

    const avisos = (await notificaciones(usuario)).body;
    expect(avisos.noLeidas).toBe(1);
    expect(avisos.datos[0]).toMatchObject({ tipo: 'SOLICITUD_APROBADA', mensaje: expect.stringMatching(/aprobó «Contrato de alquiler»$/) });
    expect((await ficha(usuario, documento.id)).body.ultimaSolicitud).toMatchObject({ estado: 'aprobada', revisor: { id: ids.admin } });
    expect((await historialDe(pool, organizacion.id)).filter((f) => f.entidad_tipo === 'solicitud').map((f) => [f.accion, f.usuario_id]))
      .toEqual([['SOLICITUD_CREADA', ids.empleado], ['SOLICITUD_APROBADA', ids.admin]]);
  });

  it('rechazar exige motivo, lo hace llegar al solicitante, y después se puede pedir otra vez (RN14)', async () => {
    const { admin, usuario, documento } = await escenario();
    const { body: solicitud } = await solicitar(usuario, documento.id);

    const sinMotivo = await resolver(admin, solicitud.id, { decision: 'rechazada' });
    expect(sinMotivo.status).toBe(400);
    expect(sinMotivo.body.error.detalles).toEqual([{ campo: 'comentario', mensaje: 'Explica por qué la rechazas' }]);

    expect((await resolver(admin, solicitud.id, { decision: 'rechazada', comentario: 'Falta la firma' })).body.estado).toBe('rechazada');
    expect((await notificaciones(usuario)).body.datos[0].mensaje).toMatch(/rechazó «Contrato de alquiler»: Falta la firma$/);
    expect((await ficha(usuario, documento.id)).body.permisos.solicitarAprobacion).toBe(true);
    expect((await solicitar(usuario, documento.id)).status).toBe(201);
  });

  it('una solicitud pendiente por documento; una resuelta ya no cambia (RN12, RN14)', async () => {
    const { admin, admin2, usuario, documento } = await escenario();
    const { body: solicitud } = await solicitar(usuario, documento.id);

    expect((await solicitar(usuario, documento.id)).body.error.codigo).toBe('SOLICITUD_PENDIENTE');
    await resolver(admin, solicitud.id, { decision: 'aprobada' });
    const otraVez = await resolver(admin2, solicitud.id, { decision: 'rechazada', comentario: 'Tarde' });
    expect(otraVez.status).toBe(409);
    expect(otraVez.body.error.codigo).toBe('SOLICITUD_RESUELTA');
  });

  it('si dos administradores resuelven a la vez, solo uno gana y el otro recibe 409 (§4.4)', async () => {
    const { admin, admin2, usuario, documento } = await escenario();
    const { body: solicitud } = await solicitar(usuario, documento.id);
    // Para forzar la carrera, la primera actualización tarda: mientras tanto, la segunda petición ya pasó
    // la comprobación previa del servicio, y solo la detiene la condición «sigue pendiente» del UPDATE.
    await pool.query(`
      CREATE FUNCTION frenar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.3); RETURN NEW; END $$;
      CREATE TRIGGER solicitudes_lentas BEFORE UPDATE ON solicitudes FOR EACH ROW EXECUTE FUNCTION frenar();
    `);
    let respuestas: request.Response[];
    try {
      respuestas = await Promise.all([
        resolver(admin, solicitud.id, { decision: 'aprobada' }),
        resolver(admin2, solicitud.id, { decision: 'rechazada', comentario: 'No' }),
      ]);
    } finally {
      await pool.query('DROP TRIGGER solicitudes_lentas ON solicitudes; DROP FUNCTION frenar();');
    }

    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM historial WHERE entidad_id = $1 AND accion IN ($2, $3)',
      [solicitud.id, 'SOLICITUD_APROBADA', 'SOLICITUD_RECHAZADA']);
    expect(rows[0].n).toBe(1);
  });

  it('solo el propietario solicita, y nadie resuelve lo suyo: 403 registrados (RN12, RN13, indicador 6)', async () => {
    const { admin, admin2, usuario, organizacion, documento, ids } = await escenario();

    const ajeno = await solicitar(admin, documento.id);
    expect(ajeno.status).toBe(403);
    expect((await historialDe(pool, organizacion.id)).at(-1)).toMatchObject({
      accion: 'ACCESO_DENEGADO', usuario_id: ids.admin, detalle: { permiso: 'SER_PROPIETARIO', operacion: 'SOLICITAR_APROBACION' },
    });

    // Un administrador que sube su propio documento y pide aprobarlo: lo resuelve el otro, nunca él.
    const categoriaId = (await request(app).get('/api/v1/categorias').set('Authorization', `Bearer ${admin}`)).body.datos[0].id;
    const { body: suyo } = await request(app).post('/api/v1/documentos').set('Authorization', `Bearer ${admin}`)
      .field('nombre', 'Presupuesto').field('categoriaId', categoriaId).field('fechaDocumento', '2026-09-20').attach('archivo', PDF, 'p.pdf');
    const { body: propia } = await solicitar(admin, suyo.id);
    expect((await ficha(admin, suyo.id)).body.permisos.resolverSolicitud).toBe(false);
    expect((await resolver(admin, propia.id, { decision: 'aprobada' })).status).toBe(403);
    expect((await historialDe(pool, organizacion.id)).at(-1)).toMatchObject({ accion: 'ACCESO_DENEGADO', detalle: { permiso: 'NO_SER_EL_SOLICITANTE' } });
    expect((await resolver(admin2, propia.id, { decision: 'aprobada' })).status).toBe(200);

    expect((await resolver(usuario, propia.id, { decision: 'aprobada' })).status).toBe(403);
  });

  it('si el solicitante es el único administrador activo, la solicitud no se crea (RN13)', async () => {
    const { token: admin } = await registrarOrganizacion(app);
    const categoriaId = (await request(app).get('/api/v1/categorias').set('Authorization', `Bearer ${admin}`)).body.datos[0].id;
    const { body: documento } = await request(app).post('/api/v1/documentos').set('Authorization', `Bearer ${admin}`)
      .field('nombre', 'Solo yo').field('categoriaId', categoriaId).field('fechaDocumento', '2026-09-20').attach('archivo', PDF, 'a.pdf');

    const respuesta = await solicitar(admin, documento.id);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe('SIN_REVISOR');
  });

  it('el administrador ve todas las solicitudes, pendientes primero; el usuario, solo las suyas', async () => {
    const { admin, usuario, documento, organizacion } = await escenario();
    const otro = await crearUsuarioEn(pool, organizacion.id, 'usuario');
    const sesionOtro = await iniciarSesion(app, otro.email);
    const { body: primera } = await solicitar(usuario, documento.id);
    await resolver(admin, primera.id, { decision: 'aprobada' });
    await solicitar(usuario, documento.id);

    const delAdmin = await request(app).get('/api/v1/solicitudes').set('Authorization', `Bearer ${admin}`);
    expect(delAdmin.body.datos.map((s: { estado: string }) => s.estado)).toEqual(['pendiente', 'aprobada']);
    expect((await request(app).get('/api/v1/solicitudes?estado=aprobada').set('Authorization', `Bearer ${admin}`)).body.paginacion.total).toBe(1);
    expect((await request(app).get('/api/v1/solicitudes').set('Authorization', `Bearer ${usuario}`)).body.paginacion.total).toBe(2);
    expect((await request(app).get('/api/v1/solicitudes').set('Authorization', `Bearer ${sesionOtro}`)).body.paginacion.total).toBe(0);
  });

  it('las notificaciones se marcan como leídas una a una o todas, y nadie toca las de otro', async () => {
    const { admin, admin2, usuario, documento } = await escenario();
    await solicitar(usuario, documento.id);
    const { body } = await notificaciones(admin);
    const id = body.datos[0].id;

    expect((await request(app).patch(`/api/v1/notificaciones/${id}/leida`).set('Authorization', `Bearer ${admin2}`)).status).toBe(404);
    expect((await request(app).patch(`/api/v1/notificaciones/${id}/leida`).set('Authorization', `Bearer ${admin}`)).status).toBe(204);
    expect((await notificaciones(admin)).body.noLeidas).toBe(0);
    expect((await notificaciones(admin, '?soloNoLeidas=true')).body.datos).toEqual([]);
    expect((await notificaciones(admin2)).body.noLeidas).toBe(1);
    expect((await request(app).patch('/api/v1/notificaciones/leidas').set('Authorization', `Bearer ${admin2}`)).status).toBe(204);
    expect((await notificaciones(admin2)).body.noLeidas).toBe(0);
  });

  it('si notificar falla, la solicitud tampoco se crea: todo o nada (D7)', async () => {
    const { usuario, documento } = await escenario();
    await pool.query(`
      CREATE FUNCTION fallar_notificacion() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'notificaciones no disponibles'; END $$;
      CREATE TRIGGER notificaciones_rotas BEFORE INSERT ON notificaciones FOR EACH STATEMENT EXECUTE FUNCTION fallar_notificacion();
    `);
    const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await solicitar(usuario, documento.id)).status).toBe(500);
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM solicitudes WHERE documento_id = $1', [documento.id]);
      expect(rows[0].n).toBe(0);
    } finally {
      registro.mockRestore();
      await pool.query('DROP TRIGGER notificaciones_rotas ON notificaciones; DROP FUNCTION fallar_notificacion();');
    }
  });
});
