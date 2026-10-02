import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { conTransaccion } from '../../src/db/transaccion.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

describe('conTransaccion', () => {
  let base: BaseDePruebas;
  let pool: pg.Pool;

  beforeAll(async () => {
    base = await crearBaseDePruebas({ migrada: false });
    pool = base.pool;
    await pool.query('CREATE TABLE apuntes (texto text NOT NULL)');
  });
  afterAll(() => base.cerrar());
  beforeEach(() => pool.query('DELETE FROM apuntes'));

  const contar = async () => (await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM apuntes')).rows[0]?.n;

  it('confirma todo lo hecho con el cliente y devuelve el resultado del trabajo', async () => {
    const resultado = await conTransaccion(pool, async (cliente) => {
      await cliente.query("INSERT INTO apuntes VALUES ('operación'), ('su registro')");
      return 'hecho';
    });

    expect(resultado).toBe('hecho');
    expect(await contar()).toBe(2);
  });

  it('si el trabajo falla, deshace también lo que ya había hecho y relanza el mismo error', async () => {
    const fallo = new Error('el registro no se pudo escribir');

    const intento = conTransaccion(pool, async (cliente) => {
      await cliente.query("INSERT INTO apuntes VALUES ('operación')");
      throw fallo;
    });

    await expect(intento).rejects.toBe(fallo);
    expect(await contar()).toBe(0);
  });

  it('si la base rechaza una sentencia, nada de la transacción queda confirmado', async () => {
    const intento = conTransaccion(pool, async (cliente) => {
      await cliente.query("INSERT INTO apuntes VALUES ('operación')");
      await cliente.query('INSERT INTO apuntes VALUES (NULL)');
    });

    await expect(intento).rejects.toMatchObject({ code: '23502' });
    expect(await contar()).toBe(0);
  });

  it('devuelve la conexión al pool tanto si confirma como si falla', async () => {
    await conTransaccion(pool, async () => {});
    await conTransaccion(pool, async () => {
      throw new Error('falla');
    }).catch(() => {});

    expect(pool.idleCount).toBe(pool.totalCount);
    expect(pool.waitingCount).toBe(0);
  });
});
