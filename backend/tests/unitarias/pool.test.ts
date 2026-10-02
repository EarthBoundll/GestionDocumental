import { describe, expect, it } from 'vitest';
import { crearPool } from '../../src/db/pool.js';

const CERTIFICADO = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';

describe('crearPool', () => {
  it('con certificado, verifica la identidad del servidor de base de datos', async () => {
    const pool = crearPool({ DATABASE_URL: 'postgresql://u:c@db.ejemplo.com:5432/x', DATABASE_CA: CERTIFICADO });

    expect(pool.options.ssl).toEqual({ ca: CERTIFICADO });
    await pool.end();
  });

  it('sin certificado no configura TLS: solo es válido para una base local', async () => {
    const pool = crearPool({ DATABASE_URL: 'postgresql://u:c@localhost:5432/x', DATABASE_CA: undefined });

    expect(pool.options.ssl).toBeUndefined();
    await pool.end();
  });
});
