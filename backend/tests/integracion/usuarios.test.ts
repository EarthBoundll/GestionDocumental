import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CLAVE, crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, registrarEmpresa } from '../apoyo/api.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

describe('Gestión de usuarios (RF13, RF14)', () => {
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

  const conToken = (token: string) => ({
    listar: (query = '') => request(app).get(`/api/v1/usuarios${query}`).set('Authorization', `Bearer ${token}`),
    crear: (cuerpo: object) => request(app).post('/api/v1/usuarios').set('Authorization', `Bearer ${token}`).send(cuerpo),
    editar: (id: string, cuerpo: object) => request(app).patch(`/api/v1/usuarios/${id}`).set('Authorization', `Bearer ${token}`).send(cuerpo),
    estado: (id: string, activo: boolean) => request(app).patch(`/api/v1/usuarios/${id}/estado`).set('Authorization', `Bearer ${token}`).send({ activo }),
  });
  const yo = (token: string) => request(app).get('/api/v1/auth/yo').set('Authorization', `Bearer ${token}`);

  it('el administrador crea un usuario que puede entrar de inmediato, y queda registrado sin la contraseña', async () => {
    const { token, empresa } = await registrarEmpresa(app);
    const email = `nuevo.${Date.now()}@ejemplo.pe`;

    const respuesta = await conToken(token).crear({ nombre: 'Luis Quispe', email: email.toUpperCase(), dni: '45678912', clave: CLAVE, rol: 'usuario' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toEqual({ id: expect.any(String), nombre: 'Luis Quispe', email, rol: 'usuario', dni: '45678912', activo: true, creadoEn: expect.any(String) });
    expect(await iniciarSesion(app, email)).toMatch(/^ey/);
    const creado = (await historialDe(pool, empresa.id)).find((fila) => fila.accion === 'USUARIO_CREADO' && fila.entidad_id === respuesta.body.id);
    expect(creado).toMatchObject({ entidad_id: respuesta.body.id, detalle: { nombre: 'Luis Quispe', email, rol: 'usuario' } });
    expect(JSON.stringify(creado)).not.toContain(CLAVE);
  });

  it('lista solo los de su empresa, con búsqueda por nombre o correo y filtros', async () => {
    const { token, empresa } = await registrarEmpresa(app);
    await conToken(token).crear({ nombre: 'Rocío Ñahui', email: `rocio.${Date.now()}@ejemplo.pe`, clave: CLAVE, rol: 'usuario' });
    const inactivo = await crearUsuarioEn(pool, empresa.id);
    await conToken(token).estado(inactivo.id, false);
    await registrarEmpresa(app);

    const todos = await conToken(token).listar();
    expect(todos.body.paginacion.total).toBe(3);
    expect((await conToken(token).listar('?q=rocio nahui')).body.datos.map((u: { nombre: string }) => u.nombre)).toEqual(['Rocío Ñahui']);
    expect((await conToken(token).listar('?activo=false')).body.datos.map((u: { id: string }) => u.id)).toEqual([inactivo.id]);
    expect((await conToken(token).listar('?rol=administrador')).body.paginacion.total).toBe(1);
  });

  it('cambia nombre y rol, registra solo lo que cambió, y el rol vale desde la siguiente petición (RN05)', async () => {
    const { token, empresa } = await registrarEmpresa(app);
    const empleado = await crearUsuarioEn(pool, empresa.id);
    const suSesion = await iniciarSesion(app, empleado.email);

    const respuesta = await conToken(token).editar(empleado.id, { nombre: 'Ana María', rol: 'administrador' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ nombre: 'Ana María', rol: 'administrador' });
    expect((await yo(suSesion)).body.usuario.rol).toBe('administrador');
    expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({
      accion: 'USUARIO_EDITADO', entidad_id: empleado.id,
      detalle: { cambios: { nombre: { despues: 'Ana María' }, rol: { antes: 'usuario', despues: 'administrador' } } },
    });
  });

  it('restablecer la contraseña cierra las sesiones del usuario y lo registra sin la clave', async () => {
    const { token, empresa } = await registrarEmpresa(app);
    const empleado = await crearUsuarioEn(pool, empresa.id);
    const suSesion = await iniciarSesion(app, empleado.email);
    const nueva = 'restablecida-por-el-admin';

    expect((await conToken(token).editar(empleado.id, { clave: nueva })).status).toBe(200);

    expect((await yo(suSesion)).status).toBe(401);
    expect(await iniciarSesion(app, empleado.email, { clave: nueva })).toMatch(/^ey/);
    const asiento = (await historialDe(pool, empresa.id)).find((fila) => fila.accion === 'USUARIO_EDITADO');
    expect(asiento?.detalle).toEqual({ cambios: {}, claveRestablecida: true, sesionesCerradas: 1 });
  });

  it('desactivar cierra sus sesiones al instante y le impide entrar; reactivar lo devuelve (RN04)', async () => {
    const { token, empresa } = await registrarEmpresa(app);
    const empleado = await crearUsuarioEn(pool, empresa.id);
    const suSesion = await iniciarSesion(app, empleado.email);

    const desactivado = await conToken(token).estado(empleado.id, false);

    expect(desactivado.body.activo).toBe(false);
    expect((await yo(suSesion)).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: empleado.email, clave: CLAVE })).status).toBe(403);
    expect((await conToken(token).estado(empleado.id, true)).body.activo).toBe(true);
    expect(await iniciarSesion(app, empleado.email)).toMatch(/^ey/);
    expect((await historialDe(pool, empresa.id)).filter((f) => f.entidad_id === empleado.id).map((f) => [f.accion, f.detalle.sesionesCerradas]))
      .toEqual([['USUARIO_DESACTIVADO', 1], ['USUARIO_REACTIVADO', 0]]);
  });

  it('un administrador no cambia su propio rol ni se desactiva: la empresa nunca queda sin administrador (RN03)', async () => {
    const { token, usuario } = await registrarEmpresa(app);

    const degradarse = await conToken(token).editar(usuario.id, { rol: 'usuario' });
    const desactivarse = await conToken(token).estado(usuario.id, false);

    expect(degradarse.status).toBe(409);
    expect(degradarse.body.error.codigo).toBe('OPERACION_SOBRE_SI_MISMO');
    expect(desactivarse.status).toBe(409);
    expect((await conToken(token).editar(usuario.id, { nombre: 'Me puedo renombrar' })).status).toBe(200);
  });

  it('el correo repetido responde 409; un usuario sin permiso, 403 registrado; un id ajeno, 404', async () => {
    const { token, empresa, usuario: admin } = await registrarEmpresa(app);
    const empleado = await crearUsuarioEn(pool, empresa.id);
    const sesionEmpleado = await iniciarSesion(app, empleado.email);
    const ajena = await registrarEmpresa(app);

    expect((await conToken(token).crear({ nombre: 'Copia', email: admin.email, clave: CLAVE, rol: 'usuario' })).body.error.codigo).toBe('EMAIL_EN_USO');
    expect((await conToken(sesionEmpleado).listar()).status).toBe(403);
    expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({ accion: 'ACCESO_DENEGADO', detalle: { permiso: 'GESTIONAR_USUARIOS' } });
    expect((await conToken(ajena.token).editar(empleado.id, { nombre: 'Intruso' })).status).toBe(404);
  });
});
