import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { aplicarMigraciones } from '../../src/db/migraciones.js';
import { crearBaseDePruebas, DIRECTORIO_MIGRACIONES, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

describe('aplicarMigraciones', () => {
  let base: BaseDePruebas;
  let directorio: string;

  beforeEach(async () => {
    base = await crearBaseDePruebas({ migrada: false });
    directorio = await mkdtemp(join(tmpdir(), 'migraciones-'));
  });
  afterEach(async () => {
    await base.cerrar();
    await rm(directorio, { recursive: true, force: true });
  });

  const escribir = (nombre: string, sql: string) => writeFile(join(directorio, nombre), sql);
  const existeTabla = async (tabla: string) =>
    (await base.pool.query('SELECT to_regclass($1) IS NOT NULL AS existe', [tabla])).rows[0]?.existe;
  const registradas = async () =>
    (await base.pool.query('SELECT archivo FROM esquema_migraciones ORDER BY archivo')).rows.map((fila) => fila.archivo);

  it('aplica las pendientes en orden y no repite las ya aplicadas', async () => {
    // La segunda depende de la primera: en otro orden fallaría.
    await escribir('002_columna.sql', 'ALTER TABLE uno ADD COLUMN nota text;');
    await escribir('001_tabla.sql', 'CREATE TABLE uno (id int);');

    expect(await aplicarMigraciones(base.pool, directorio)).toEqual(['001_tabla.sql', '002_columna.sql']);
    expect(await aplicarMigraciones(base.pool, directorio)).toEqual([]);
    expect(await registradas()).toEqual(['001_tabla.sql', '002_columna.sql']);
  });

  it('una migración que falla no deja nada a medias, y las anteriores se conservan', async () => {
    await escribir('001_tabla.sql', 'CREATE TABLE uno (id int);');
    await escribir('002_rota.sql', 'CREATE TABLE dos (id int);\nSELECT 1 / 0;');

    await expect(aplicarMigraciones(base.pool, directorio)).rejects.toMatchObject({ code: '22012' });
    expect(await existeTabla('uno')).toBe(true);
    expect(await existeTabla('dos')).toBe(false);
    expect(await registradas()).toEqual(['001_tabla.sql']);
  });

  it('se niega a seguir si una migración aplicada cambió, sin aplicar las nuevas', async () => {
    await escribir('001_tabla.sql', 'CREATE TABLE uno (id int);');
    await aplicarMigraciones(base.pool, directorio);
    await escribir('001_tabla.sql', 'CREATE TABLE uno (id bigint);');
    await escribir('002_nueva.sql', 'CREATE TABLE dos (id int);');

    await expect(aplicarMigraciones(base.pool, directorio)).rejects.toThrow('cambió después de aplicarse');
    expect(await existeTabla('dos')).toBe(false);
  });

  it('se niega a seguir si falta el archivo de una migración aplicada', async () => {
    await escribir('001_tabla.sql', 'CREATE TABLE uno (id int);');
    await aplicarMigraciones(base.pool, directorio);
    await rm(join(directorio, '001_tabla.sql'));

    await expect(aplicarMigraciones(base.pool, directorio)).rejects.toThrow('su archivo ya no existe');
  });

  it('los saltos de línea de Windows no cuentan como un cambio', async () => {
    await escribir('001_tabla.sql', 'CREATE TABLE uno (id int);\nCREATE TABLE dos (id int);\n');
    await aplicarMigraciones(base.pool, directorio);
    await escribir('001_tabla.sql', 'CREATE TABLE uno (id int);\r\nCREATE TABLE dos (id int);\r\n');

    expect(await aplicarMigraciones(base.pool, directorio)).toEqual([]);
  });

  it('rechaza nombres fuera de formato y números repetidos', async () => {
    await escribir('notas.sql', 'SELECT 1;');
    await expect(aplicarMigraciones(base.pool, directorio)).rejects.toThrow('no sigue el formato');

    await rm(join(directorio, 'notas.sql'));
    await escribir('001_una.sql', 'SELECT 1;');
    await escribir('001_otra.sql', 'SELECT 1;');
    await expect(aplicarMigraciones(base.pool, directorio)).rejects.toThrow('dos migraciones con el número 001');
  });

  it('las migraciones del proyecto se aplican sobre una base vacía', async () => {
    expect(await aplicarMigraciones(base.pool, DIRECTORIO_MIGRACIONES)).toEqual(['001_esquema_inicial.sql', '002_cerrar_api_automatica.sql', '003_endurecer_funciones.sql', '004_permisos_por_categoria.sql', '005_papelera.sql', '006_auditoria_y_bloqueo.sql', '007_respaldos.sql', '008_identidad_y_tema.sql', '009_versiones.sql', '010_rendimiento_y_listado.sql']);
    expect(await aplicarMigraciones(base.pool, DIRECTORIO_MIGRACIONES)).toEqual([]);
  });
});
