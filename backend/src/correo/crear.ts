import type { Entorno } from '../config/entorno.js';
import { CorreoBrevo, CorreoEnArchivo, type Correo } from './correo.js';

/** El correo que corresponde al entorno. Las variables ya están validadas: aquí no falta ninguna. */
export function crearCorreo(entorno: Entorno): Correo {
  if (entorno.CORREO === 'brevo') {
    return new CorreoBrevo({
      claveApi: entorno.BREVO_CLAVE_API ?? '',
      remitente: entorno.CORREO_REMITENTE ?? '',
      nombreRemitente: entorno.CORREO_REMITENTE_NOMBRE,
    });
  }
  return new CorreoEnArchivo(entorno.DIRECTORIO_CORREOS);
}
