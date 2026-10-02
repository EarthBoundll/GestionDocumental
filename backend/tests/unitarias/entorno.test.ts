import { describe, expect, it } from 'vitest';
import { leerEntorno } from '../../src/config/entorno.js';

const LOCAL = 'postgresql://postgres:clave@localhost:5432/gestion';
const REMOTA = 'postgresql://postgres.abc:clave@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const CERTIFICADO = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';
const SECRETO = 'x'.repeat(32);
const minimas = { DATABASE_URL: LOCAL, JWT_SECRETO: SECRETO };
const supabase = { ALMACENAMIENTO: 'supabase', SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_CLAVE_SECRETA: 'sb_secret_0123456789abcdef' };

describe('leerEntorno', () => {
  it('con una base local bastan la URL y el secreto; el resto toma sus valores por defecto', () => {
    expect(leerEntorno(minimas)).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      DATABASE_URL: LOCAL,
      DATABASE_CA: undefined,
      JWT_SECRETO: SECRETO,
      JWT_DURACION_HORAS: 8,
      REGISTRO_ABIERTO: true,
      CORS_ORIGEN: ['http://localhost:5173'],
      PROXIES_DE_CONFIANZA: 0,
      DIAGNOSTICO_RED: false,
      ALMACENAMIENTO: 'disco',
      DIRECTORIO_ARCHIVOS: 'archivos',
      URL_PUBLICA: undefined,
      SUPABASE_URL: undefined,
      SUPABASE_CLAVE_SECRETA: undefined,
      STORAGE_BUCKET: 'documentos',
    });
  });

  it('acepta una base remota si viene con su certificado', () => {
    const entorno = leerEntorno({ ...minimas, ...supabase, DATABASE_URL: REMOTA, DATABASE_CA: CERTIFICADO, PORT: '8080', NODE_ENV: 'production' });

    expect(entorno).toMatchObject({ PORT: 8080, NODE_ENV: 'production', DATABASE_CA: CERTIFICADO });
  });

  it('lee varios orígenes de CORS separados por comas, y los interruptores como texto', () => {
    const entorno = leerEntorno({
      ...minimas,
      CORS_ORIGEN: 'https://gestion.vercel.app, http://localhost:5173',
      REGISTRO_ABIERTO: 'false',
      DIAGNOSTICO_RED: 'true',
      PROXIES_DE_CONFIANZA: '1',
    });

    expect(entorno).toMatchObject({
      CORS_ORIGEN: ['https://gestion.vercel.app', 'http://localhost:5173'],
      REGISTRO_ABIERTO: false,
      DIAGNOSTICO_RED: true,
      PROXIES_DE_CONFIANZA: 1,
    });
  });

  it('una variable vacía en el .env toma su valor por defecto', () => {
    expect(leerEntorno({ ...minimas, CORS_ORIGEN: '', REGISTRO_ABIERTO: '', JWT_DURACION_HORAS: '' })).toMatchObject({
      CORS_ORIGEN: ['http://localhost:5173'], REGISTRO_ABIERTO: true, JWT_DURACION_HORAS: 8,
    });
  });

  it.each([
    ['falta DATABASE_URL', { JWT_SECRETO: SECRETO }, 'DATABASE_URL'],
    ['falta JWT_SECRETO', { DATABASE_URL: LOCAL }, 'JWT_SECRETO'],
    ['el secreto es corto', { ...minimas, JWT_SECRETO: 'corto' }, 'JWT_SECRETO'],
    ['base remota sin certificado', { ...minimas, DATABASE_URL: REMOTA }, 'DATABASE_CA'],
    ['certificado vacío en el .env', { ...minimas, DATABASE_URL: REMOTA, DATABASE_CA: '' }, 'DATABASE_CA'],
    ['el certificado no es un certificado', { ...minimas, DATABASE_URL: REMOTA, DATABASE_CA: 'abc' }, 'DATABASE_CA'],
    ['sslmode en la URL', { ...minimas, DATABASE_URL: `${LOCAL}?sslmode=require` }, 'sslmode'],
    ['otro protocolo', { ...minimas, DATABASE_URL: 'mysql://localhost/gestion' }, 'DATABASE_URL'],
    ['algo que no es una URL', { ...minimas, DATABASE_URL: 'no es una url' }, 'DATABASE_URL'],
    ['puerto que no es un número', { ...minimas, PORT: 'ochenta' }, 'PORT'],
    ['entorno desconocido', { ...minimas, NODE_ENV: 'staging' }, 'NODE_ENV'],
    ['un origen de CORS que no es una URL', { ...minimas, CORS_ORIGEN: 'gestion.vercel.app' }, 'CORS_ORIGEN'],
    ['sesiones de más de un día', { ...minimas, JWT_DURACION_HORAS: '48' }, 'JWT_DURACION_HORAS'],
    ['un interruptor ilegible', { ...minimas, REGISTRO_ABIERTO: 'quizá' }, 'REGISTRO_ABIERTO'],
    ['producción con archivos en disco', { ...minimas, NODE_ENV: 'production' }, 'el disco de Render se borra'],
    ['supabase sin su clave', { ...minimas, ALMACENAMIENTO: 'supabase', SUPABASE_URL: 'https://abc.supabase.co' }, 'SUPABASE_CLAVE_SECRETA'],
    ['un almacenamiento desconocido', { ...minimas, ALMACENAMIENTO: 'ftp' }, 'ALMACENAMIENTO'],
  ])('rechaza el arranque si %s', (_caso, variables, mencion) => {
    expect(() => leerEntorno(variables)).toThrow(mencion);
  });

  it('enumera a la vez los problemas de cada variable, en español', () => {
    expect(() => leerEntorno({ PORT: 'ochenta' })).toThrow(
      /Variables de entorno inválidas:\n {2}- PORT: .*número.*\n {2}- DATABASE_URL: /,
    );
  });
});
