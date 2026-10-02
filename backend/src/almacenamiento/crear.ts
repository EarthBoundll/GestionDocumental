import type { Entorno } from '../config/entorno.js';
import type { Almacenamiento } from './almacenamiento.js';
import { AlmacenamientoEnDisco } from './en-disco.js';
import { AlmacenamientoSupabase } from './supabase-storage.js';

export function crearAlmacenamiento(entorno: Entorno): Almacenamiento {
  if (entorno.ALMACENAMIENTO === 'supabase') {
    return new AlmacenamientoSupabase({
      // El entorno ya comprobó que existen cuando el almacenamiento es supabase.
      url: entorno.SUPABASE_URL!,
      claveSecreta: entorno.SUPABASE_CLAVE_SECRETA!,
      bucket: entorno.STORAGE_BUCKET,
    });
  }
  return new AlmacenamientoEnDisco({
    directorio: entorno.DIRECTORIO_ARCHIVOS,
    urlPublica: entorno.URL_PUBLICA ?? `http://localhost:${entorno.PORT}`,
    secreto: entorno.JWT_SECRETO,
  });
}
