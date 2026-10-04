import { SignJWT } from 'jose';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLAVE, crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, registrarEmpresa,
  SECRETO_DE_PRUEBAS, UA_ESCRITORIO, UA_IPHONE,
} from '../apoyo/api.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

describe('Autenticación (RF01–RF04)', () => {
  let base: BaseDePruebas;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearAppDePruebas>;

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    pool = base.pool;
  });
  afterAll(() => base.cerrar());
  // Una app nueva por prueba: cada una con sus propios contadores del límite de intentos, como tras un reinicio.
  beforeEach(() => {
    app = crearAppDePruebas(pool);
  });

  const yo = (token: string) => request(app).get('/api/v1/auth/yo').set('Authorization', `Bearer ${token}`);

  it('no hay registro público: las empresas las crea el Master (decisión B)', async () => {
    const respuesta = await request(app).post('/api/v1/auth/registro').send({
      empresa: { nombre: 'Empresa' }, administrador: { nombre: 'Ana', email: 'registro@ejemplo.pe', clave: CLAVE },
    });

    expect(respuesta.status).toBe(404);
  });

  describe('POST /auth/login', () => {
    it('con credenciales correctas abre una sesión y la registra con el dispositivo (indicador 5)', async () => {
      const { empresa, usuario } = await registrarEmpresa(app);

      const respuesta = await request(app).post('/api/v1/auth/login').set('User-Agent', UA_IPHONE)
        .send({ email: `  ${usuario.email.toUpperCase()} `, clave: CLAVE });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({ usuario: { id: usuario.id }, empresa });
      expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({
        accion: 'SESION_INICIADA', usuario_id: usuario.id, rol_usuario: 'administrador', es_movil: true,
      });
    });

    it('con una contraseña incorrecta responde 401 y registra el intento contra esa cuenta', async () => {
      const { empresa, usuario } = await registrarEmpresa(app);

      const respuesta = await request(app).post('/api/v1/auth/login').send({ email: usuario.email, clave: 'otra-clave' });

      expect(respuesta.status).toBe(401);
      expect(respuesta.body.error).toEqual({ codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Correo o contraseña incorrectos' });
      expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({
        accion: 'SESION_FALLIDA', usuario_id: usuario.id, detalle: { email: usuario.email, motivo: 'CLAVE_INCORRECTA' },
      });
    });

    it('con un correo que no existe responde exactamente lo mismo, y lo registra sin empresa', async () => {
      const email = `nadie.${Date.now()}@ejemplo.pe`;

      const respuesta = await request(app).post('/api/v1/auth/login').send({ email, clave: CLAVE });

      expect(respuesta.status).toBe(401);
      expect(respuesta.body.error).toEqual({ codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Correo o contraseña incorrectos' });
      const sinEmpresa = await historialDe(pool, null);
      expect(sinEmpresa.at(-1)).toMatchObject({
        accion: 'SESION_FALLIDA', usuario_id: null, rol_usuario: null, detalle: { email, motivo: 'CORREO_DESCONOCIDO' },
      });
    });

    it('un usuario desactivado con la contraseña correcta recibe 403 USUARIO_INACTIVO', async () => {
      const { empresa } = await registrarEmpresa(app);
      const empleado = await crearUsuarioEn(pool, empresa.id);
      await pool.query('UPDATE usuarios SET activo = false WHERE id = $1', [empleado.id]);

      const respuesta = await request(app).post('/api/v1/auth/login').send({ email: empleado.email, clave: CLAVE });

      expect(respuesta.status).toBe(403);
      expect(respuesta.body.error.codigo).toBe('USUARIO_INACTIVO');
      expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({ accion: 'SESION_FALLIDA', detalle: { motivo: 'USUARIO_INACTIVO' } });
    });

    it('frena la fuerza bruta desde un mismo IP: el undécimo intento fallido en 15 minutos responde 429 (RN20)', async () => {
      const aislada = crearAppDePruebas(pool);
      // Un correo distinto cada vez: el freno por IP actúa aunque nadie llegue al bloqueo por cuenta (RN21).
      const fallar = (intento = 0) =>
        request(aislada).post('/api/v1/auth/login').send({ email: `adivina${intento}.${Date.now()}@ejemplo.pe`, clave: 'adivinando' });

      for (let intento = 1; intento <= 10; intento++) expect((await fallar(intento)).status).toBe(401);
      const bloqueado = await fallar();

      expect(bloqueado.status).toBe(429);
      expect(bloqueado.body.error.codigo).toBe('DEMASIADOS_INTENTOS');
    });

    it('los inicios de sesión correctos no cuentan para el límite: una oficina entera puede entrar a la vez', async () => {
      const aislada = crearAppDePruebas(pool);
      const { usuario } = await registrarEmpresa(aislada);

      for (let intento = 1; intento <= 12; intento++) {
        expect((await request(aislada).post('/api/v1/auth/login').send({ email: usuario.email, clave: CLAVE })).status).toBe(200);
      }
    });
  });

  describe('sesión en cada petición (D4)', () => {
    it('sin token, con un token ajeno o con uno manipulado responde 401', async () => {
      const { token } = await registrarEmpresa(app);
      const ajeno = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(crypto.randomUUID())
        .setJti(crypto.randomUUID()).setExpirationTime('1h').sign(new TextEncoder().encode('otro-secreto-de-al-menos-32-caracteres!'));
      const manipulado = `${token.slice(0, -2)}xx`;

      expect((await request(app).get('/api/v1/auth/yo')).status).toBe(401);
      for (const invalido of [ajeno, manipulado, 'basura']) {
        const respuesta = await yo(invalido);
        expect(respuesta.status).toBe(401);
        expect(respuesta.body.error.codigo).toBe('NO_AUTENTICADO');
      }
    });

    it('un token caducado responde 401 aunque la firma sea correcta', async () => {
      const { token } = await registrarEmpresa(app);
      const [, carga] = token.split('.');
      const { sub, jti, empresa_id, rol } = JSON.parse(Buffer.from(carga!, 'base64url').toString());
      const caducado = await new SignJWT({ empresa_id, rol }).setProtectedHeader({ alg: 'HS256' }).setSubject(sub).setJti(jti)
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200).setExpirationTime(Math.floor(Date.now() / 1000) - 60)
        .sign(new TextEncoder().encode(SECRETO_DE_PRUEBAS));

      expect((await yo(caducado)).status).toBe(401);
    });

    it('desactivar a un usuario lo deja fuera en la petición siguiente (RN04)', async () => {
      const { empresa } = await registrarEmpresa(app);
      const empleado = await crearUsuarioEn(pool, empresa.id);
      const token = await iniciarSesion(app, empleado.email);
      expect((await yo(token)).status).toBe(200);

      await pool.query('UPDATE usuarios SET activo = false WHERE id = $1', [empleado.id]);

      expect((await yo(token)).status).toBe(401);
    });

    it('un cambio de rol vale desde la petición siguiente, sin volver a iniciar sesión (RN05)', async () => {
      const { empresa } = await registrarEmpresa(app);
      const empleado = await crearUsuarioEn(pool, empresa.id, 'usuario');
      const token = await iniciarSesion(app, empleado.email);

      await pool.query("UPDATE usuarios SET rol = 'administrador' WHERE id = $1", [empleado.id]);

      expect((await yo(token)).body.usuario.rol).toBe('administrador');
    });
  });

  it('GET /auth/yo devuelve el usuario y su empresa', async () => {
    const { token, usuario, empresa } = await registrarEmpresa(app);

    const respuesta = await yo(token);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ usuario, empresa });
  });

  it('POST /auth/logout cierra solo esa sesión y lo registra (RF03)', async () => {
    const { token, usuario, empresa } = await registrarEmpresa(app);
    const otraSesion = await iniciarSesion(app, usuario.email, { userAgent: UA_IPHONE });

    const respuesta = await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`);

    expect(respuesta.status).toBe(204);
    expect((await yo(token)).status).toBe(401);
    expect((await yo(otraSesion)).status).toBe(200);
    expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({ accion: 'SESION_CERRADA', usuario_id: usuario.id, entidad_tipo: 'sesion' });
  });

  describe('PUT /auth/clave (RF04)', () => {
    it('cambia la contraseña, conserva la sesión actual, cierra las demás y lo registra sin la clave (RN06)', async () => {
      const { token, usuario, empresa } = await registrarEmpresa(app);
      const otraSesion = await iniciarSesion(app, usuario.email);
      const nueva = 'una-clave-nueva-y-larga';

      const respuesta = await request(app).put('/api/v1/auth/clave').set('Authorization', `Bearer ${token}`)
        .send({ claveActual: CLAVE, claveNueva: nueva });

      expect(respuesta.status).toBe(204);
      expect((await yo(token)).status).toBe(200);
      expect((await yo(otraSesion)).status).toBe(401);
      expect((await request(app).post('/api/v1/auth/login').send({ email: usuario.email, clave: CLAVE })).status).toBe(401);
      expect((await request(app).post('/api/v1/auth/login').send({ email: usuario.email, clave: nueva })).status).toBe(200);
      const cambio = (await historialDe(pool, empresa.id)).find((fila) => fila.accion === 'CLAVE_CAMBIADA');
      expect(cambio).toMatchObject({ entidad_id: usuario.id, detalle: { sesionesCerradas: 1 } });
      expect(JSON.stringify(cambio)).not.toContain(nueva);
    });

    it('con la contraseña actual equivocada responde 400 y no cambia nada', async () => {
      const { token, usuario } = await registrarEmpresa(app);

      const respuesta = await request(app).put('/api/v1/auth/clave').set('Authorization', `Bearer ${token}`)
        .send({ claveActual: 'no-es-esta', claveNueva: 'una-clave-nueva-y-larga' });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error.detalles).toEqual([{ campo: 'claveActual', mensaje: 'No coincide con tu contraseña actual' }]);
      expect((await request(app).post('/api/v1/auth/login').send({ email: usuario.email, clave: CLAVE })).status).toBe(200);
    });
  });

  it('si el historial no se puede escribir, la acción no se ejecuta (RN16, D7)', async () => {
    const { usuario } = await registrarEmpresa(app);
    const sesionesAntes = await contarSesiones(pool, usuario.id);
    // Se provoca un fallo real del historial solo para los inicios de sesión de esta cuenta.
    await pool.query(`
      CREATE FUNCTION fallar_registro() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'historial no disponible'; END $$;
      CREATE TRIGGER historial_roto BEFORE INSERT ON historial FOR EACH ROW
        WHEN (NEW.accion = 'SESION_INICIADA' AND NEW.usuario_id = '${usuario.id}') EXECUTE FUNCTION fallar_registro();
    `);
    const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const respuesta = await request(app).post('/api/v1/auth/login').send({ email: usuario.email, clave: CLAVE });

      expect(respuesta.status).toBe(500);
      expect(await contarSesiones(pool, usuario.id)).toBe(sesionesAntes);
    } finally {
      registro.mockRestore();
      await pool.query('DROP TRIGGER historial_roto ON historial; DROP FUNCTION fallar_registro();');
    }
  });

  it('CORS solo admite el origen configurado del frontend', async () => {
    const permitido = await request(app).options('/api/v1/auth/login')
      .set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST');
    const ajeno = await request(app).options('/api/v1/auth/login')
      .set('Origin', 'https://sitio-ajeno.com').set('Access-Control-Request-Method', 'POST');

    expect(permitido.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(permitido.headers['access-control-allow-headers']).toContain('Authorization');
    expect(ajeno.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sin user-agent también se puede entrar, y queda registrado como no móvil', async () => {
    const { usuario, empresa } = await registrarEmpresa(app, { userAgent: UA_ESCRITORIO });

    expect(await iniciarSesion(app, usuario.email, { userAgent: '' })).toMatch(/^ey/);
    expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({ accion: 'SESION_INICIADA', user_agent: null, es_movil: false });
  });
});

async function contarSesiones(pool: pg.Pool, usuarioId: string): Promise<number> {
  return (await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM sesiones WHERE usuario_id = $1', [usuarioId])).rows[0]!.n;
}
