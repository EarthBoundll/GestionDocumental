import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, registrarEmpresa } from '../apoyo/api.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

describe('Categorías (RF06)', () => {
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

  async function crearEmpresa() {
    const { token: admin, empresa } = await registrarEmpresa(app);
    const empleado = await crearUsuarioEn(pool, empresa.id, 'usuario');
    return { admin, usuario: await iniciarSesion(app, empleado.email), empleadoId: empleado.id, empresa };
  }
  const listar = (token: string, query = '') => request(app).get(`/api/v1/categorias${query}`).set('Authorization', `Bearer ${token}`);
  const crear = (token: string, cuerpo: object) => request(app).post('/api/v1/categorias').set('Authorization', `Bearer ${token}`).send(cuerpo);
  const editar = (token: string, id: string, cuerpo: object) =>
    request(app).patch(`/api/v1/categorias/${id}`).set('Authorization', `Bearer ${token}`).send(cuerpo);

  it('cualquier usuario ve las activas, ordenadas sin que las tildes alteren el orden', async () => {
    const { admin, usuario } = await crearEmpresa();
    await crear(admin, { nombre: 'Área legal' });

    const respuesta = await listar(usuario);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.map((c: { nombre: string }) => c.nombre))
      .toEqual(['Área legal', 'Contratos', 'Cotizaciones', 'Facturas y boletas', 'Otros', 'Recursos humanos']);
    expect(respuesta.body.datos[0]).toEqual({ id: expect.any(String), nombre: 'Área legal', descripcion: null, activa: true, documentos: 0 });
  });

  it('el administrador crea, renombra y desactiva, y cada cambio queda registrado', async () => {
    const { admin, empresa } = await crearEmpresa();

    const creada = await crear(admin, { nombre: 'Planillas', descripcion: '  ' });
    expect(creada.status).toBe(201);
    expect(creada.body).toMatchObject({ nombre: 'Planillas', descripcion: null, activa: true });

    const editada = await editar(admin, creada.body.id, { nombre: 'Planillas de pago', activa: false });
    expect(editada.status).toBe(200);
    expect(editada.body).toMatchObject({ nombre: 'Planillas de pago', activa: false });

    expect((await listar(admin)).body.datos.map((c: { nombre: string }) => c.nombre)).not.toContain('Planillas de pago');
    expect((await listar(admin, '?incluirInactivas=true')).body.datos.map((c: { nombre: string }) => c.nombre)).toContain('Planillas de pago');
    expect((await historialDe(pool, empresa.id)).slice(-2)).toEqual([
      expect.objectContaining({ accion: 'CATEGORIA_CREADA', entidad_id: creada.body.id, detalle: { nombre: 'Planillas' } }),
      expect.objectContaining({ accion: 'CATEGORIA_EDITADA', detalle: { cambios: {
        nombre: { antes: 'Planillas', despues: 'Planillas de pago' }, activa: { antes: true, despues: false },
      } } }),
    ]);
  });

  it('no admite dos con el mismo nombre en la empresa, ni al crear ni al renombrar (RN08)', async () => {
    const { admin } = await crearEmpresa();
    const otra = await crear(admin, { nombre: 'Proveedores' });

    expect((await crear(admin, { nombre: 'CONTRATOS' })).body.error.codigo).toBe('CATEGORIA_DUPLICADA');
    const renombrada = await editar(admin, otra.body.id, { nombre: 'contratos' });
    expect(renombrada.status).toBe(409);
    expect(renombrada.body.error.codigo).toBe('CATEGORIA_DUPLICADA');
  });

  it('un usuario no crea, no edita ni ve las inactivas: 403 registrado cada vez (indicador 6)', async () => {
    const { usuario, empleadoId, empresa, admin } = await crearEmpresa();
    const id = (await listar(admin)).body.datos[0].id;

    expect((await crear(usuario, { nombre: 'Mía' })).status).toBe(403);
    expect((await editar(usuario, id, { nombre: 'Cambiada' })).status).toBe(403);
    expect((await listar(usuario, '?incluirInactivas=true')).status).toBe(403);
    const denegados = (await historialDe(pool, empresa.id)).filter((fila) => fila.accion === 'ACCESO_DENEGADO');
    expect(denegados.map((fila) => [fila.usuario_id, fila.detalle.permiso])).toEqual([
      [empleadoId, 'GESTIONAR_CATEGORIAS'],
      [empleadoId, 'GESTIONAR_CATEGORIAS'],
      [empleadoId, 'VER_CATEGORIAS_INACTIVAS'],
    ]);
  });

  it('una categoría de otra empresa no existe para el administrador', async () => {
    const { admin } = await crearEmpresa();
    const ajena = await crearEmpresa();
    const idAjeno = (await listar(ajena.admin)).body.datos[0].id;

    expect((await editar(admin, idAjeno, { nombre: 'Robada' })).status).toBe(404);
  });

  it('un cambio sin campos responde 400', async () => {
    const { admin } = await crearEmpresa();
    const id = (await listar(admin)).body.datos[0].id;

    const respuesta = await editar(admin, id, {});

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalles).toEqual([{ campo: '', mensaje: 'Indica al menos un cambio' }]);
  });
});
