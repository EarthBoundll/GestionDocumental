import bcrypt from 'bcryptjs';
import { z } from './validacion.js';

// La instancia gratuita de Render tiene 0,1 CPU: con coste 10, un hash tarda alrededor de un segundo.
const COSTE = 10;

// Hash de una contraseña que nadie tiene. Cuando el correo no existe se compara igualmente contra él,
// para que la respuesta tarde lo mismo exista o no la cuenta y no se pueda averiguar qué correos hay.
const HASH_SIN_CUENTA = bcrypt.hashSync('sin cuenta asociada', COSTE);

/** RN19: al menos 8 caracteres y como máximo 72 bytes, el límite de bcrypt (se valida, no se recorta). */
export const esquemaClaveNueva = z
  .string()
  .min(8, 'Usa al menos 8 caracteres')
  .refine((clave) => Buffer.byteLength(clave, 'utf8') <= 72, 'Es demasiado larga: el máximo son 72 bytes');

export function hashearClave(clave: string): Promise<string> {
  return bcrypt.hash(clave, COSTE);
}

export async function claveCoincide(clave: string, hash: string | null): Promise<boolean> {
  const coincide = await bcrypt.compare(clave, hash ?? HASH_SIN_CUENTA);
  return hash !== null && coincide;
}
