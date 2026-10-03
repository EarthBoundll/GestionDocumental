import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, registrarEmpresa, UA_IPHONE } from '../apoyo/api.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

describe('Historial: consulta y exportación (RF19, RF20)', () => {
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

  const consultar = (token: string, query = '') => request(app).get(`/api/v1/historial${query}`).set('Authorization', `Bearer ${token}`);
  const exportar = (token: string, query = '') => request(app).get(`/api/v1/historial/exportar${query}`).set('Authorization', `Bearer ${token}`);

  it('el administrador ve lo ocurrido en su empresa, lo más reciente primero, con autor y rol', async () => {
    const { token, empresa, usuario } = await registrarEmpresa(app, { userAgent: UA_IPHONE });

    const respuesta = await consultar(token);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.map((a: { accion: string }) => a.accion)).toEqual(['SESION_INICIADA', 'USUARIO_CREADO', 'EMPRESA_CREADA']);
    expect(respuesta.body.datos[0]).toMatchObject({
      usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email },
      rolUsuario: 'administrador',
      esMovil: true,
    });
    // Lo que hizo el Master con la empresa queda en su historial, pero sin los datos de su cuenta: no es de esta empresa.
    expect(respuesta.body.datos[2]).toMatchObject({ usuario: null, rolUsuario: 'master', entidad: { tipo: 'empresa', id: empresa.id } });
    expect(respuesta.body.paginacion).toEqual({ pagina: 1, porPagina: 20, total: 3 });
  });

  it('filtra por usuario, acción y entidad, y nunca muestra nada de otra empresa', async () => {
    const { token, empresa } = await registrarEmpresa(app);
    const empleado = await crearUsuarioEn(pool, empresa.id);
    await iniciarSesion(app, empleado.email);
    await request(app).post('/api/v1/auth/login').send({ email: empleado.email, clave: 'equivocada' });
    await registrarEmpresa(app);

    const delEmpleado = await consultar(token, `?usuarioId=${empleado.id}`);
    expect(delEmpleado.body.datos.map((a: { accion: string }) => a.accion)).toEqual(['SESION_FALLIDA', 'SESION_INICIADA']);
    expect((await consultar(token, '?accion=SESION_FALLIDA')).body.paginacion.total).toBe(1);
    expect((await consultar(token, `?entidadTipo=empresa&entidadId=${empresa.id}`)).body.paginacion.total).toBe(1);
    // Los tres de la creación de la empresa y del primer acceso del administrador, más los dos del empleado.
    expect((await consultar(token)).body.paginacion.total).toBe(5);
    expect((await consultar(token, '?accion=INVENTADA')).status).toBe(400);
  });

  it('las fechas del filtro son días de Lima, no de UTC (M10)', async () => {
    const { token, empresa, usuario } = await registrarEmpresa(app);
    // 2 de octubre a las 23:30 de Lima = 3 de octubre a las 04:30 UTC.
    await pool.query(
      `INSERT INTO historial (empresa_id, usuario_id, rol_usuario, accion, creado_en)
       VALUES ($1, $2, 'administrador', 'BUSQUEDA_REALIZADA', '2025-10-03T04:30:00Z')`,
      [empresa.id, usuario.id],
    );

    expect((await consultar(token, '?desde=2025-10-02&hasta=2025-10-02')).body.paginacion.total).toBe(1);
    expect((await consultar(token, '?desde=2025-10-03&hasta=2025-10-03')).body.paginacion.total).toBe(0);
  });

  it('exporta a CSV con BOM, hora de Lima y UTC, y la exportación queda registrada antes de entregarse', async () => {
    const { token, empresa } = await registrarEmpresa(app);
    await request(app).post('/api/v1/auth/login').send({ email: `nadie.${Date.now()}@ejemplo.pe`, clave: 'x' });
    await pool.query(
      `INSERT INTO historial (empresa_id, usuario_id, rol_usuario, accion, detalle)
       SELECT empresa_id, usuario_id, rol_usuario, 'BUSQUEDA_REALIZADA', $2 FROM historial WHERE empresa_id = $1 LIMIT 1`,
      [empresa.id, { filtros: { q: 'contrato, "urgente"' }, resultados: 2 }],
    );

    const respuesta = await exportar(token, '?accion=BUSQUEDA_REALIZADA');

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(respuesta.headers['content-disposition']).toMatch(/^attachment; filename="historial-\d{4}-\d{2}-\d{2}\.csv"$/);
    const texto: string = respuesta.text;
    expect(texto.startsWith('﻿id,fecha_hora_lima,fecha_hora_utc,accion,')).toBe(true);
    const lineas = texto.trim().split('\r\n');
    expect(lineas).toHaveLength(2);
    expect(lineas[1]).toMatch(/^\d+,\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{4}-.+Z,BUSQUEDA_REALIZADA,/);
    // El detalle es JSON con comas y comillas: va entre comillas y con las comillas duplicadas.
    expect(lineas[1]).toContain('"{""filtros"":{""q"":""contrato, \\""urgente\\""""},""resultados"":2}"');
    expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({
      accion: 'HISTORIAL_EXPORTADO', detalle: { filtros: { accion: 'BUSQUEDA_REALIZADA' }, filas: 1 },
    });
    // La SPA está en otro origen: si CORS no expone la cabecera, el archivo se guarda sin su nombre.
    const desdeLaSpa = await exportar(token).set('Origin', 'http://localhost:5173');
    expect(desdeLaSpa.headers['access-control-expose-headers']).toBe('Content-Disposition');
  });

  it('un usuario no consulta ni exporta: 403 registrado (indicador 6)', async () => {
    const { empresa } = await registrarEmpresa(app);
    const empleado = await crearUsuarioEn(pool, empresa.id);
    const sesion = await iniciarSesion(app, empleado.email);

    expect((await consultar(sesion)).status).toBe(403);
    expect((await exportar(sesion)).status).toBe(403);
    expect((await historialDe(pool, empresa.id)).slice(-2).map((f) => f.detalle.permiso)).toEqual(['CONSULTAR_HISTORIAL', 'CONSULTAR_HISTORIAL']);
  });
});
