import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, registrarEmpresa } from '../apoyo/api.js';
import { PDF } from '../apoyo/archivos.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

type App = ReturnType<typeof crearAppDePruebas>;

/**
 * Categorías restringidas (RF25): dentro de una misma empresa, una categoría puede quedar solo para
 * los administradores y las personas que ellos autoricen. Lo decide la base (D22), así que se prueba
 * por todas las vías que llevan a un documento: listado, búsqueda, detalle, archivo y subida.
 */
describe('Permisos por categoría (RF25, indicador 6)', () => {
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
  const crearCategoria = (token: string, cuerpo: object) => request(app).post('/api/v1/categorias').set(conToken(token)).send(cuerpo);
  const editarCategoria = (token: string, id: string, cuerpo: object) =>
    request(app).patch(`/api/v1/categorias/${id}`).set(conToken(token)).send(cuerpo);
  const categorias = async (token: string) =>
    (await request(app).get('/api/v1/categorias').set(conToken(token))).body.datos as { id: string; nombre: string; documentos: number }[];
  const documentos = async (token: string, query: Record<string, string> = {}) =>
    (await request(app).get('/api/v1/documentos').query(query).set(conToken(token))).body.datos as { id: string; nombre: string }[];

  function subir(token: string, categoriaId: string, nombre: string) {
    return request(app).post('/api/v1/documentos').set(conToken(token))
      .field('nombre', nombre).field('categoriaId', categoriaId).field('fechaDocumento', '2026-09-01')
      .attach('archivo', PDF, 'documento.pdf');
  }

  /** Una empresa con su administrador, una persona autorizada y otra que no lo está. */
  async function crearEscenario() {
    const { token: admin, empresa } = await registrarEmpresa(app);
    const autorizada = await crearUsuarioEn(pool, empresa.id);
    const ajena = await crearUsuarioEn(pool, empresa.id);
    const categoria = await crearCategoria(admin, { nombre: 'Planillas', restringida: true, usuariosAutorizados: [autorizada.id] });
    expect(categoria.status).toBe(201);
    const documento = await subir(admin, categoria.body.id, 'Planilla de septiembre');
    expect(documento.status).toBe(201);
    return {
      admin,
      empresa,
      autorizada: { ...autorizada, token: await iniciarSesion(app, autorizada.email) },
      ajena: { ...ajena, token: await iniciarSesion(app, ajena.email) },
      categoriaId: categoria.body.id as string,
      documentoId: documento.body.id as string,
    };
  }

  it('el administrador crea una categoría restringida con sus personas autorizadas, y queda registrado', async () => {
    const { empresa, categoriaId, autorizada, admin } = await crearEscenario();

    const vista = (await categorias(admin)).find((c) => c.id === categoriaId);
    expect(vista).toMatchObject({ nombre: 'Planillas', restringida: true, usuariosAutorizados: [autorizada.id], documentos: 1 });
    const creada = (await historialDe(pool, empresa.id)).find((fila) => fila.accion === 'CATEGORIA_CREADA' && fila.entidad_id === categoriaId);
    expect(creada?.detalle).toEqual({ nombre: 'Planillas', restringida: true, autorizados: [expect.stringMatching(/^Persona /)] });
  });

  it('quien no está autorizado no la ve en las categorías, ni sus documentos en el listado ni en la búsqueda', async () => {
    const { ajena, autorizada, categoriaId } = await crearEscenario();

    expect((await categorias(ajena.token)).map((c) => c.id)).not.toContain(categoriaId);
    expect(await documentos(ajena.token)).toEqual([]);
    expect(await documentos(ajena.token, { q: 'planilla' })).toEqual([]);
    expect(await documentos(ajena.token, { categoriaId })).toEqual([]);

    expect((await categorias(autorizada.token)).find((c) => c.id === categoriaId)).toMatchObject({ documentos: 1, usuariosAutorizados: [] });
    expect((await documentos(autorizada.token)).map((d) => d.nombre)).toEqual(['Planilla de septiembre']);
  });

  it('para quien no está autorizado el documento no existe: ni detalle, ni archivo, ni edición (404)', async () => {
    const { ajena, autorizada, documentoId } = await crearEscenario();
    const ruta = `/api/v1/documentos/${documentoId}`;

    expect((await request(app).get(ruta).set(conToken(ajena.token))).status).toBe(404);
    expect((await request(app).get(`${ruta}/archivo`).set(conToken(ajena.token))).status).toBe(404);
    expect((await request(app).patch(ruta).set(conToken(ajena.token)).send({ nombre: 'Otro' })).status).toBe(404);
    expect((await request(app).delete(ruta).set(conToken(ajena.token))).status).toBe(404);

    expect((await request(app).get(ruta).set(conToken(autorizada.token))).status).toBe(200);
    expect((await request(app).get(`${ruta}/archivo`).set(conToken(autorizada.token))).status).toBe(200);
  });

  it('no se puede subir a una categoría restringida sin acceso: para esa persona no existe (400)', async () => {
    const { ajena, autorizada, categoriaId } = await crearEscenario();

    const rechazada = await subir(ajena.token, categoriaId, 'Intento');
    expect(rechazada.status).toBe(400);
    expect(rechazada.body.error.detalles).toEqual([{ campo: 'categoriaId', mensaje: 'La categoría no existe' }]);
    expect((await subir(autorizada.token, categoriaId, 'Planilla de octubre')).status).toBe(201);
  });

  it('dar y quitar acceso surte efecto en la siguiente petición, y el historial dice a quién', async () => {
    const { admin, empresa, ajena, autorizada, categoriaId } = await crearEscenario();

    const cambio = await editarCategoria(admin, categoriaId, { usuariosAutorizados: [ajena.id] });
    expect(cambio.status).toBe(200);
    expect(cambio.body.usuariosAutorizados).toEqual([ajena.id]);

    expect(await documentos(autorizada.token)).toEqual([]);
    expect((await documentos(ajena.token)).map((d) => d.nombre)).toEqual(['Planilla de septiembre']);
    const editada = (await historialDe(pool, empresa.id)).filter((fila) => fila.accion === 'CATEGORIA_EDITADA').at(-1);
    expect(editada?.detalle).toEqual({
      cambios: {},
      accesos: { anadidos: [expect.stringMatching(/^Persona /)], quitados: [expect.stringMatching(/^Persona /)] },
    });
  });

  it('al abrir la categoría la ven todos y sus accesos se borran: si se vuelve a restringir, empieza de cero', async () => {
    const { admin, ajena, autorizada, categoriaId } = await crearEscenario();

    const abierta = await editarCategoria(admin, categoriaId, { restringida: false });
    expect(abierta.body).toMatchObject({ restringida: false, usuariosAutorizados: [] });
    expect(await documentos(ajena.token)).toHaveLength(1);

    const cerrada = await editarCategoria(admin, categoriaId, { restringida: true });
    expect(cerrada.body).toMatchObject({ restringida: true, usuariosAutorizados: [] });
    expect(await documentos(autorizada.token)).toEqual([]);
  });

  it('la restricción manda sobre la autoría: quien subió el documento deja de verlo si no está autorizado', async () => {
    const { token: admin, empresa } = await registrarEmpresa(app);
    const persona = await crearUsuarioEn(pool, empresa.id);
    const token = await iniciarSesion(app, persona.email);
    const categoria = await crearCategoria(admin, { nombre: 'Contratos laborales' });
    expect((await subir(token, categoria.body.id, 'Mi contrato')).status).toBe(201);

    await editarCategoria(admin, categoria.body.id, { restringida: true });

    expect(await documentos(token)).toEqual([]);
  });

  it('solo se autoriza a personas de la propia empresa (400), y un usuario no cambia accesos (403)', async () => {
    const { admin, autorizada, categoriaId } = await crearEscenario();
    const otra = await registrarEmpresa(app);

    const ajenaALaEmpresa = await editarCategoria(admin, categoriaId, { usuariosAutorizados: [otra.usuario.id] });
    expect(ajenaALaEmpresa.status).toBe(400);
    expect(ajenaALaEmpresa.body.error.detalles).toEqual([
      { campo: 'usuariosAutorizados', mensaje: 'Alguna de las personas no pertenece a tu empresa' },
    ]);
    expect((await editarCategoria(autorizada.token, categoriaId, { usuariosAutorizados: [autorizada.id] })).status).toBe(403);
  });
});
