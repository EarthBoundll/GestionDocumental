import { crearAlmacenamiento } from './almacenamiento/crear.js';
import { crearApp } from './app.js';
import { leerEntorno } from './config/entorno.js';
import { crearCorreo } from './correo/crear.js';
import { crearPool } from './db/pool.js';
import { crearDeposito } from './respaldos/deposito.js';
import { programarPurga } from './tareas/purgar-papelera.js';
import { programarRespaldos } from './tareas/respaldo-nocturno.js';

function arrancar(): void {
  const entorno = leerEntorno();
  const pool = crearPool(entorno);
  const almacenamiento = crearAlmacenamiento(entorno);
  const respaldos = crearDeposito(entorno);
  const app = crearApp({ pool, entorno, almacenamiento, correo: crearCorreo(entorno), respaldos });
  const detenerPurga = programarPurga(pool, almacenamiento);
  const detenerRespaldos = programarRespaldos(pool, respaldos);
  const servidor = app.listen(entorno.PORT, (error) => {
    if (error) {
      console.error(`No se pudo escuchar en el puerto ${entorno.PORT}: ${error.message}`);
      process.exit(1);
    }
    console.log(`API escuchando en el puerto ${entorno.PORT} (${entorno.NODE_ENV}, archivos en ${entorno.ALMACENAMIENTO})`);
  });

  // Render envía SIGTERM antes de sustituir la instancia en cada despliegue: se dejan terminar
  // las peticiones en curso y después se cierran las conexiones a la base.
  process.once('SIGTERM', () => {
    detenerPurga();
    detenerRespaldos();
    servidor.close(() => void pool.end());
  });
}

try {
  arrancar();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
