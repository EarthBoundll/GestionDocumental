import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  almacenamientoDePruebas, CLAVE, CorreoDePruebas, crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, registrarEmpresa,
  tokenDelMaster,
} from '../apoyo/api.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

type App = ReturnType<typeof crearAppDePruebas>;

describe('Auditoría de la plataforma (RF27) y bloqueo por cuenta (RN21)', () => {
  let base: BaseDePruebas;
  let pool: pg.Pool;
  let app: App;
  let correo: CorreoDePruebas;

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    pool = base.pool;
  });
  afterAll(() => base.cerrar());
  beforeEach(() => {
    correo = new CorreoDePruebas();
    app = crearAppDePruebas(pool, {}, almacenamientoDePruebas(), correo);
  });

  const entrar = (email: string, clave: string) => request(app).post('/api/v1/auth/login').send({ email, clave });
  const auditoria = async (token: string, query: Record<string, string> = {}) =>
    request(app).get('/api/v1/plataforma/historial').query(query).set('Authorization', `Bearer ${token}`);

  describe('la auditoría del Master', () => {
    it('ve lo que hizo la plataforma, también sobre cada empresa, y los accesos con correos desconocidos', async () => {
      const master = await tokenDelMaster(app);
      const { empresa } = await registrarEmpresa(app);
      const intruso = `intruso.${Date.now()}@ejemplo.pe`;
      await entrar(intruso, 'cualquier-clave');

      const respuesta = await auditoria(master);

      expect(respuesta.status).toBe(200);
      const acciones = respuesta.body.datos.map((a: { accion: string; empresa: { id: string } | null }) => [a.accion, a.empresa?.id ?? null]);
      expect(acciones).toContainEqual(['EMPRESA_CREADA', empresa.id]);
      expect(acciones).toContainEqual(['SESION_INICIADA', null]);
      expect(respuesta.body.datos.find((a: { accion: string }) => a.accion === 'EMPRESA_CREADA').empresa)
        .toEqual({ id: empresa.id, nombre: empresa.nombre });
      expect(respuesta.body.datos.some((a: { detalle: { email?: string } }) => a.detalle.email === intruso)).toBe(true);
    });

    it('nunca ve la actividad de las personas de una empresa (D18), ni filtrando por esa empresa', async () => {
      const master = await tokenDelMaster(app);
      const { token: admin, empresa } = await registrarEmpresa(app);
      await request(app).post('/api/v1/categorias').set('Authorization', `Bearer ${admin}`).send({ nombre: 'Secreta' });

      const respuesta = await auditoria(master, { empresaId: empresa.id });

      const acciones = respuesta.body.datos.map((a: { accion: string }) => a.accion);
      expect(acciones).toContain('EMPRESA_CREADA');
      expect(acciones).not.toContain('CATEGORIA_CREADA');
      expect(acciones).not.toContain('SESION_INICIADA');
      expect(respuesta.body.datos.every((a: { rolUsuario: string | null }) => a.rolUsuario === 'master')).toBe(true);
    });

    it('la base tampoco le deja leer el resto del historial aunque una consulta no filtre', async () => {
      const cliente = await pool.connect();
      try {
        await cliente.query('BEGIN');
        await cliente.query("SELECT set_config('role', 'app_plataforma', true)");
        const { rows } = await cliente.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM historial WHERE empresa_id IS NOT NULL AND rol_usuario IS DISTINCT FROM 'master'");
        expect(rows).toEqual([{ n: 0 }]);
      } finally {
        await cliente.query('ROLLBACK');
        cliente.release();
      }
      expect((await pool.query("SELECT count(*)::int AS n FROM historial WHERE empresa_id IS NOT NULL AND rol_usuario IS DISTINCT FROM 'master'")).rows[0].n)
        .toBeGreaterThan(0);
    });

    it('un administrador de empresa no entra a la auditoría de la plataforma (403 registrado)', async () => {
      const { token: admin, empresa } = await registrarEmpresa(app);

      expect((await auditoria(admin)).status).toBe(403);
      expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({
        accion: 'ACCESO_DENEGADO', detalle: { permiso: 'GESTIONAR_PLATAFORMA' },
      });
    });
  });

  describe('el bloqueo por cuenta', () => {
    it('tras 5 contraseñas incorrectas el correo queda bloqueado, también con la contraseña correcta, y queda registrado', async () => {
      const { empresa } = await registrarEmpresa(app);
      const persona = await crearUsuarioEn(pool, empresa.id);

      for (let intento = 0; intento < 5; intento++) expect((await entrar(persona.email, 'clave-equivocada')).status).toBe(401);
      const bloqueado = await entrar(persona.email, CLAVE);

      expect(bloqueado.status).toBe(429);
      expect(bloqueado.body.error.codigo).toBe('CUENTA_BLOQUEADA');
      expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({
        accion: 'SESION_FALLIDA', usuario_id: persona.id, detalle: { email: persona.email, motivo: 'CUENTA_BLOQUEADA' },
      });
    });

    it('un correo que no existe se bloquea igual: el bloqueo no revela qué cuentas existen', async () => {
      const desconocido = `nadie.${Date.now()}@ejemplo.pe`;

      for (let intento = 0; intento < 5; intento++) expect((await entrar(desconocido, 'clave-equivocada')).status).toBe(401);

      expect((await entrar(desconocido, 'clave-equivocada')).body.error.codigo).toBe('CUENTA_BLOQUEADA');
    });

    it('cuatro fallos no bloquean, y un acceso correcto vuelve a empezar la cuenta', async () => {
      const { empresa } = await registrarEmpresa(app);
      const persona = await crearUsuarioEn(pool, empresa.id);

      for (let intento = 0; intento < 4; intento++) await entrar(persona.email, 'clave-equivocada');
      expect((await entrar(persona.email, CLAVE)).status).toBe(200);
      for (let intento = 0; intento < 4; intento++) await entrar(persona.email, 'clave-equivocada');

      expect((await entrar(persona.email, CLAVE)).status).toBe(200);
    });

    it('restablecer la contraseña por correo levanta el bloqueo', async () => {
      const { empresa } = await registrarEmpresa(app);
      const persona = await crearUsuarioEn(pool, empresa.id);
      for (let intento = 0; intento < 5; intento++) await entrar(persona.email, 'clave-equivocada');
      expect((await entrar(persona.email, CLAVE)).status).toBe(429);

      await request(app).post('/api/v1/auth/recuperacion').send({ email: persona.email });
      const enlace = correo.enviados.at(-1)!.texto.match(/https?:\/\/\S+/)![0];
      const token = new URL(enlace).hash.slice(1);
      expect((await request(app).post('/api/v1/auth/recuperacion/confirmar').send({ token, claveNueva: 'clave-nueva-segura-1' })).status)
        .toBe(204);

      expect((await iniciarSesion(app, persona.email, { clave: 'clave-nueva-segura-1' }))).toEqual(expect.any(String));
    });
  });
});
