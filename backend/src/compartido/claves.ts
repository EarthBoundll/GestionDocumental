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

/**
 * La contraseña del Master (CLAUDE.md v2): al menos 12 caracteres, y nunca su DNI, su correo ni solo
 * números. Devuelve por qué no sirve, o null si sirve. Se aplica al crearla, al cambiarla y al
 * restablecerla: no basta con exigirla una vez.
 */
export function problemaDeClaveDelMaster(clave: string, { email, dni }: { email: string; dni: string | null }): string | null {
  const normalizada = clave.toLowerCase();
  const usuarioDelCorreo = email.toLowerCase().split('@')[0] ?? '';
  if (clave.length < 12) return 'La contraseña del Master necesita al menos 12 caracteres';
  if (/^[\d\s.-]+$/.test(clave)) return 'No puede ser una secuencia de números';
  if (dni && normalizada.includes(dni)) return 'No puede contener el DNI';
  if (normalizada.includes(email.toLowerCase()) || (usuarioDelCorreo.length >= 4 && normalizada.includes(usuarioDelCorreo))) {
    return 'No puede contener el correo';
  }
  return null;
}
