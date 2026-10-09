import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

/*
 * Un PostgreSQL 17 de verdad —la versión mayor de Supabase— en un directorio temporal y en un puerto
 * libre, que se borra al detenerlo. Lo usan las pruebas, una vez por ejecución, y el ensayo de
 * restauración de un respaldo: ninguno instala nada ni toca otra base.
 */

export interface PostgresDesechable {
  puerto: number;
  usuario: string;
  clave: string;
  detener(): Promise<void>;
}

export async function arrancarPostgresDesechable(): Promise<PostgresDesechable> {
  const credenciales = { usuario: 'postgres', clave: 'postgres' };
  const puerto = await buscarPuertoLibre();
  const directorio = await mkdtemp(join(tmpdir(), 'gestion-documental-pg-'));
  const servidor = new EmbeddedPostgres({
    databaseDir: directorio,
    port: puerto,
    user: credenciales.usuario,
    password: credenciales.clave,
    persistent: false,
    // UTF-8 con el proveedor de localización propio de PostgreSQL: lower() convierte bien «Á» en
    // «á», como en Supabase, sin depender de las localizaciones instaladas en cada sistema operativo.
    initdbFlags: ['--encoding=UTF8', '--locale=C', '--locale-provider=builtin', '--builtin-locale=C.UTF-8'],
    onLog: () => {},
  });
  conservarCodigoDeSalida();
  try {
    await servidor.initialise();
    await servidor.start();
  } catch (error) {
    // Si no llegó a arrancar, stop() no lo borraría.
    await rm(directorio, { recursive: true, force: true });
    throw error;
  }
  return { puerto, ...credenciales, detener: () => servidor.stop() };
}

/**
 * embedded-postgres registra async-exit-hook, que al terminar llama a process.exit(0) y pisa el código de
 * salida: la integración continua daba verde con pruebas en rojo, y un ensayo fallido parecería correcto.
 * Se guarda el código antes de ese exit(0) y se restituye al salir (Node lee process.exitCode tras «exit»).
 */
let codigoConservado = false;
function conservarCodigoDeSalida() {
  if (codigoConservado) return;
  codigoConservado = true;
  let codigo = 0;
  process.on('beforeExit', () => {
    codigo ||= Number(process.exitCode ?? 0);
  });
  process.on('exit', () => {
    if (codigo) process.exitCode = codigo;
  });
}

function buscarPuertoLibre(): Promise<number> {
  return new Promise((resolver, rechazar) => {
    const sonda = createServer();
    sonda.once('error', rechazar);
    sonda.listen(0, '127.0.0.1', () => {
      const direccion = sonda.address();
      sonda.close(() => (typeof direccion === 'object' && direccion ? resolver(direccion.port) : rechazar(new Error('Sin puerto'))));
    });
  });
}
