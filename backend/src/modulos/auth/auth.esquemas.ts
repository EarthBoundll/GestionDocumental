import { esquemaClaveNueva } from '../../compartido/claves.js';
import { z } from '../../compartido/validacion.js';

const email = z.string().trim().toLowerCase().pipe(z.email('Escribe un correo válido').max(254));
const nombre = (maximo: number) => z.string().trim().min(2, 'Escribe al menos 2 caracteres').max(maximo);
// En el inicio de sesión no se aplican las reglas de una contraseña nueva: solo se compara.
const claveEscrita = z.string().min(1, 'Escribe la contraseña').max(200);

export const esquemaRegistro = z.object({
  organizacion: z.object({
    nombre: nombre(150),
    ruc: z.preprocess(
      (valor) => (valor === '' ? undefined : valor),
      z.string().trim().regex(/^\d{11}$/, 'El RUC tiene 11 dígitos').optional(),
    ),
  }),
  administrador: z.object({ nombre: nombre(120), email, clave: esquemaClaveNueva }),
});

export const esquemaInicioSesion = z.object({ email, clave: claveEscrita });

export const esquemaCambioClave = z.object({ claveActual: claveEscrita, claveNueva: esquemaClaveNueva });

export type DatosRegistro = z.infer<typeof esquemaRegistro>;
export type DatosInicioSesion = z.infer<typeof esquemaInicioSesion>;
export type DatosCambioClave = z.infer<typeof esquemaCambioClave>;
