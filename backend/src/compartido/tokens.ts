import { errors, jwtVerify, SignJWT } from 'jose';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lo único que lleva el token: quién es y qué sesión usa. El rol se lee de la base (D4). */
export interface Credencial {
  usuarioId: string;
  sesionId: string;
}

export interface Firmador {
  firmar(credencial: Credencial, expiraEn: Date): Promise<string>;
  /** Devuelve null si el token no es válido por cualquier motivo: firma, caducidad o forma. */
  verificar(token: string): Promise<Credencial | null>;
}

export function crearFirmador(secreto: string): Firmador {
  const clave = new TextEncoder().encode(secreto);
  return {
    firmar: ({ usuarioId, sesionId }, expiraEn) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(usuarioId)
        .setJti(sesionId)
        .setIssuedAt()
        .setExpirationTime(expiraEn)
        .sign(clave),

    async verificar(token) {
      try {
        const { payload } = await jwtVerify(token, clave, { algorithms: ['HS256'] });
        const { sub: usuarioId, jti: sesionId } = payload;
        if (!usuarioId || !sesionId || !UUID.test(usuarioId) || !UUID.test(sesionId)) return null;
        return { usuarioId, sesionId };
      } catch (error) {
        if (error instanceof errors.JOSEError) return null;
        throw error;
      }
    },
  };
}
