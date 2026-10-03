import { errors, jwtVerify, SignJWT } from 'jose';
import { ROLES, type Rol } from './permisos.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lo que lleva el token: quién es, qué sesión usa, su empresa y su rol (CLAUDE.md v2). La API no confía
 * solo en él: en cada petición comprueba la sesión y lee el rol vigente de la base (D4).
 */
export interface Credencial {
  usuarioId: string;
  sesionId: string;
  empresaId: string | null;
  rol: Rol;
}

export interface Firmador {
  firmar(credencial: Credencial, expiraEn: Date): Promise<string>;
  /** Devuelve null si el token no es válido por cualquier motivo: firma, caducidad o forma. */
  verificar(token: string): Promise<Credencial | null>;
}

export function crearFirmador(secreto: string): Firmador {
  const clave = new TextEncoder().encode(secreto);
  return {
    firmar: ({ usuarioId, sesionId, empresaId, rol }, expiraEn) =>
      new SignJWT({ empresa_id: empresaId, rol })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(usuarioId)
        .setJti(sesionId)
        .setIssuedAt()
        .setExpirationTime(expiraEn)
        .sign(clave),

    async verificar(token) {
      try {
        const { payload } = await jwtVerify(token, clave, { algorithms: ['HS256'] });
        const { sub: usuarioId, jti: sesionId, empresa_id: empresaId, rol } = payload;
        if (!usuarioId || !sesionId || !UUID.test(usuarioId) || !UUID.test(sesionId)) return null;
        if (empresaId !== null && (typeof empresaId !== 'string' || !UUID.test(empresaId))) return null;
        if (typeof rol !== 'string' || !(ROLES as readonly string[]).includes(rol)) return null;
        return { usuarioId, sesionId, empresaId, rol: rol as Rol };
      } catch (error) {
        if (error instanceof errors.JOSEError) return null;
        throw error;
      }
    },
  };
}
