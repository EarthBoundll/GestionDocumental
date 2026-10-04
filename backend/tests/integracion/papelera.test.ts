import { access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { purgarVencidos } from '../../src/tareas/purgar-papelera.js';
import {
  almacenamientoDePruebas, crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, registrarEmpresa,
} from '../apoyo/api.js';
import { PDF } from '../apoyo/archivos.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

type App = ReturnType<typeof crearAppDePruebas>;

const existe = (ruta: string) => access(join(tmpdir(), 'gestion-documental-archivos-de-prueba', ruta)).then(() => true, () => false);

/** La papelera de la empresa (RF26): restaurar, purgar a mano y la purga automática a los 30 días. */
describe('Papelera (RF26)', () => {
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
  const papelera = (token: string) => request(app).get('/api/v1/documentos/papelera').set(conToken(token));
  const restaurar = (token: string, id: string) => request(app).post(`/api/v1/documentos/papelera/${id}/restauracion`).set(conToken(token));
  const purgar = (token: string, id: string) => request(app).delete(`/api/v1/documentos/papelera/${id}`).set(conToken(token));
  const listar = async (token: string) => (await request(app).get('/api/v1/documentos').set(conToken(token))).body.datos as { id: string }[];
  const rutaDe = async (id: string) => (await pool.query('SELECT archivo_ruta FROM documentos WHERE id = $1', [id])).rows[0].archivo_ruta as string;

  /** Una empresa con un documento que su autora ya mandó a la papelera. */
  async function crearEscenario() {
    const { token: admin, empresa } = await registrarEmpresa(app);
    const autora = await crearUsuarioEn(pool, empresa.id);
    const usuario = await iniciarSesion(app, autora.email);
    const categoriaId = (await request(app).get('/api/v1/categorias').set(conToken(admin))).body.datos[0].id;
    const subida = await request(app).post('/api/v1/documentos').set(conToken(usuario))
      .field('nombre', 'Contrato de alquiler').field('categoriaId', categoriaId).field('fechaDocumento', '2026-09-01')
      .attach('archivo', PDF, 'contrato.pdf');
    expect(subida.status).toBe(201);
    expect((await request(app).delete(`/api/v1/documentos/${subida.body.id}`).set(conToken(usuario))).status).toBe(204);
    return { admin, usuario, autoraId: autora.id, empresa, documentoId: subida.body.id as string };
  }

  it('el administrador ve lo eliminado, quién lo eliminó y cuándo se purgará; un usuario no entra (403)', async () => {
    const { admin, usuario, autoraId, documentoId } = await crearEscenario();

    const respuesta = await papelera(admin);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.diasEnPapelera).toBe(30);
    expect(respuesta.body.paginacion.total).toBe(1);
    const [documento] = respuesta.body.datos;
    expect(documento).toMatchObject({ id: documentoId, nombre: 'Contrato de alquiler', eliminadoPor: { id: autoraId } });
    expect(Date.parse(documento.purgaEn) - Date.parse(documento.eliminadoEn)).toBe(30 * 24 * 60 * 60 * 1000);

    expect((await papelera(usuario)).status).toBe(403);
    expect((await restaurar(usuario, documentoId)).status).toBe(403);
    expect((await purgar(usuario, documentoId)).status).toBe(403);
  });

  it('restaurar devuelve el documento tal como estaba, y queda registrado', async () => {
    const { admin, usuario, empresa, documentoId } = await crearEscenario();

    const respuesta = await restaurar(admin, documentoId);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ id: documentoId, nombre: 'Contrato de alquiler' });
    expect((await listar(usuario)).map((d) => d.id)).toEqual([documentoId]);
    expect((await papelera(admin)).body.datos).toEqual([]);
    expect((await restaurar(admin, documentoId)).status).toBe(404);
    expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({
      accion: 'DOCUMENTO_RESTAURADO', entidad_id: documentoId, detalle: { nombre: 'Contrato de alquiler' },
    });
  });

  it('eliminar definitivamente borra el archivo, deja la fila como constancia y ya no se puede restaurar', async () => {
    const { admin, empresa, documentoId } = await crearEscenario();
    const ruta = await rutaDe(documentoId);
    expect(await existe(ruta)).toBe(true);

    expect((await purgar(admin, documentoId)).status).toBe(204);

    expect(await existe(ruta)).toBe(false);
    expect((await pool.query('SELECT purgado_en IS NOT NULL AS purgado FROM documentos WHERE id = $1', [documentoId])).rows)
      .toEqual([{ purgado: true }]);
    expect((await papelera(admin)).body.datos).toEqual([]);
    expect((await restaurar(admin, documentoId)).status).toBe(404);
    expect((await purgar(admin, documentoId)).status).toBe(404);
    expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({ accion: 'DOCUMENTO_PURGADO', entidad_id: documentoId });
    const { rows: [metricas] } = await pool.query('SELECT almacenamiento_bytes::int AS bytes FROM metricas_de_empresas() WHERE empresa_id = $1', [empresa.id]);
    expect(metricas.bytes).toBe(0);
  });

  it('solo se purga lo que está en la papelera: un documento vigente no (404)', async () => {
    const { admin, documentoId } = await crearEscenario();
    await restaurar(admin, documentoId);

    expect((await purgar(admin, documentoId)).status).toBe(404);
    expect(await existe(await rutaDe(documentoId))).toBe(true);
  });

  it('la papelera de otra empresa no existe para un administrador (404)', async () => {
    const { documentoId } = await crearEscenario();
    const otra = await registrarEmpresa(app);

    expect((await papelera(otra.token)).body.datos).toEqual([]);
    expect((await restaurar(otra.token, documentoId)).status).toBe(404);
    expect((await purgar(otra.token, documentoId)).status).toBe(404);
  });

  it('la purga automática borra lo que pasó de 30 días, con el sistema como autor, y respeta lo reciente', async () => {
    const vencido = await crearEscenario();
    const reciente = await crearEscenario();
    await pool.query("UPDATE documentos SET eliminado_en = now() - interval '31 days' WHERE id = $1", [vencido.documentoId]);
    await pool.query("UPDATE documentos SET eliminado_en = now() - interval '29 days' WHERE id = $1", [reciente.documentoId]);
    const rutaVencida = await rutaDe(vencido.documentoId);

    expect(await purgarVencidos(pool, almacenamientoDePruebas())).toBe(1);

    expect(await existe(rutaVencida)).toBe(false);
    expect(await existe(await rutaDe(reciente.documentoId))).toBe(true);
    expect((await historialDe(pool, vencido.empresa.id)).at(-1)).toMatchObject({
      accion: 'DOCUMENTO_PURGADO', usuario_id: null, rol_usuario: null, entidad_id: vencido.documentoId,
      detalle: { nombre: 'Contrato de alquiler', motivo: 'PLAZO_VENCIDO', dias: 30 }, es_movil: null,
    });
    expect(await purgarVencidos(pool, almacenamientoDePruebas())).toBe(0);
  });

  it('la purga automática también alcanza lo de una categoría restringida', async () => {
    const { admin, documentoId } = await crearEscenario();
    const { categoria_id: categoriaId } = (await pool.query('SELECT categoria_id FROM documentos WHERE id = $1', [documentoId])).rows[0];
    await request(app).patch(`/api/v1/categorias/${categoriaId}`).set(conToken(admin)).send({ restringida: true });
    await pool.query("UPDATE documentos SET eliminado_en = now() - interval '40 days' WHERE id = $1", [documentoId]);

    expect(await purgarVencidos(pool, almacenamientoDePruebas())).toBe(1);
  });
});
