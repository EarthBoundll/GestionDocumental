import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLAVE, crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, registrarEmpresa, tokenDelMaster, UA_IPHONE,
} from '../apoyo/api.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

describe('Plataforma: lo que hace el Administrador Master (CLAUDE.md v2)', () => {
  let base: BaseDePruebas;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearAppDePruebas>;
  let master: string;

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    pool = base.pool;
  });
  afterAll(() => base.cerrar());
  beforeEach(async () => {
    app = crearAppDePruebas(pool);
    master = await tokenDelMaster(app);
  });

  const comoMaster = () => ({
    get: (ruta: string) => request(app).get(`/api/v1/plataforma${ruta}`).set('Authorization', `Bearer ${master}`),
    post: (ruta: string, cuerpo: object) =>
      request(app).post(`/api/v1/plataforma${ruta}`).set('Authorization', `Bearer ${master}`).set('User-Agent', UA_IPHONE).send(cuerpo),
    patch: (ruta: string, cuerpo: object) =>
      request(app).patch(`/api/v1/plataforma${ruta}`).set('Authorization', `Bearer ${master}`).send(cuerpo),
  });
  const masterId = async () => (await pool.query<{ id: string }>("SELECT id FROM usuarios WHERE rol = 'master'")).rows[0]!.id;
  const yo = (token: string) => request(app).get('/api/v1/auth/yo').set('Authorization', `Bearer ${token}`);
  let secuencia = 0;
  const nuevaEmpresa = () => {
    const n = ++secuencia;
    return {
      empresa: { nombre: `  Distribuidora ${n} SAC `, ruc: `20${String(Date.now()).slice(-8)}${n % 10}` },
      administrador: { nombre: 'Ana Torres', email: `Ana.Torres.${n}.${Date.now()}@Ejemplo.PE`, dni: '45678912', clave: CLAVE },
    };
  };

  describe('POST /plataforma/empresas', () => {
    it('crea la empresa, su primer administrador y sus categorías iniciales, y deja constancia en el historial de la empresa', async () => {
      const datos = nuevaEmpresa();

      const respuesta = await comoMaster().post('/empresas', datos);

      expect(respuesta.status).toBe(201);
      const { empresa, administrador } = respuesta.body;
      expect(empresa).toMatchObject({ nombre: datos.empresa.nombre.trim(), ruc: datos.empresa.ruc, activa: true });
      expect(administrador).toMatchObject({
        empresaId: empresa.id, nombre: 'Ana Torres', email: datos.administrador.email.toLowerCase(), dni: '45678912', activo: true,
      });
      const { rows: categorias } = await pool.query('SELECT nombre FROM categorias WHERE empresa_id = $1 ORDER BY nombre', [empresa.id]);
      expect(categorias.map((fila) => fila.nombre)).toEqual(['Contratos', 'Cotizaciones', 'Facturas y boletas', 'Otros', 'Recursos humanos']);

      const id = await masterId();
      expect(await historialDe(pool, empresa.id)).toEqual([
        expect.objectContaining({ accion: 'EMPRESA_CREADA', usuario_id: id, rol_usuario: 'master', entidad_id: empresa.id, es_movil: true }),
        expect.objectContaining({ accion: 'USUARIO_CREADO', usuario_id: id, rol_usuario: 'master', entidad_id: administrador.id }),
      ]);
      // El administrador puede entrar de inmediato, y entra en su empresa.
      const token = await iniciarSesion(app, administrador.email);
      expect((await yo(token)).body).toMatchObject({ usuario: { rol: 'administrador' }, empresa: { id: empresa.id } });
    });

    it('un correo ya usado responde 409 y no deja nada a medias', async () => {
      const existente = await registrarEmpresa(app);
      const antes = await contar(pool, 'empresas');
      const datos = nuevaEmpresa();

      const respuesta = await comoMaster().post('/empresas', {
        ...datos, administrador: { ...datos.administrador, email: existente.usuario.email.toUpperCase() },
      });

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.error.codigo).toBe('EMAIL_EN_USO');
      expect(await contar(pool, 'empresas')).toBe(antes);
    });

    it('un RUC ya registrado responde 409', async () => {
      const datos = nuevaEmpresa();
      expect((await comoMaster().post('/empresas', datos)).status).toBe(201);

      const otra = nuevaEmpresa();
      const respuesta = await comoMaster().post('/empresas', { ...otra, empresa: { ...otra.empresa, ruc: datos.empresa.ruc } });

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.error.codigo).toBe('RUC_EN_USO');
    });

    it('valida la entrada y explica cada problema en español', async () => {
      const respuesta = await comoMaster().post('/empresas', {
        empresa: { nombre: 'X', ruc: '123' },
        administrador: { nombre: 'Ana', email: 'no-es-un-correo', dni: '123', clave: 'corta' },
      });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error.detalles).toEqual(expect.arrayContaining([
        { campo: 'empresa.nombre', mensaje: 'Escribe al menos 2 caracteres' },
        { campo: 'empresa.ruc', mensaje: 'El RUC tiene 11 dígitos' },
        { campo: 'administrador.email', mensaje: 'Escribe un correo válido' },
        { campo: 'administrador.dni', mensaje: 'El DNI tiene 8 dígitos' },
        { campo: 'administrador.clave', mensaje: 'Usa al menos 8 caracteres' },
      ]));
    });

    it('rechaza contraseñas de más de 72 bytes aunque tengan menos de 72 caracteres', async () => {
      const datos = nuevaEmpresa();

      const respuesta = await comoMaster().post('/empresas', { ...datos, administrador: { ...datos.administrador, clave: 'ñ'.repeat(40) } });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error.detalles[0].mensaje).toContain('72 bytes');
    });

    it('si falla el último paso, se deshace todo, también lo ya registrado en el historial: no hay acciones fantasma (D7)', async () => {
      const datos = nuevaEmpresa();
      await pool.query(`
        CREATE FUNCTION fallar_registro() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'historial no disponible'; END $$;
        CREATE TRIGGER historial_roto BEFORE INSERT ON historial FOR EACH ROW
          WHEN (NEW.accion = 'USUARIO_CREADO') EXECUTE FUNCTION fallar_registro();
      `);
      const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const respuesta = await comoMaster().post('/empresas', datos);

        expect(respuesta.status).toBe(500);
        const { rows } = await pool.query(
          "SELECT count(*)::int AS n FROM historial WHERE accion = 'EMPRESA_CREADA' AND detalle->>'ruc' = $1", [datos.empresa.ruc]);
        expect(rows[0].n).toBe(0);
        expect((await pool.query('SELECT 1 FROM empresas WHERE ruc = $1', [datos.empresa.ruc])).rowCount).toBe(0);
      } finally {
        registro.mockRestore();
        await pool.query('DROP TRIGGER historial_roto ON historial; DROP FUNCTION fallar_registro();');
      }
    });
  });

  it('lista las empresas con sus cifras: cuántos usuarios y documentos, nunca cuáles (decisión E)', async () => {
    const { empresa } = await registrarEmpresa(app);
    await crearUsuarioEn(pool, empresa.id);

    const respuesta = await comoMaster().get('/empresas');

    expect(respuesta.status).toBe(200);
    const fila = respuesta.body.datos.find((e: { id: string }) => e.id === empresa.id);
    expect(fila).toEqual({
      id: empresa.id, nombre: empresa.nombre, ruc: null, activa: true, creadoEn: expect.any(String),
      metricas: { usuarios: 2, usuariosActivos: 2, documentos: 0, almacenamientoBytes: 0, ultimoAcceso: expect.any(String) },
    });
  });

  it('la ficha de una empresa trae a sus administradores, pero no a sus usuarios', async () => {
    const { empresa, usuario } = await registrarEmpresa(app);
    await crearUsuarioEn(pool, empresa.id, 'usuario');

    const respuesta = await comoMaster().get(`/empresas/${empresa.id}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.administradores).toEqual([expect.objectContaining({ id: usuario.id, email: usuario.email })]);
    expect((await comoMaster().get(`/empresas/${crypto.randomUUID()}`)).status).toBe(404);
  });

  it('edita el nombre y el RUC de una empresa y registra el antes y el después', async () => {
    const { empresa } = await registrarEmpresa(app);

    const respuesta = await comoMaster().patch(`/empresas/${empresa.id}`, { nombre: 'Nuevo nombre SAC', ruc: '20999999991' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ nombre: 'Nuevo nombre SAC', ruc: '20999999991' });
    expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({
      accion: 'EMPRESA_EDITADA', rol_usuario: 'master',
      detalle: { cambios: { nombre: { antes: empresa.nombre, despues: 'Nuevo nombre SAC' }, ruc: { antes: null, despues: '20999999991' } } },
    });
  });

  it('desactivar una empresa deja fuera a todos sus usuarios en ese momento; reactivarla les devuelve la entrada', async () => {
    const { empresa, token, usuario } = await registrarEmpresa(app);
    const empleado = await crearUsuarioEn(pool, empresa.id);
    const tokenEmpleado = await iniciarSesion(app, empleado.email);

    const desactivada = await comoMaster().patch(`/empresas/${empresa.id}/estado`, { activa: false });

    expect(desactivada.status).toBe(200);
    expect(desactivada.body.activa).toBe(false);
    expect((await yo(token)).status).toBe(401);
    expect((await yo(tokenEmpleado)).status).toBe(401);
    const intento = await request(app).post('/api/v1/auth/login').send({ email: usuario.email, clave: CLAVE });
    expect(intento.status).toBe(403);
    expect(intento.body.error.codigo).toBe('EMPRESA_INACTIVA');
    const asientos = await historialDe(pool, empresa.id);
    expect(asientos.find((fila) => fila.accion === 'EMPRESA_DESACTIVADA')).toMatchObject({ rol_usuario: 'master', detalle: { sesionesCerradas: 2 } });
    expect(asientos.at(-1)).toMatchObject({ accion: 'SESION_FALLIDA', detalle: { motivo: 'EMPRESA_INACTIVA' } });

    expect((await comoMaster().patch(`/empresas/${empresa.id}/estado`, { activa: true })).status).toBe(200);
    expect(await iniciarSesion(app, usuario.email)).toMatch(/^ey/);
    expect((await historialDe(pool, empresa.id)).some((fila) => fila.accion === 'EMPRESA_REACTIVADA')).toBe(true);
  });

  // Dos mecanismos dejan fuera a una empresa desactivada, y cada uno basta solo. Se prueban por separado:
  // juntos, el fallo de uno lo taparía el otro.
  it('desactivarla revoca de verdad las sesiones en la base, no solo las deja sin efecto', async () => {
    const { empresa } = await registrarEmpresa(app);
    await iniciarSesion(app, (await crearUsuarioEn(pool, empresa.id)).email);

    await comoMaster().patch(`/empresas/${empresa.id}/estado`, { activa: false });

    const { rows } = await pool.query(
      `SELECT count(*)::int AS abiertas FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
       WHERE u.empresa_id = $1 AND s.revocada_en IS NULL`, [empresa.id]);
    expect(rows[0].abiertas).toBe(0);
  });

  it('una empresa desactivada deja fuera cada petición aunque sus sesiones sigan abiertas', async () => {
    const { empresa, token } = await registrarEmpresa(app);

    await pool.query('UPDATE empresas SET activa = false WHERE id = $1', [empresa.id]);

    expect((await yo(token)).status).toBe(401);
    await pool.query('UPDATE empresas SET activa = true WHERE id = $1', [empresa.id]);
    expect((await yo(token)).status).toBe(200);
  });

  describe('administradores de una empresa', () => {
    it('añade otro administrador a una empresa', async () => {
      const { empresa } = await registrarEmpresa(app);
      const email = `segundo.${Date.now()}@ejemplo.pe`;

      const respuesta = await comoMaster().post(`/empresas/${empresa.id}/administradores`, { nombre: 'Rosa Díaz', email, clave: CLAVE });

      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toMatchObject({ empresaId: empresa.id, email, dni: null });
      expect((await yo(await iniciarSesion(app, email))).body.usuario.rol).toBe('administrador');
    });

    it('restablecer la contraseña de un administrador cierra sus sesiones y no guarda ni la clave ni el DNI en el historial', async () => {
      const { empresa, usuario, token } = await registrarEmpresa(app);
      const nueva = 'restablecida-por-el-master';

      const respuesta = await comoMaster().patch(`/administradores/${usuario.id}`, { clave: nueva, dni: '87654321' });

      expect(respuesta.status).toBe(200);
      expect((await yo(token)).status).toBe(401);
      expect(await iniciarSesion(app, usuario.email, { clave: nueva })).toMatch(/^ey/);
      const editado = (await historialDe(pool, empresa.id)).find((fila) => fila.accion === 'USUARIO_EDITADO');
      expect(editado).toMatchObject({ rol_usuario: 'master', detalle: { claveRestablecida: true, sesionesCerradas: 1, cambios: { dni: { antes: null, despues: '********' } } } });
      expect(JSON.stringify(editado)).not.toContain(nueva);
      expect(JSON.stringify(editado)).not.toContain('87654321');
    });

    it('desactiva a un administrador y lo deja fuera en ese momento', async () => {
      const { usuario, token } = await registrarEmpresa(app);

      const respuesta = await comoMaster().patch(`/administradores/${usuario.id}/estado`, { activo: false });

      expect(respuesta.status).toBe(200);
      expect((await yo(token)).status).toBe(401);
    });

    it('no alcanza a los usuarios que no son administradores: para el Master no existen', async () => {
      const { empresa } = await registrarEmpresa(app);
      const empleado = await crearUsuarioEn(pool, empresa.id, 'usuario');

      expect((await comoMaster().patch(`/administradores/${empleado.id}`, { nombre: 'Otro nombre' })).status).toBe(404);
      expect((await comoMaster().patch(`/administradores/${empleado.id}/estado`, { activo: false })).status).toBe(404);
    });
  });

  it('las cifras de la plataforma suman todas las empresas', async () => {
    await registrarEmpresa(app);

    const respuesta = await comoMaster().get('/metricas');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({
      empresas: expect.any(Number), empresasActivas: expect.any(Number), usuarios: expect.any(Number), documentos: expect.any(Number),
    });
    expect(respuesta.body.empresas).toBe(await contar(pool, 'empresas'));
  });

  describe('el Master no entra en las empresas, y las empresas no entran en la plataforma (decisión E)', () => {
    it.each([
      ['GET', '/api/v1/documentos'],
      ['GET', '/api/v1/categorias'],
      ['GET', '/api/v1/usuarios'],
      ['GET', '/api/v1/solicitudes'],
      ['GET', '/api/v1/notificaciones'],
      ['GET', '/api/v1/historial'],
    ])('%s %s responde 403 al Master, y queda registrado fuera de toda empresa', async (_metodo, ruta) => {
      const respuesta = await request(app).get(ruta).set('Authorization', `Bearer ${master}`);

      expect(respuesta.status).toBe(403);
      expect((await historialDe(pool, null)).at(-1)).toMatchObject({
        accion: 'ACCESO_DENEGADO', usuario_id: await masterId(), rol_usuario: 'master', detalle: { permiso: 'USAR_DATOS_DE_EMPRESA', ruta },
      });
    });

    it('un administrador de empresa recibe 403 en la plataforma, y queda en el historial de su empresa', async () => {
      const { token, empresa, usuario } = await registrarEmpresa(app);

      const respuesta = await request(app).get('/api/v1/plataforma/empresas').set('Authorization', `Bearer ${token}`);

      expect(respuesta.status).toBe(403);
      expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({
        accion: 'ACCESO_DENEGADO', usuario_id: usuario.id, detalle: { permiso: 'GESTIONAR_PLATAFORMA', ruta: '/api/v1/plataforma/empresas' },
      });
    });

    it('nadie puede crear un segundo Master desde la API', async () => {
      const { token } = await registrarEmpresa(app);

      const respuesta = await request(app).post('/api/v1/usuarios').set('Authorization', `Bearer ${token}`)
        .send({ nombre: 'Otro Master', email: `otro.master.${Date.now()}@ejemplo.pe`, clave: CLAVE, rol: 'master' });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error.detalles).toEqual([{ campo: 'rol', mensaje: 'El rol es «administrador» o «usuario»' }]);
      expect(await contar(pool, 'usuarios', "rol = 'master'")).toBe(1);
    });
  });
});

async function contar(pool: pg.Pool, tabla: 'empresas' | 'usuarios', condicion = 'true'): Promise<number> {
  return (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${tabla} WHERE ${condicion}`)).rows[0]!.n;
}
