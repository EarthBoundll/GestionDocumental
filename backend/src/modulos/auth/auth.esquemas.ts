import { esquemaClaveNueva } from '../../compartido/claves.js';
import { z } from '../../compartido/validacion.js';

export const email = z.string().trim().toLowerCase().pipe(z.email('Escribe un correo válido').max(254));
// En el inicio de sesión no se aplican las reglas de una contraseña nueva: solo se compara.
const claveEscrita = z.string().min(1, 'Escribe la contraseña').max(200);

export const esquemaInicioSesion = z.object({ email, clave: claveEscrita });

export const esquemaCambioClave = z.object({ claveActual: claveEscrita, claveNueva: esquemaClaveNueva });

export const esquemaSolicitudRecuperacion = z.object({ email });

export const esquemaConfirmacionRecuperacion = z.object({
  token: z.string().trim().min(20, 'El enlace está incompleto').max(200),
  claveNueva: esquemaClaveNueva,
});

export type DatosInicioSesion = z.infer<typeof esquemaInicioSesion>;
export type DatosCambioClave = z.infer<typeof esquemaCambioClave>;
export type DatosConfirmacionRecuperacion = z.infer<typeof esquemaConfirmacionRecuperacion>;
