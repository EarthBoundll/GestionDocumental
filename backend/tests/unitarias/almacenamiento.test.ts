import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AlmacenamientoEnDisco } from '../../src/almacenamiento/en-disco.js';
import { AlmacenamientoSupabase } from '../../src/almacenamiento/supabase-storage.js';
import { identificarTipo } from '../../src/compartido/tipos-de-archivo.js';
import { DOCX, EJECUTABLE, PDF, PNG } from '../apoyo/archivos.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';

describe('AlmacenamientoSupabase', () => {
  /** Intercepta las peticiones del cliente oficial de Storage y responde como lo haría Supabase. */
  function conPeticionesInterceptadas(responder: (url: URL, init: RequestInit) => object = () => ({})) {
    const peticiones: { metodo: string; url: URL; cabeceras: Headers; cuerpo: unknown }[] = [];
    const fetchFalso = async (entrada: string | URL | Request, init: RequestInit = {}) => {
      const url = new URL(String(entrada));
      peticiones.push({ metodo: init.method ?? 'GET', url, cabeceras: new Headers(init.headers), cuerpo: init.body });
      return new Response(JSON.stringify(responder(url, init)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const almacenamiento = new AlmacenamientoSupabase({
      url: 'https://proyecto.supabase.co/', claveSecreta: 'sb_secret_clave_de_prueba_1234', bucket: 'documentos', fetch: fetchFalso as typeof fetch,
    });
    return { almacenamiento, peticiones };
  }

  it('sube al bucket privado con la clave secreta, el tipo y sin sobrescribir', async () => {
    const { almacenamiento, peticiones } = conPeticionesInterceptadas(() => ({ Key: 'documentos/x', Id: '1' }));

    await almacenamiento.subir(`${ORG}/${DOC}.pdf`, PDF, 'application/pdf');

    const [peticion] = peticiones;
    expect(peticion?.metodo).toBe('POST');
    expect(peticion?.url.href).toBe(`https://proyecto.supabase.co/storage/v1/object/documentos/${ORG}/${DOC}.pdf`);
    expect(peticion?.cabeceras.get('apikey')).toBe('sb_secret_clave_de_prueba_1234');
    expect(peticion?.cabeceras.get('x-upsert')).toBe('false');
  });

  it('firma enlaces: «descargar» con el nombre original, «ver» sin él', async () => {
    const { almacenamiento, peticiones } = conPeticionesInterceptadas(() => ({ signedURL: '/object/sign/documentos/x?token=abc' }));

    const descarga = await almacenamiento.firmarEnlace(`${ORG}/${DOC}.pdf`, { segundos: 300, tipoMime: 'application/pdf', descargarComo: 'factura junio.pdf' });
    const ver = await almacenamiento.firmarEnlace(`${ORG}/${DOC}.pdf`, { segundos: 300, tipoMime: 'application/pdf' });

    expect(peticiones[0]?.url.pathname).toBe(`/storage/v1/object/sign/documentos/${ORG}/${DOC}.pdf`);
    expect(JSON.parse(String(peticiones[0]?.cuerpo))).toEqual({ expiresIn: 300 });
    expect(new URL(descarga).searchParams.get('download')).toBe('factura junio.pdf');
    expect(new URL(ver).searchParams.has('download')).toBe(false);
  });

  it('si Supabase responde con error, lo propaga en vez de seguir como si nada', async () => {
    const fetchQueFalla = (async () => new Response(JSON.stringify({ statusCode: '403', error: 'Unauthorized', message: 'invalid signature' }), { status: 403 })) as typeof fetch;
    const almacenamiento = new AlmacenamientoSupabase({ url: 'https://proyecto.supabase.co', claveSecreta: 'sb_secret_clave_de_prueba_1234', bucket: 'documentos', fetch: fetchQueFalla });

    await expect(almacenamiento.subir(`${ORG}/${DOC}.pdf`, PDF, 'application/pdf')).rejects.toThrow('Supabase no aceptó el archivo');
  });

  it('vacía la carpeta de una empresa de a cien, hasta que no queda nada (D33)', async () => {
    const tandas = [Array.from({ length: 100 }, (_, n) => ({ name: `${n}.pdf` })), [{ name: 'logo.png' }], []];
    const { almacenamiento, peticiones } = conPeticionesInterceptadas((url) => (url.pathname.includes('/object/list/') ? tandas.shift()! : []));

    expect(await almacenamiento.vaciarCarpeta(ORG)).toBe(101);
    const borrados = peticiones.filter((p) => p.metodo === 'DELETE').map((p) => JSON.parse(String(p.cuerpo)).prefixes as string[]);
    expect(borrados.map((lista) => lista.length)).toEqual([100, 1]);
    expect(borrados[1]).toEqual([`${ORG}/logo.png`]);
    expect(JSON.parse(String(peticiones[0]!.cuerpo))).toMatchObject({ prefix: ORG, limit: 100 });
  });

  it('solo vacía la carpeta de una empresa: ni la raíz del bucket ni una ruta inventada', async () => {
    const { almacenamiento, peticiones } = conPeticionesInterceptadas();

    await expect(almacenamiento.vaciarCarpeta('')).rejects.toThrow('no es la carpeta de una empresa');
    await expect(almacenamiento.vaciarCarpeta(`${ORG}/..`)).rejects.toThrow('no es la carpeta de una empresa');
    expect(peticiones).toHaveLength(0);
  });
});

describe('AlmacenamientoEnDisco', () => {
  let directorio: string;
  beforeEach(async () => {
    directorio = await mkdtemp(join(tmpdir(), 'disco-'));
  });
  afterEach(() => rm(directorio, { recursive: true, force: true }));

  const crear = () => new AlmacenamientoEnDisco({ directorio, urlPublica: 'http://localhost:4000/', secreto: 'x'.repeat(32) });

  it('no sobrescribe un archivo existente', async () => {
    const disco = crear();
    await disco.subir(`${ORG}/${DOC}.pdf`, PDF);

    await expect(disco.subir(`${ORG}/${DOC}.pdf`, PDF)).rejects.toMatchObject({ code: 'EEXIST' });
  });

  it('nunca escribe fuera de su carpeta, aunque le llegue una ruta con «..»', async () => {
    await expect(crear().subir('../../fuera.pdf', PDF)).rejects.toThrow('El archivo no existe');
  });

  it('los enlaces apuntan a la API pública y llevan caducidad y firma', async () => {
    const enlace = new URL(await crear().firmarEnlace(`${ORG}/${DOC}.pdf`, { segundos: 300, tipoMime: 'application/pdf' }));

    expect(enlace.origin + enlace.pathname).toBe(`http://localhost:4000/api/v1/archivos/${ORG}/${DOC}.pdf`);
    expect(Number(enlace.searchParams.get('expira'))).toBeGreaterThan(Date.now() / 1000 + 290);
    expect(enlace.searchParams.get('firma')).toMatch(/^[\w-]{43}$/);
  });

  it('vacía la carpeta de una empresa y deja intactas las demás (D33)', async () => {
    const disco = crear();
    await disco.subir(`${ORG}/${DOC}.pdf`, PDF);
    await disco.subir(`${ORG}/${DOC.replace('2222-4', '3333-4')}.png`, PNG);
    await disco.subir(`${DOC}/${ORG}.pdf`, PDF);

    expect(await disco.vaciarCarpeta(ORG)).toBe(2);
    expect(await disco.vaciarCarpeta(ORG)).toBe(0);
    expect(existsSync(join(directorio, DOC, `${ORG}.pdf`))).toBe(true);
    expect(existsSync(join(directorio, ORG))).toBe(false);
    await expect(disco.vaciarCarpeta('..')).rejects.toThrow('no es la carpeta de una empresa');
  });
});

describe('identificarTipo (RN09)', () => {
  it.each([
    ['contrato.PDF', PDF, 'application/pdf'],
    ['foto.png', PNG, 'image/png'],
    ['acta.docx', DOCX, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ])('acepta %s', (nombre, contenido, mime) => {
    expect(identificarTipo(nombre, contenido).mime).toBe(mime);
  });

  it.each([
    ['un ejecutable con nombre de PDF', 'factura.pdf', EJECUTABLE],
    ['una extensión no admitida', 'notas.txt', PDF],
    ['un archivo sin extensión', 'factura', PDF],
    ['un PNG que dice ser PDF', 'factura.pdf', PNG],
    ['un nombre que coincide con una propiedad heredada', 'archivo.constructor', PDF],
  ])('rechaza %s', (_caso, nombre, contenido) => {
    expect(() => identificarTipo(nombre, contenido)).toThrow('Solo se admiten archivos');
  });
});
