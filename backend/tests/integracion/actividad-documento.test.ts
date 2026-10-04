import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, registrarEmpresa } from '../apoyo/api.js';
import { PDF } from '../apoyo/archivos.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

type App = ReturnType<typeof crearAppDePruebas>;

/**
 * La línea de tiempo de un documento (RF30): el indicador 4 visto desde la ficha. Sale del historial, así
 * que se prueba que muestre lo que pasó, a quién se lo muestra y que no abra una puerta a lo que no se ve.
 */
describe('Actividad de un documento (RF30, indicador 4)', () => {
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
  const actividad = (token: string, id: string, query: Record<string, string> = {}) =>
    request(app).get(`/api/v1/documentos/${id}/actividad`).query(query).set(conToken(token));
  const acciones = (respuesta: request.Response) => (respuesta.body.datos as { accion: string }[]).map((a) => a.accion);

  async function subir(token: string, nombre: string, categoriaId?: string) {
    const categoria = categoriaId
      ?? (await request(app).get('/api/v1/categorias').set(conToken(token))).body.datos[0].id as string;
    const respuesta = await request(app).post('/api/v1/documentos').set(conToken(token))
      .field('nombre', nombre).field('categoriaId', categoria).field('fechaDocumento', '2026-09-01')
      .attach('archivo', PDF, 'documento.pdf');
    expect(respuesta.status).toBe(201);
    return respuesta.body.id as string;
  }

  /**
   * Una empresa donde una persona sube un contrato, lo corrige y pide aprobarlo; la administradora lo ve
   * y lo aprueba, y una compañera intenta editarlo sin poder.
   */
  async function crearEscenario() {
    const { token: admin, empresa } = await registrarEmpresa(app);
    const autora = await crearUsuarioEn(pool, empresa.id);
    const companera = await crearUsuarioEn(pool, empresa.id);
    const tokenAutora = await iniciarSesion(app, autora.email);
    const tokenCompanera = await iniciarSesion(app, companera.email);

    const documentoId = await subir(tokenAutora, 'Contrato de alquiler');
    await subir(tokenAutora, 'Otro documento');
    expect((await request(app).patch(`/api/v1/documentos/${documentoId}`).set(conToken(tokenAutora))
      .send({ nombre: 'Contrato de alquiler 2026' })).status).toBe(200);
    expect((await request(app).get(`/api/v1/documentos/${documentoId}/archivo`).query({ modo: 'ver' })
      .set(conToken(admin))).status).toBe(200);
    const solicitud = await request(app).post(`/api/v1/documentos/${documentoId}/solicitudes`).set(conToken(tokenAutora))
      .send({ comentario: 'Listo para revisar' });
    expect(solicitud.status).toBe(201);
    expect((await request(app).post(`/api/v1/solicitudes/${solicitud.body.id}/resolucion`).set(conToken(admin))
      .send({ decision: 'aprobada', comentario: 'Conforme' })).status).toBe(200);
    expect((await request(app).patch(`/api/v1/documentos/${documentoId}`).set(conToken(tokenCompanera))
      .send({ nombre: 'Cambio ajeno' })).status).toBe(403);

    return { admin, empresa, autora: { ...autora, token: tokenAutora }, tokenCompanera, documentoId };
  }

  it('una persona ve el ciclo de vida, lo más reciente primero, con quién hizo cada cosa', async () => {
    const { autora, documentoId } = await crearEscenario();

    const respuesta = await actividad(autora.token, documentoId);

    expect(respuesta.status).toBe(200);
    expect(acciones(respuesta)).toEqual(['SOLICITUD_APROBADA', 'SOLICITUD_CREADA', 'DOCUMENTO_EDITADO', 'DOCUMENTO_SUBIDO']);
    const subida = respuesta.body.datos.at(-1);
    expect(subida).toMatchObject({ usuario: { id: autora.id }, rolUsuario: 'usuario', detalle: { nombre: 'Contrato de alquiler' } });
    // Nombre sí, correo no: la ficha la ven todos los de la empresa.
    expect(subida.usuario).not.toHaveProperty('email');
    expect(respuesta.body.datos[0].detalle).toMatchObject({ comentario: 'Conforme' });
    expect(respuesta.body.paginacion).toMatchObject({ pagina: 1, total: 4 });
  });

  it('a quien consulta el historial le muestra además quién lo vio y quién intentó lo que no podía', async () => {
    const { admin, documentoId } = await crearEscenario();

    const respuesta = await actividad(admin, documentoId);

    expect(acciones(respuesta)).toEqual([
      'ACCESO_DENEGADO', 'SOLICITUD_APROBADA', 'SOLICITUD_CREADA', 'DOCUMENTO_VISUALIZADO', 'DOCUMENTO_EDITADO', 'DOCUMENTO_SUBIDO',
    ]);
  });

  it('pagina, y no mezcla la actividad de otros documentos', async () => {
    const { admin, documentoId } = await crearEscenario();

    const respuesta = await actividad(admin, documentoId, { porPagina: '2', pagina: '3' });

    expect(acciones(respuesta)).toEqual(['DOCUMENTO_EDITADO', 'DOCUMENTO_SUBIDO']);
    expect(respuesta.body.paginacion).toEqual({ pagina: 3, porPagina: 2, total: 6 });
    expect(respuesta.body.datos.every((a: { detalle: { nombre?: string } }) => a.detalle.nombre !== 'Otro documento')).toBe(true);
  });

  it('consultarla no se registra, igual que ver la ficha', async () => {
    const { admin, empresa, documentoId } = await crearEscenario();
    const antes = (await historialDe(pool, empresa.id)).length;

    await actividad(admin, documentoId);

    expect((await historialDe(pool, empresa.id)).length).toBe(antes);
  });

  it('otra empresa recibe 404, como si no existiera, y no queda nada en su historial', async () => {
    const { documentoId } = await crearEscenario();
    const { token: ajena, empresa: otra } = await registrarEmpresa(app);
    const antes = (await historialDe(pool, otra.id)).length;

    const respuesta = await actividad(ajena, documentoId);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.datos).toBeUndefined();
    expect((await historialDe(pool, otra.id)).length).toBe(antes);
  });

  it('no deja ver la actividad de un documento de una categoría restringida a quien no tiene acceso', async () => {
    const { admin, tokenCompanera } = await crearEscenario();
    const categoria = await request(app).post('/api/v1/categorias').set(conToken(admin))
      .send({ nombre: 'Planillas', restringida: true, usuariosAutorizados: [] });
    const restringido = await subir(admin, 'Planilla de septiembre', categoria.body.id);

    expect((await actividad(tokenCompanera, restringido)).status).toBe(404);
    expect(acciones(await actividad(admin, restringido))).toEqual(['DOCUMENTO_SUBIDO']);
  });

  it('un documento en la papelera ya no tiene ficha ni actividad', async () => {
    const { autora, documentoId } = await crearEscenario();
    const otro = await subir(autora.token, 'Borrador');
    expect((await request(app).delete(`/api/v1/documentos/${otro}`).set(conToken(autora.token))).status).toBe(204);

    expect((await actividad(autora.token, otro)).status).toBe(404);
    expect((await actividad(autora.token, documentoId)).status).toBe(200);
  });
});
