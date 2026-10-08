import type { Server } from 'node:http';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generarDocumentos, subirDocumentos } from '../../scripts/documentos-de-prueba.js';
import { CLAVE, crearAppDePruebas, crearUsuarioEn, registrarEmpresa } from '../apoyo/api.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

describe('Documentos de prueba subidos por la API (D34)', () => {
  let base: BaseDePruebas;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearAppDePruebas>;
  let servidor: Server;
  let api: string;

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    pool = base.pool;
    app = crearAppDePruebas(pool);
    servidor = app.listen(0);
    const direccion = servidor.address();
    api = `http://127.0.0.1:${typeof direccion === 'object' && direccion ? direccion.port : 0}`;
  });
  afterAll(async () => {
    servidor.close();
    await base.cerrar();
  });

  const subidosEn = async (empresaId: string) => (await pool.query<{ nombre: string; categoria: string }>(
    `SELECT d.nombre, c.nombre AS categoria FROM documentos d JOIN categorias c ON c.id = d.categoria_id
     WHERE d.empresa_id = $1 ORDER BY d.creado_en`, [empresaId])).rows;

  it('la administradora los sube con su categoría, y las que faltaban se crean', async () => {
    const { empresa, usuario } = await registrarEmpresa(app);
    const documentos = generarDocumentos(8);

    await subirDocumentos(documentos, { api, email: usuario.email, clave: CLAVE, avisar: () => {} });

    expect(await subidosEn(empresa.id)).toEqual(documentos.map(({ nombre, categoria }) => ({ nombre, categoria })));
  });

  it('una usuaria no puede crear categorías: lo de las que faltan va a «Otros»', async () => {
    const { empresa } = await registrarEmpresa(app);
    const usuaria = await crearUsuarioEn(pool, empresa.id);

    await subirDocumentos(generarDocumentos(4), { api, email: usuaria.email, clave: CLAVE, avisar: () => {} });

    expect((await subidosEn(empresa.id)).map((d) => d.categoria)).toEqual(['Facturas y boletas', 'Facturas y boletas', 'Otros', 'Otros']);
  });
});
