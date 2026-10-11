import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accesoDeEmpresa } from '../../src/db/acceso.js';
import {
  CLAVE, CorreoDePruebas, crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, registrarEmpresa, tokenDelMaster,
  tokenDelUltimoEnlace,
} from '../apoyo/api.js';
import { PDF } from '../apoyo/archivos.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

/**
 * La baja de una cuenta (D46): «Eliminar» en la pantalla de usuarios. Es para siempre, pero no borra su traza:
 * sus documentos, sus solicitudes y el historial la siguen nombrando.
 */
describe('Baja de cuentas (D46)', () => {
  let base: BaseDePruebas;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearAppDePruebas>;
  const correo = new CorreoDePruebas();

  const con = (token: string) => ({ Authorization: `Bearer ${token}` });
  const eliminar = (token: string, id: string) => request(app).delete(`/api/v1/usuarios/${id}`).set(con(token));
  const listar = (token: string, query = '') => request(app).get(`/api/v1/usuarios${query}`).set(con(token));
  const yo = (token: string) => request(app).get('/api/v1/auth/yo').set(con(token));
  const fila = async (id: string) => (await pool.query(
    'SELECT activo, email, dni, clave_hash, eliminado_en, nombre FROM usuarios WHERE id = $1', [id])).rows[0];

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    pool = base.pool;
    app = crearAppDePruebas(pool, {}, undefined, correo);
  });
  afterAll(() => base.cerrar());

  it('el administrador da de baja a alguien con documentos y solicitudes: desaparece, no entra, y su traza sigue entendiéndose', async () => {
    const { token, empresa } = await registrarEmpresa(app);
    const ana = await crearUsuarioEn(pool, empresa.id);
    await pool.query("UPDATE usuarios SET dni = '45678912' WHERE id = $1", [ana.id]);
    const tokenAna = await iniciarSesion(app, ana.email);
    const categorias = (await request(app).get('/api/v1/categorias').set(con(tokenAna))).body.datos as { id: string; nombre: string }[];
    const subido = await request(app).post('/api/v1/documentos').set(con(tokenAna))
      .field('nombre', 'Contrato de Ana').field('categoriaId', categorias[0]!.id).field('fechaDocumento', '2026-09-15')
      .attach('archivo', PDF, 'contrato.pdf');
    expect(subido.status).toBe(201);
    const solicitud = await request(app).post(`/api/v1/documentos/${subido.body.id}/solicitudes`).set(con(tokenAna)).send({});
    expect(solicitud.status).toBe(201);

    const respuesta = await eliminar(token, ana.id);

    expect(respuesta.status).toBe(204);
    // Ya no está, ni entre los activos ni entre los desactivados.
    const activos = (await listar(token)).body.datos.map((u: { id: string }) => u.id);
    const desactivados = (await listar(token, '?activo=false')).body.datos.map((u: { id: string }) => u.id);
    expect([...activos, ...desactivados]).not.toContain(ana.id);
    // Su sesión abierta deja de servir en ese momento, y con su correo ya no se entra.
    expect((await yo(tokenAna)).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: ana.email, clave: CLAVE })).status).toBe(401);
    // De la fila queda lo necesario para leer su traza: el nombre. Correo, DNI y contraseña se borran.
    expect(await fila(ana.id)).toMatchObject({ activo: false, email: null, dni: null, clave_hash: null, nombre: expect.any(String) });
    // Su documento sigue con su autor, y su solicitud pendiente se puede resolver: nada queda huérfano.
    const documento = await request(app).get(`/api/v1/documentos/${subido.body.id}`).set(con(token));
    expect(documento.body.subidoPor).toEqual({ id: ana.id, nombre: expect.any(String) });
    expect((await request(app).post(`/api/v1/solicitudes/${solicitud.body.id}/resolucion`).set(con(token))
      .send({ decision: 'aprobada' })).status).toBe(200);
    // El historial dice quién fue, aunque la cuenta ya no tenga correo.
    const historial = (await request(app).get('/api/v1/historial').query({ usuarioId: ana.id }).set(con(token))).body.datos;
    expect(historial.find((asiento: { accion: string }) => asiento.accion === 'DOCUMENTO_SUBIDO').usuario)
      .toEqual({ id: ana.id, nombre: expect.any(String), email: null });
    // Y la baja queda registrada una vez, por quien la hizo, sin datos de contacto.
    const bajas = (await historialDe(pool, empresa.id)).filter((asiento) => asiento.accion === 'USUARIO_ELIMINADO');
    expect(bajas).toHaveLength(1);
    expect(bajas[0]).toMatchObject({ entidad_tipo: 'usuario', entidad_id: ana.id, detalle: { rol: 'usuario', sesionesCerradas: 1 } });
    expect(JSON.stringify(bajas[0]!.detalle)).not.toContain(ana.email);
  });

  it('es definitivo: no se reactiva, no se edita, no se le reenvía nada; su correo queda libre para otra invitación', async () => {
    const { token, empresa } = await registrarEmpresa(app);
    const persona = await crearUsuarioEn(pool, empresa.id);
    expect((await eliminar(token, persona.id)).status).toBe(204);

    expect((await request(app).patch(`/api/v1/usuarios/${persona.id}/estado`).set(con(token)).send({ activo: true })).status).toBe(404);
    expect((await request(app).patch(`/api/v1/usuarios/${persona.id}`).set(con(token)).send({ nombre: 'Otra' })).status).toBe(404);
    expect((await request(app).post(`/api/v1/usuarios/${persona.id}/invitacion`).set(con(token))).status).toBe(404);
    expect((await eliminar(token, persona.id)).status).toBe(404);
    // La base tampoco deja reactivarla, aunque alguien lo intente sin pasar por la API.
    await expect(pool.query('UPDATE usuarios SET activo = true WHERE id = $1', [persona.id])).rejects.toMatchObject({ code: '23514' });
    const otra = await request(app).post('/api/v1/usuarios').set(con(token)).send({ nombre: 'De nuevo', email: persona.email, rol: 'usuario' });
    expect(otra.status).toBe(201);
  });

  it('una invitación que nunca se aceptó también se elimina, y su enlace deja de servir', async () => {
    const { token } = await registrarEmpresa(app);
    const email = `invitada.${Date.now()}@ejemplo.pe`;
    const creada = await request(app).post('/api/v1/usuarios').set(con(token)).send({ nombre: 'Invitada', email, rol: 'usuario' });
    const enlace = tokenDelUltimoEnlace(correo, email);

    expect((await eliminar(token, creada.body.id)).status).toBe(204);

    const activacion = await request(app).post('/api/v1/auth/activacion').send({ token: enlace, claveNueva: CLAVE });
    expect(activacion.status).toBe(400);
  });

  it('un usuario sin permiso no elimina a nadie, y el intento queda registrado (indicador 6)', async () => {
    const { empresa } = await registrarEmpresa(app);
    const empleado = await crearUsuarioEn(pool, empresa.id);
    const companero = await crearUsuarioEn(pool, empresa.id);
    const tokenEmpleado = await iniciarSesion(app, empleado.email);

    expect((await eliminar(tokenEmpleado, companero.id)).status).toBe(403);
    expect((await fila(companero.id)).eliminado_en).toBeNull();
    expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({ accion: 'ACCESO_DENEGADO', usuario_id: empleado.id });
  });

  it('nadie se elimina a sí mismo: la empresa nunca se queda sin el administrador que actúa', async () => {
    const { token, usuario, empresa } = await registrarEmpresa(app);

    const respuesta = await eliminar(token, usuario.id);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe('OPERACION_SOBRE_SI_MISMO');
    expect((await yo(token)).status).toBe(200);
    expect((await historialDe(pool, empresa.id)).some((asiento) => asiento.accion === 'USUARIO_ELIMINADO')).toBe(false);
  });

  it('ni a alguien de otra empresa ni al Master: para la empresa no existen (404) y nada cambia', async () => {
    const a = await registrarEmpresa(app);
    const b = await registrarEmpresa(app);
    await tokenDelMaster(app);
    const { rows: [master] } = await pool.query<{ id: string }>("SELECT id FROM usuarios WHERE rol = 'master'");

    expect((await eliminar(a.token, b.usuario.id)).status).toBe(404);
    expect((await eliminar(a.token, master!.id)).status).toBe(404);
    expect((await fila(b.usuario.id)).eliminado_en).toBeNull();
    expect((await fila(master!.id)).eliminado_en).toBeNull();
    expect((await yo(b.token)).status).toBe(200);
  });

  it('la base decide igual que la API: solo un administrador, en su empresa y nunca sobre sí mismo', async () => {
    const { usuario: admin, empresa } = await registrarEmpresa(app);
    const otra = await registrarEmpresa(app);
    const empleado = await crearUsuarioEn(pool, empresa.id);
    const darDeBaja = (identidad: { usuarioId: string; rol: 'administrador' | 'usuario' }, empresaId: string, id: string) =>
      accesoDeEmpresa(pool, empresaId, identidad).ejecutar(async (db) =>
        (await db.query<{ nombre: string | null }>('SELECT dar_de_baja_usuario($1) AS nombre', [id])).rows[0]!.nombre);

    await expect(darDeBaja({ usuarioId: empleado.id, rol: 'usuario' }, empresa.id, admin.id)).rejects.toMatchObject({ code: '42501' });
    await expect(darDeBaja({ usuarioId: admin.id, rol: 'administrador' }, empresa.id, admin.id)).rejects.toMatchObject({ code: '42501' });
    expect(await darDeBaja({ usuarioId: admin.id, rol: 'administrador' }, empresa.id, otra.usuario.id)).toBeNull();
    expect((await fila(otra.usuario.id)).eliminado_en).toBeNull();
    // La aplicación sigue sin poder escribir correos ni la marca de baja por su cuenta.
    await expect(accesoDeEmpresa(pool, empresa.id, { usuarioId: admin.id, rol: 'administrador' }).ejecutar((db) =>
      db.query('UPDATE usuarios SET email = NULL, eliminado_en = now() WHERE id = $1', [empleado.id]))).rejects.toMatchObject({ code: '42501' });
  });

  it('sus permisos en categorías restringidas se van con ella, y las cifras dejan de contarla', async () => {
    const { token, empresa } = await registrarEmpresa(app);
    const persona = await crearUsuarioEn(pool, empresa.id);
    const categoria = await request(app).post('/api/v1/categorias').set(con(token))
      .send({ nombre: 'Planillas', restringida: true, usuariosAutorizados: [persona.id] });
    const antes = (await request(app).get('/api/v1/tablero').set(con(token))).body.resumen;
    expect(antes).toMatchObject({ usuarios: 2, usuariosActivos: 2 });

    await eliminar(token, persona.id);

    const { rows } = await pool.query('SELECT 1 FROM categoria_accesos WHERE usuario_id = $1', [persona.id]);
    expect(rows).toHaveLength(0);
    const editada = (await request(app).get('/api/v1/categorias').set(con(token))).body.datos.find((c: { id: string }) => c.id === categoria.body.id);
    expect(editada.usuariosAutorizados).toEqual([]);
    expect((await request(app).get('/api/v1/tablero').set(con(token))).body.resumen).toMatchObject({ usuarios: 1, usuariosActivos: 1 });
    const { rows: [conteo] } = await pool.query<{ usuarios: number }>(
      'SELECT usuarios::int FROM metricas_de_empresas() WHERE empresa_id = $1', [empresa.id]);
    expect(conteo!.usuarios).toBe(1);
  });
});
