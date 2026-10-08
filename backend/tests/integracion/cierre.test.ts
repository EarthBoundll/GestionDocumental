import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eliminarDatosDeEmpresa, inventariarEmpresa, reemplazarRespaldos } from '../../src/cierre/cierre-del-estudio.js';
import {
  almacenamientoDePruebas, crearAppDePruebas, crearUsuarioEn, depositoDePruebas, iniciarSesion, registrarEmpresa, tokenDelMaster,
} from '../apoyo/api.js';
import { PDF, PNG } from '../apoyo/archivos.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

/*
 * El cierre del estudio (D33, docs/09 §10) se escribe y se prueba antes de la preprueba: borra todo lo de
 * la empresa evaluada —filas, archivos y respaldos— sin tocar nada de otra, y deja una constancia.
 */
describe('Cierre del estudio: eliminar los datos de una empresa (D33)', () => {
  let base: BaseDePruebas;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearAppDePruebas>;
  const almacenamiento = almacenamientoDePruebas();
  const a = {} as { empresaId: string; nombre: string; personas: string[]; correo: string };
  const b = {} as { empresaId: string; token: string; documentoId: string };

  const con = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function subir(token: string, nombre: string) {
    const { body: { datos: [categoria] } } = await request(app).get('/api/v1/categorias').set(con(token));
    const { body } = await request(app).post('/api/v1/documentos').set(con(token))
      .field('nombre', nombre).field('categoriaId', categoria.id).field('fechaDocumento', '2026-09-01')
      .attach('archivo', PDF, 'documento.pdf');
    return body.id as string;
  }

  /** Lo que tiene cada tabla de una empresa: lo de B no puede cambiar al borrar A. */
  async function filasDe(empresaId: string): Promise<Record<string, number>> {
    const { rows } = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'empresa_id' ORDER BY table_name");
    const conteos: Record<string, number> = {};
    for (const { table_name: tabla } of rows) {
      conteos[tabla] = (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${tabla} WHERE empresa_id = $1`, [empresaId])).rows[0]!.n;
    }
    return conteos;
  }

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    pool = base.pool;
    app = crearAppDePruebas(pool, {}, almacenamiento);

    // A: la empresa evaluada, con algo en cada tabla.
    const admin = await registrarEmpresa(app);
    a.empresaId = admin.empresa.id;
    a.nombre = admin.empresa.nombre;
    const empleada = await crearUsuarioEn(pool, a.empresaId);
    a.correo = empleada.email;
    a.personas = [admin.usuario.id, empleada.id];
    const sesion = await iniciarSesion(app, empleada.email);
    const documento = await subir(sesion, 'Contrato de alquiler');
    await request(app).post(`/api/v1/documentos/${documento}/versiones`).set(con(sesion)).attach('archivo', PDF, 'contrato-v2.pdf');
    const { body: solicitud } = await request(app).post(`/api/v1/documentos/${documento}/solicitudes`).set(con(sesion)).send({});
    await request(app).post(`/api/v1/solicitudes/${solicitud.id}/resolucion`).set(con(admin.token)).send({ decision: 'aprobada' });
    await request(app).post('/api/v1/categorias').set(con(admin.token))
      .send({ nombre: 'Planillas', restringida: true, usuariosAutorizados: [empleada.id] });
    await request(app).put('/api/v1/empresa/identidad/logo').set(con(admin.token)).attach('archivo', PNG, 'logo.png');
    await request(app).get('/api/v1/documentos').set(con(sesion));
    await request(app).post('/api/v1/auth/recuperacion').send({ email: empleada.email });
    await request(app).post('/api/v1/auth/login').send({ email: empleada.email, clave: 'equivocada' });
    // Un intento con su correo que no quedó en ninguna empresa: también la nombra.
    await pool.query(
      "INSERT INTO historial (accion, detalle) VALUES ('SESION_FALLIDA', jsonb_build_object('email', upper($1::text)))", [empleada.email]);

    // B: otra empresa, que no debe perder nada.
    const otra = await registrarEmpresa(app);
    b.empresaId = otra.empresa.id;
    b.token = otra.token;
    b.documentoId = await subir(otra.token, 'Factura de B');

    // Lo primero del cierre: el Master desactiva la empresa.
    await request(app).patch(`/api/v1/plataforma/empresas/${a.empresaId}/estado`).set(con(await tokenDelMaster(app))).send({ activa: false });
  });
  afterAll(() => base.cerrar());

  it('el simulacro cuenta lo que se borraría, tabla por tabla, sin borrar nada', async () => {
    const antes = await filasDe(a.empresaId);

    const { empresa, filas } = await inventariarEmpresa(pool, a.empresaId);

    expect(empresa).toEqual({ id: a.empresaId, nombre: a.nombre, activa: false });
    for (const tabla of ['documentos', 'documento_versiones', 'solicitudes', 'notificaciones', 'categoria_accesos', 'tiempos_respuesta',
      'historial', 'sesiones', 'recuperaciones_clave', 'usuarios']) {
      expect(filas[tabla], tabla).toBeGreaterThan(0);
    }
    expect(filas.empresas).toBe(1);
    expect(await filasDe(a.empresaId)).toEqual(antes);
  });

  it('se niega con la empresa activa o sin su nombre exacto, y entonces no toca nada', async () => {
    const antes = await filasDe(a.empresaId);

    await expect(eliminarDatosDeEmpresa(pool, almacenamiento, a.empresaId, { confirmacion: a.nombre.toUpperCase() }))
      .rejects.toThrow(`escribe el nombre exacto de la empresa: «${a.nombre}»`);
    await expect(eliminarDatosDeEmpresa(pool, almacenamiento, b.empresaId, { confirmacion: 'cualquiera' }))
      .rejects.toThrow('sigue activa: desactívala desde la plataforma');
    expect(await filasDe(a.empresaId)).toEqual(antes);
    expect(existsSync(join(tmpdir(), 'gestion-documental-archivos-de-prueba', a.empresaId))).toBe(true);
  });

  it('borra todo lo de la empresa —filas, archivos y su gente— y nada de la otra', async () => {
    const deB = await filasDe(b.empresaId);
    const esperadas = (await inventariarEmpresa(pool, a.empresaId)).filas;

    const resultado = await eliminarDatosDeEmpresa(pool, almacenamiento, a.empresaId, { confirmacion: a.nombre });

    expect(resultado.filas).toEqual(esperadas);
    expect(resultado.archivos).toBe(3); // las dos versiones del contrato y el logo
    expect(Object.values(await filasDe(a.empresaId)).every((n) => n === 0)).toBe(true);
    const { rows: [rastro] } = await pool.query<{ personas: number; correos: number }>(
      `SELECT (SELECT count(*)::int FROM usuarios WHERE id = ANY ($1::uuid[]))
              + (SELECT count(*)::int FROM sesiones WHERE usuario_id = ANY ($1::uuid[]))
              + (SELECT count(*)::int FROM recuperaciones_clave WHERE usuario_id = ANY ($1::uuid[]))
              + (SELECT count(*)::int FROM historial WHERE usuario_id = ANY ($1::uuid[])) AS personas,
              (SELECT count(*)::int FROM historial WHERE lower(detalle ->> 'email') = lower($2)) AS correos`,
      [a.personas, a.correo],
    );
    expect(rastro).toEqual({ personas: 0, correos: 0 });
    expect(existsSync(join(tmpdir(), 'gestion-documental-archivos-de-prueba', a.empresaId))).toBe(false);

    // B sigue entera, y su archivo se descarga.
    expect(await filasDe(b.empresaId)).toEqual(deB);
    const { body: enlace } = await request(app).get(`/api/v1/documentos/${b.documentoId}/archivo?modo=descargar`).set(con(b.token));
    expect((await request(app).get(new URL(enlace.url).pathname + new URL(enlace.url).search)).status).toBe(200);
  });

  it('deja una constancia sin datos personales que ve la auditoría del Master, y el historial vuelve a ser inalterable', async () => {
    const { rows: [constancia] } = await pool.query(
      "SELECT empresa_id, usuario_id, entidad_tipo, entidad_id, detalle FROM historial WHERE accion = 'EMPRESA_ELIMINADA'");

    expect(constancia).toMatchObject({ empresa_id: null, usuario_id: null, entidad_tipo: 'empresa', entidad_id: a.empresaId });
    expect(constancia.detalle).toMatchObject({ motivo: 'cierre del estudio', archivosBorrados: 3, filasBorradas: { empresas: 1 } });
    expect(JSON.stringify(constancia.detalle)).not.toMatch(new RegExp(`${a.nombre}|${a.correo}`, 'i'));
    const { body: auditoria } = await request(app).get('/api/v1/plataforma/historial?accion=EMPRESA_ELIMINADA').set(con(await tokenDelMaster(app)));
    expect(auditoria.datos).toHaveLength(1);
    await expect(pool.query("UPDATE historial SET detalle = '{}' WHERE accion = 'EMPRESA_ELIMINADA'")).rejects.toThrow('solo admite inserciones');
    await expect(pool.query("DELETE FROM historial WHERE accion = 'EMPRESA_ELIMINADA'")).rejects.toThrow('solo admite inserciones');
  });

  it('una segunda vez no encuentra la empresa: no hay nada que borrar', async () => {
    await expect(eliminarDatosDeEmpresa(pool, almacenamiento, a.empresaId, { confirmacion: a.nombre }))
      .rejects.toThrow(`No existe una empresa con el id ${a.empresaId}`);
  });

  it('con los respaldos, guarda uno nuevo ya sin la empresa y borra los anteriores, que aún la tenían', async () => {
    const deposito = depositoDePruebas();
    await deposito.guardar('respaldo-2026-10-01T08-00-00Z.json.gz', Buffer.from('antiguo'));
    await deposito.guardar('respaldo-2026-10-02T08-00-00Z.json.gz', Buffer.from('antiguo'));

    const { nuevo, eliminados } = await reemplazarRespaldos(pool, deposito);

    expect(eliminados.toSorted()).toEqual(['respaldo-2026-10-01T08-00-00Z.json.gz', 'respaldo-2026-10-02T08-00-00Z.json.gz']);
    expect((await deposito.listar()).map((respaldo) => respaldo.nombre)).toEqual([nuevo]);
    const contenido = gunzipSync(await deposito.leer(nuevo)).toString('utf8');
    expect(contenido).toContain(b.empresaId);
    expect(contenido).not.toContain(a.correo);
  });
});
