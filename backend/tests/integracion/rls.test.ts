import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accesoDe, accesoDeEmpresa, accesoDePlataforma } from '../../src/db/acceso.js';
import { crearBaseDePruebas, DIRECTORIO_MIGRACIONES, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

/**
 * El aislamiento en la propia base (D17), probado sin pasar por la API: aunque una consulta olvide
 * filtrar por empresa, PostgreSQL no devuelve ni modifica filas de otra. Es la red bajo los filtros del
 * código, y la respuesta a «¿y si un programador se equivoca?».
 */
describe('Aislamiento en la base: RLS y roles (D17, indicador 6)', () => {
  let base: BaseDePruebas;
  let db: pg.Pool;
  let empresaA: string;
  let empresaB: string;
  let adminA: string;
  let adminB: string;
  let master: string;

  /** Ejecuta una sentencia como lo hace la API: en una transacción, con un rol y una empresa activa. */
  async function como(rol: 'app_empresa' | 'app_plataforma', empresa: string | null, sql: string, parametros: unknown[] = []) {
    const cliente = await db.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query("SELECT set_config('role', $1, true), set_config('app.empresa_id', $2, true)", [rol, empresa ?? '']);
      const { rows } = await cliente.query(sql, parametros);
      await cliente.query('COMMIT');
      return rows;
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }
  }

  const insertarUsuario = async (empresa: string | null, rol: string, email: string): Promise<string> => (await db.query(
    "INSERT INTO usuarios (empresa_id, nombre, email, clave_hash, rol) VALUES ($1, 'Persona', $2, repeat('x', 60), $3) RETURNING id",
    [empresa, email, rol],
  )).rows[0].id;

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    db = base.pool;
    empresaA = (await db.query("INSERT INTO empresas (nombre) VALUES ('Empresa A') RETURNING id")).rows[0].id;
    empresaB = (await db.query("INSERT INTO empresas (nombre) VALUES ('Empresa B') RETURNING id")).rows[0].id;
    adminA = await insertarUsuario(empresaA, 'administrador', 'admin@a.pe');
    adminB = await insertarUsuario(empresaB, 'administrador', 'admin@b.pe');
    await insertarUsuario(empresaA, 'usuario', 'usuario@a.pe');
    master = await insertarUsuario(null, 'master', 'master@plataforma.pe');
    for (const [empresa, autor] of [[empresaA, adminA], [empresaB, adminB]] as const) {
      const categoria = (await db.query("INSERT INTO categorias (empresa_id, nombre) VALUES ($1, 'Contratos') RETURNING id", [empresa])).rows[0].id;
      await db.query(
        `INSERT INTO documentos (empresa_id, categoria_id, subido_por, nombre, fecha_documento, archivo_nombre_original,
           archivo_ruta, archivo_tipo_mime, archivo_peso_bytes)
         VALUES ($1::uuid, $2, $3, 'Contrato', '2026-01-01', 'c.pdf', $1::text || '/c.pdf', 'application/pdf', 2048)`,
        [empresa, categoria, autor],
      );
    }
  });
  afterAll(() => base.cerrar());

  describe('el modelo de tres roles', () => {
    it('solo puede haber un Master, sin empresa; todo usuario de empresa la tiene', async () => {
      await expect(insertarUsuario(null, 'master', 'otro.master@plataforma.pe'))
        .rejects.toMatchObject({ code: '23505', constraint: 'usuarios_un_solo_master' });
      await expect(insertarUsuario(empresaA, 'master', 'master.con.empresa@a.pe'))
        .rejects.toMatchObject({ code: '23514', constraint: 'usuarios_master_sin_empresa' });
      await expect(insertarUsuario(null, 'usuario', 'sin.empresa@a.pe'))
        .rejects.toMatchObject({ code: '23514', constraint: 'usuarios_master_sin_empresa' });
    });
  });

  describe('una empresa (app_empresa)', () => {
    it('ve solo lo suyo aunque la consulta no filtre por empresa', async () => {
      expect(await como('app_empresa', empresaA, 'SELECT empresa_id FROM documentos')).toEqual([{ empresa_id: empresaA }]);
      expect((await como('app_empresa', empresaA, 'SELECT email FROM usuarios ORDER BY email')).map((u) => u.email))
        .toEqual(['admin@a.pe', 'usuario@a.pe']);
      expect(await como('app_empresa', empresaA, 'SELECT nombre FROM empresas')).toEqual([{ nombre: 'Empresa A' }]);
    });

    it('sin empresa activa no ve nada: si la API olvidara fijarla, fallaría cerrado', async () => {
      expect(await como('app_empresa', null, 'SELECT count(*)::int AS n FROM documentos')).toEqual([{ n: 0 }]);
    });

    it('no puede escribir en otra empresa ni modificar sus filas', async () => {
      await expect(como('app_empresa', empresaA, "INSERT INTO categorias (empresa_id, nombre) VALUES ($1, 'Intrusa')", [empresaB]))
        .rejects.toMatchObject({ code: '42501' });
      expect(await como('app_empresa', empresaA, "UPDATE documentos SET nombre = 'Alterado' WHERE empresa_id = $1 RETURNING id", [empresaB]))
        .toEqual([]);
    });

    it('no puede borrar nada: el rol no tiene ese permiso', async () => {
      await expect(como('app_empresa', empresaA, 'DELETE FROM documentos')).rejects.toMatchObject({ code: '42501' });
    });

    it('no ve las métricas de la plataforma ni las recuperaciones de contraseña', async () => {
      await expect(como('app_empresa', empresaA, 'SELECT * FROM metricas_de_empresas()')).rejects.toMatchObject({ code: '42501' });
      await expect(como('app_empresa', empresaA, 'SELECT * FROM recuperaciones_clave')).rejects.toMatchObject({ code: '42501' });
    });
  });

  describe('el historial', () => {
    it('acepta asientos de un autor de la empresa, con su rol', async () => {
      await expect(como('app_empresa', empresaA,
        "INSERT INTO historial (empresa_id, usuario_id, rol_usuario, accion) VALUES ($1, $2, 'administrador', 'SESION_INICIADA') RETURNING id",
        [empresaA, adminA])).resolves.toHaveLength(1);
    });

    it('rechaza un asiento cuyo autor es de otra empresa, o con un rol que no es el suyo', async () => {
      await expect(db.query(
        "INSERT INTO historial (empresa_id, usuario_id, rol_usuario, accion) VALUES ($1, $2, 'administrador', 'SESION_INICIADA')",
        [empresaB, adminA],
      )).rejects.toMatchObject({ code: '23503', constraint: 'historial_autor_de_su_empresa' });
      await expect(db.query(
        "INSERT INTO historial (empresa_id, usuario_id, rol_usuario, accion) VALUES ($1, $2, 'master', 'SESION_INICIADA')",
        [empresaA, adminA],
      )).rejects.toMatchObject({ code: '23514', constraint: 'historial_rol_del_autor' });
    });

    it('la excepción del Master es explícita: deja asientos en la empresa sobre la que actúa', async () => {
      await expect(como('app_plataforma', null,
        "INSERT INTO historial (empresa_id, usuario_id, rol_usuario, accion, entidad_tipo, entidad_id) VALUES ($1, $2, 'master', 'EMPRESA_EDITADA', 'empresa', $1)",
        [empresaA, master])).resolves.toBeDefined();
    });
  });

  describe('el Master (app_plataforma)', () => {
    it('gestiona empresas y ve solo a sus administradores', async () => {
      expect((await como('app_plataforma', null, 'SELECT nombre FROM empresas ORDER BY nombre')).map((e) => e.nombre)).toEqual(['Empresa A', 'Empresa B']);
      expect(await como('app_plataforma', null, 'SELECT DISTINCT rol FROM usuarios')).toEqual([{ rol: 'administrador' }]);
    });

    it('no puede leer documentos, solicitudes, notificaciones ni tiempos de respuesta (decisión E)', async () => {
      for (const tabla of ['documentos', 'solicitudes', 'notificaciones', 'tiempos_respuesta']) {
        await expect(como('app_plataforma', null, `SELECT count(*) FROM ${tabla}`)).rejects.toMatchObject({ code: '42501' });
      }
    });

    it('no puede crear usuarios normales ni otro Master: solo administradores de empresa', async () => {
      await expect(como('app_plataforma', null,
        "INSERT INTO usuarios (empresa_id, nombre, email, clave_hash, rol) VALUES ($1, 'U', 'nuevo@a.pe', repeat('x', 60), 'usuario')",
        [empresaA])).rejects.toMatchObject({ code: '42501' });
    });

    it('ve métricas en cifras, nunca contenido', async () => {
      const metricas = await como('app_plataforma', null, 'SELECT empresa_id, documentos::int, almacenamiento_bytes::int FROM metricas_de_empresas() ORDER BY 1');
      expect(metricas).toEqual(expect.arrayContaining([
        { empresa_id: empresaA, documentos: 1, almacenamiento_bytes: 2048 },
        { empresa_id: empresaB, documentos: 1, almacenamiento_bytes: 2048 },
      ]));
    });

    it('al desactivar una empresa cierra las sesiones de todos sus usuarios, no solo de los administradores', async () => {
      const usuarioA = (await db.query("SELECT id FROM usuarios WHERE email = 'usuario@a.pe'")).rows[0].id;
      for (const id of [adminA, usuarioA, adminB]) {
        await db.query("INSERT INTO sesiones (usuario_id, expira_en) VALUES ($1, now() + interval '1 hour')", [id]);
      }

      expect(await como('app_plataforma', null, 'SELECT revocar_sesiones_de_empresa($1) AS n', [empresaA])).toEqual([{ n: 2 }]);
      const { rows } = await db.query('SELECT count(*)::int AS n FROM sesiones WHERE usuario_id = $1 AND revocada_en IS NULL', [adminB]);
      expect(rows).toEqual([{ n: 1 }]);
    });
  });

  // La capa transversal de la API (src/db/acceso.ts): lo que se prueba arriba con SQL, ahora por el
  // mismo camino que usan todos los servicios.
  describe('la capa de acceso de la API', () => {
    it('cada operación corre con el rol sin privilegios y la empresa de quien la hace, y al terminar la conexión queda limpia', async () => {
      const dentro = await accesoDeEmpresa(db, empresaA).ejecutar(async (cliente) =>
        (await cliente.query("SELECT current_user AS rol, current_setting('app.empresa_id') AS empresa")).rows[0]);
      const despues = (await db.query("SELECT current_user AS rol, current_setting('app.empresa_id', true) AS empresa")).rows[0];

      expect(dentro).toEqual({ rol: 'app_empresa', empresa: empresaA });
      expect(despues.rol).not.toMatch(/^app_/);
      expect(despues.empresa ?? '').toBe('');
    });

    it('una consulta que olvida filtrar por empresa solo devuelve lo de la empresa del actor', async () => {
      const nombres = (empresa: string) => accesoDeEmpresa(db, empresa).ejecutar(async (cliente) =>
        (await cliente.query('SELECT empresa_id FROM documentos')).rows.map((fila) => fila.empresa_id));

      expect(await nombres(empresaA)).toEqual([empresaA]);
      expect(await nombres(empresaB)).toEqual([empresaB]);
    });

    it('el acceso se decide por la identidad: el Master, y solo él, recibe el de plataforma', async () => {
      expect(accesoDe(db, { rol: 'master', empresaId: null }).empresaId).toBeNull();
      expect(accesoDe(db, { rol: 'administrador', empresaId: empresaA }).empresaId).toBe(empresaA);
      expect(() => accesoDe(db, { rol: 'usuario', empresaId: null })).toThrow();
      await expect(accesoDePlataforma(db).ejecutar((cliente) => cliente.query('SELECT 1 FROM documentos')))
        .rejects.toMatchObject({ code: '42501' });
    });
  });

  describe('la API automática de Supabase (D14)', () => {
    /** Los roles de esa API, que en local no existen. Son de todo el servidor: pueden estar ya creados. */
    async function crearRolesDeSupabase() {
      for (const rol of ['anon', 'authenticated']) {
        await db.query(`DO $$ BEGIN
          CREATE ROLE ${rol} NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$`);
      }
    }

    it('sus roles no ejecutan las funciones de plataforma ni leen tablas, aunque Supabase se lo conceda por defecto', async () => {
      // Lo que hace Supabase al crear objetos en public: concederlos a anon y authenticated.
      await crearRolesDeSupabase();
      await db.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated');
      await db.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated');
      const puede = async (rol: string, sql: string) => (await db.query(`SELECT ${sql} AS si`, [rol])).rows[0].si as boolean;
      const ejecutar = (funcion: string) => `has_function_privilege($1, '${funcion}', 'EXECUTE')`;
      expect(await puede('anon', ejecutar('revocar_sesiones_de_empresa(uuid)'))).toBe(true);

      await db.query(await readFile(join(DIRECTORIO_MIGRACIONES, '002_cerrar_api_automatica.sql'), 'utf8'));

      for (const rol of ['anon', 'authenticated']) {
        expect(await puede(rol, ejecutar('revocar_sesiones_de_empresa(uuid)'))).toBe(false);
        expect(await puede(rol, ejecutar('metricas_de_empresas()'))).toBe(false);
        expect(await puede(rol, "has_table_privilege($1, 'documentos', 'SELECT')")).toBe(false);
        expect(await puede(rol, "has_table_privilege($1, 'usuarios', 'UPDATE')")).toBe(false);
      }
      // Los roles de la API siguen pudiendo lo suyo.
      expect(await puede('app_plataforma', ejecutar('revocar_sesiones_de_empresa(uuid)'))).toBe(true);
      expect(await puede('app_empresa', "has_table_privilege($1, 'documentos', 'SELECT')")).toBe(true);
    });

    it('tampoco invocan los triggers, que siguen disparándose, y ninguna función depende del search_path (003)', async () => {
      // Lo que concede Supabase en un proyecto nuevo: todas las funciones de public.
      await crearRolesDeSupabase();
      await db.query('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated');
      // En Supabase se aplican en este orden: la 002 quita lo concedido a ellos y la 003, lo que reciben como public.
      for (const migracion of ['002_cerrar_api_automatica.sql', '003_endurecer_funciones.sql']) {
        await db.query(await readFile(join(DIRECTORIO_MIGRACIONES, migracion), 'utf8'));
      }

      const puede = async (rol: string, sql: string) => (await db.query(`SELECT ${sql} AS si`, [rol])).rows[0].si as boolean;
      for (const rol of ['anon', 'authenticated']) {
        for (const disparador of ['comprobar_autor_del_historial()', 'marcar_actualizacion()', 'rechazar_cambios_en_historial()']) {
          expect(await puede(rol, `has_function_privilege($1, '${disparador}', 'EXECUTE')`)).toBe(false);
        }
      }

      const { rows } = await db.query<{ funcion: string }>(`
        SELECT p.proname AS funcion FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')`);
      expect(rows.map((fila) => fila.funcion)).toEqual([]);

      // Sin EXECUTE, el trigger se dispara igual: el autor incoherente sigue rechazado y el coherente entra.
      await expect(como('app_empresa', empresaA,
        "INSERT INTO historial (empresa_id, usuario_id, rol_usuario, accion) VALUES ($1, $2, 'administrador', 'SESION_INICIADA')",
        [empresaA, adminB])).rejects.toMatchObject({ constraint: 'historial_autor_de_su_empresa' });
      await como('app_empresa', empresaA,
        "INSERT INTO historial (empresa_id, usuario_id, rol_usuario, accion) VALUES ($1, $2, 'administrador', 'SESION_INICIADA')",
        [empresaA, adminA]);
    });
  });
});
