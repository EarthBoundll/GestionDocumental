import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, registrarEmpresa, UA_IPHONE } from '../apoyo/api.js';
import { PDF } from '../apoyo/archivos.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

type App = ReturnType<typeof crearAppDePruebas>;

/** El tablero del administrador (RF28): el estado de la empresa y lo que registra cada indicador. */
describe('Tablero del administrador (RF28)', () => {
  let base: BaseDePruebas;
  let pool: pg.Pool;
  let app: App;

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    pool = base.pool;
  });
  afterAll(() => base.cerrar());
  beforeEach(() => {
    app = crearAppDePruebas(pool);
  });

  const conToken = (token: string) => ({ Authorization: `Bearer ${token}` });
  const tablero = (token: string, query: Record<string, string> = {}) =>
    request(app).get('/api/v1/tablero').query(query).set(conToken(token));

  it('cuenta lo que hay y lo que pasó en el periodo, indicador por indicador', async () => {
    const { token: admin, empresa } = await registrarEmpresa(app);
    const persona = await crearUsuarioEn(pool, empresa.id);
    const usuario = await iniciarSesion(app, persona.email, { userAgent: UA_IPHONE });
    const categoriaId = (await request(app).get('/api/v1/categorias').set(conToken(admin))).body.datos[0].id;
    const subida = await request(app).post('/api/v1/documentos').set(conToken(usuario))
      .field('nombre', 'Factura 001').field('categoriaId', categoriaId).field('fechaDocumento', '2026-09-01')
      .attach('archivo', PDF, 'factura.pdf');
    await request(app).get('/api/v1/documentos').query({ q: 'factura' }).set(conToken(usuario));
    await request(app).get('/api/v1/documentos').query({ q: 'no-existe' }).set(conToken(usuario));
    await request(app).get(`/api/v1/documentos/${subida.body.id}/archivo`).set(conToken(usuario));
    await request(app).get('/api/v1/usuarios').set(conToken(usuario));

    const respuesta = await tablero(admin);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.resumen).toEqual({
      documentos: 1, enPapelera: 0, almacenamientoBytes: PDF.length, usuarios: 2, usuariosActivos: 2,
      categoriasActivas: 5, solicitudesPendientes: 0,
    });
    const { indicadores } = respuesta.body;
    expect(indicadores.organizacion).toEqual({ subidos: 1, editados: 0 });
    expect(indicadores.busqueda).toEqual({ busquedas: 2, listados: 2 });
    expect(indicadores.recuperacion).toEqual({
      documentosObtenidos: 1, visualizaciones: 1, descargas: 0, busquedasConResultado: 1, porcentajeBusquedasConResultado: 50,
    });
    expect(indicadores.accesoRemoto).toEqual({ sesionesDesdeMovil: 1, intentosDesdeMovil: 1, porcentajeExitoMovil: 100, sesiones: 2 });
    expect(indicadores.accesosPorRol).toEqual({ denegados: 1, porPermiso: [{ permiso: 'GESTIONAR_USUARIOS', total: 1 }] });
    expect(indicadores.tiempoRespuesta).toMatchObject({ mediciones: 2, servidorMediana: expect.any(Number), navegadorMediana: null });
    expect(indicadores.historial.acciones).toBe((await historialDe(pool, empresa.id)).length);
    expect(respuesta.body.actividad).toHaveLength(30);
    expect(respuesta.body.actividad.at(-1).acciones).toBe(indicadores.historial.acciones);
  });

  it('muestra el flujo de aprobación del periodo y las últimas acciones de la empresa, lo más reciente primero', async () => {
    const { token: admin, empresa } = await registrarEmpresa(app);
    const persona = await crearUsuarioEn(pool, empresa.id);
    const usuario = await iniciarSesion(app, persona.email);
    const categoriaId = (await request(app).get('/api/v1/categorias').set(conToken(admin))).body.datos[0].id;
    for (const [nombre, decision] of [['Contrato', 'aprobada'], ['Cotización', 'rechazada'], ['Factura', null]] as const) {
      const subida = await request(app).post('/api/v1/documentos').set(conToken(usuario))
        .field('nombre', nombre).field('categoriaId', categoriaId).field('fechaDocumento', '2026-09-01')
        .attach('archivo', PDF, 'documento.pdf');
      const solicitud = await request(app).post(`/api/v1/documentos/${subida.body.id}/solicitudes`).set(conToken(usuario)).send({});
      if (decision) {
        await request(app).post(`/api/v1/solicitudes/${solicitud.body.id}/resolucion`).set(conToken(admin))
          .send({ decision, comentario: decision === 'rechazada' ? 'Falta la firma' : '' });
      }
    }
    // Lo de otra empresa no aparece entre las últimas acciones.
    const otra = await registrarEmpresa(app);
    await request(app).get('/api/v1/documentos').query({ q: 'ajena' }).set(conToken(otra.token));

    const respuesta = await tablero(admin);

    expect(respuesta.body.aprobacion).toEqual({ solicitadas: 3, aprobadas: 1, rechazadas: 1 });
    expect(respuesta.body.resumen.solicitudesPendientes).toBe(1);
    const recientes = respuesta.body.recientes as { accion: string; usuario: { id: string } | null; empresa: { id: string } }[];
    expect(recientes).toHaveLength(8);
    expect(recientes.map((a) => a.accion).slice(0, 3)).toEqual(['SOLICITUD_CREADA', 'DOCUMENTO_SUBIDO', 'SOLICITUD_RECHAZADA']);
    expect(recientes.every((a) => a.empresa.id === empresa.id)).toBe(true);
  });

  it('un periodo sin actividad da ceros y porcentajes nulos, no divisiones entre cero', async () => {
    const { token: admin } = await registrarEmpresa(app);

    const respuesta = await tablero(admin, { desde: '2026-01-01', hasta: '2026-01-07' });

    expect(respuesta.body.periodo).toEqual({ desde: '2026-01-01', hasta: '2026-01-07' });
    expect(respuesta.body.indicadores.recuperacion.porcentajeBusquedasConResultado).toBeNull();
    expect(respuesta.body.indicadores.accesoRemoto.porcentajeExitoMovil).toBeNull();
    expect(respuesta.body.actividad.map((dia: { acciones: number }) => dia.acciones)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(respuesta.body.aprobacion).toEqual({ solicitadas: 0, aprobadas: 0, rechazadas: 0 });
  });

  it('valida el periodo (400) y solo lo ve el administrador (403 registrado)', async () => {
    const { token: admin, empresa } = await registrarEmpresa(app);
    const persona = await crearUsuarioEn(pool, empresa.id);

    expect((await tablero(admin, { desde: '2026-02-01', hasta: '2026-01-01' })).status).toBe(400);
    expect((await tablero(admin, { desde: '2024-01-01', hasta: '2026-01-01' })).status).toBe(400);
    expect((await tablero(await iniciarSesion(app, persona.email))).status).toBe(403);
    expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({ accion: 'ACCESO_DENEGADO', detalle: { permiso: 'VER_TABLERO' } });
  });

  it('solo cuenta lo de su empresa', async () => {
    const otra = await registrarEmpresa(app);
    await request(app).get('/api/v1/documentos').query({ q: 'algo' }).set(conToken(otra.token));
    const { token: admin } = await registrarEmpresa(app);

    const respuesta = await tablero(admin);

    expect(respuesta.body.indicadores.busqueda.busquedas).toBe(0);
    expect(respuesta.body.resumen.usuarios).toBe(1);
  });
});
