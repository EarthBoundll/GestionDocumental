import { crearAlmacenamiento } from './almacenamiento/crear.js';
import { crearApp } from './app.js';
import { leerEntorno } from './config/entorno.js';
import { crearPool } from './db/pool.js';

function arrancar(): void {
  const entorno = leerEntorno();
  const pool = crearPool(entorno);
  const app = crearApp({ pool, entorno, almacenamiento: crearAlmacenamiento(entorno) });
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
    servidor.close(() => void pool.end());
  });
}

try {
  arrancar();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
