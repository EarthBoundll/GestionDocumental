import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { problemaDeClaveDelMaster } from '../../src/compartido/claves.js';
import { crearMaster, leerDatosDelMaster } from '../../src/modulos/auth/master.js';
import { crearAppDePruebas, historialDe, MASTER_DE_PRUEBAS } from '../apoyo/api.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

describe('La cuenta del Administrador Master (CLAUDE.md v2)', () => {
  let base: BaseDePruebas;
  let pool: pg.Pool;

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    pool = base.pool;
  });
  afterAll(() => base.cerrar());

  const variables = {
    MASTER_EMAIL: MASTER_DE_PRUEBAS.email,
    MASTER_NOMBRE: MASTER_DE_PRUEBAS.nombre,
    MASTER_DNI: MASTER_DE_PRUEBAS.dni,
    MASTER_PASSWORD: MASTER_DE_PRUEBAS.clave,
  };

  it('el script lo crea una sola vez, con la contraseña en bcrypt, y volver a ejecutarlo no cambia nada', async () => {
    const primera = await crearMaster(pool, leerDatosDelMaster(variables));
    const segunda = await crearMaster(pool, leerDatosDelMaster({ ...variables, MASTER_PASSWORD: 'otra-clave-distinta-larga' }));

    expect(primera).toEqual({ creado: true, id: expect.any(String) });
    expect(segunda).toEqual({ creado: false, motivo: 'El Master ya existe: no se ha cambiado nada' });
    const { rows } = await pool.query("SELECT empresa_id, email, dni, clave_hash FROM usuarios WHERE rol = 'master'");
    expect(rows).toEqual([{ empresa_id: null, email: MASTER_DE_PRUEBAS.email, dni: MASTER_DE_PRUEBAS.dni, clave_hash: expect.stringMatching(/^\$2[aby]\$1\d\$/) }]);
    expect(rows[0].clave_hash).not.toContain(MASTER_DE_PRUEBAS.clave);
    expect((await historialDe(pool, null)).find((fila) => fila.accion === 'USUARIO_CREADO')).toMatchObject({
      usuario_id: null, entidad_id: primera.creado ? primera.id : '', detalle: { rol: 'master', origen: 'script de inicialización' },
    });
  });

  it('la base no admite un segundo Master, venga de donde venga', async () => {
    await crearMaster(pool, leerDatosDelMaster(variables));

    await expect(pool.query(
      `INSERT INTO usuarios (empresa_id, nombre, email, clave_hash, rol) VALUES (NULL, 'Intruso', 'intruso@ejemplo.pe', $1, 'master')`,
      ['$2b$10$' + 'x'.repeat(53)],
    )).rejects.toMatchObject({ code: '23505', constraint: 'usuarios_un_solo_master' });
  });

  it.each([
    ['menos de 12 caracteres', 'Corta-123', 'al menos 12 caracteres'],
    ['una secuencia de números', '123456789012', 'secuencia de números'],
    ['el DNI dentro', `clave-${MASTER_DE_PRUEBAS.dni}-x`, 'DNI'],
    ['el correo dentro', `${MASTER_DE_PRUEBAS.email}-clave`, 'correo'],
    ['la parte del correo antes de la arroba', 'plataforma-y-algo-mas', 'correo'],
  ])('rechaza una contraseña con %s', (_caso, clave, mencion) => {
    expect(problemaDeClaveDelMaster(clave, { email: MASTER_DE_PRUEBAS.email, dni: MASTER_DE_PRUEBAS.dni })).toContain(mencion);
    expect(() => leerDatosDelMaster({ ...variables, MASTER_PASSWORD: clave })).toThrow(mencion);
  });

  it('el error de unos datos inválidos no repite ningún valor', () => {
    const intento = () => leerDatosDelMaster({ ...variables, MASTER_PASSWORD: '123456789012', MASTER_DNI: '12' });

    expect(intento).toThrow(/MASTER_PASSWORD[\s\S]*MASTER_DNI|MASTER_DNI[\s\S]*MASTER_PASSWORD/);
    expect(intento).not.toThrow('123456789012');
  });

  it('el Master entra con su correo, su token no lleva empresa y su perfil tampoco', async () => {
    await crearMaster(pool, leerDatosDelMaster(variables));
    const app = crearAppDePruebas(pool);

    const respuesta = await request(app).post('/api/v1/auth/login').send({ email: MASTER_DE_PRUEBAS.email, clave: MASTER_DE_PRUEBAS.clave });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ usuario: { rol: 'master', dni: MASTER_DE_PRUEBAS.dni }, empresa: null });
    const carga = JSON.parse(Buffer.from(respuesta.body.token.split('.')[1], 'base64url').toString());
    expect(carga).toMatchObject({ empresa_id: null, rol: 'master' });
    const yo = await request(app).get('/api/v1/auth/yo').set('Authorization', `Bearer ${respuesta.body.token}`);
    expect(yo.body).toMatchObject({ usuario: { rol: 'master' }, empresa: null });
  });

  it('el DNI no sirve para entrar: solo el correo identifica', async () => {
    await crearMaster(pool, leerDatosDelMaster(variables));
    const app = crearAppDePruebas(pool);

    const respuesta = await request(app).post('/api/v1/auth/login').send({ email: MASTER_DE_PRUEBAS.dni, clave: MASTER_DE_PRUEBAS.clave });

    expect(respuesta.status).toBe(400);
  });

  it('al cambiar su contraseña, la nueva también tiene que cumplir sus reglas', async () => {
    await crearMaster(pool, leerDatosDelMaster(variables));
    const app = crearAppDePruebas(pool);
    const { body } = await request(app).post('/api/v1/auth/login').send({ email: MASTER_DE_PRUEBAS.email, clave: MASTER_DE_PRUEBAS.clave });
    const cambiar = (claveNueva: string) => request(app).put('/api/v1/auth/clave').set('Authorization', `Bearer ${body.token}`)
      .send({ claveActual: MASTER_DE_PRUEBAS.clave, claveNueva });

    const corta = await cambiar('solo-diez!');
    expect(corta.status).toBe(400);
    expect(corta.body.error.detalles).toEqual([{ campo: 'claveNueva', mensaje: 'La contraseña del Master necesita al menos 12 caracteres' }]);
    expect((await cambiar('987654321098')).status).toBe(400);
    expect((await cambiar('otra-clave-maestra-valida')).status).toBe(204);
    // Se deja como estaba para las demás pruebas de este archivo.
    await request(app).put('/api/v1/auth/clave').set('Authorization', `Bearer ${body.token}`)
      .send({ claveActual: 'otra-clave-maestra-valida', claveNueva: MASTER_DE_PRUEBAS.clave });
  });
});
