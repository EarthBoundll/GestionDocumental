/**
 * El contacto público de la plataforma (D38): para que una empresa pida su cuenta y para ejercer los derechos
 * sobre los datos personales. Sale de las variables de compilación (VITE_CONTACTO_EMAIL y, si se quiere,
 * VITE_CONTACTO_WHATSAPP), nunca del código; sin ellas, la pantalla simplemente no lo ofrece.
 */
export interface Contacto {
  correo: string | null;
  /** Solo dígitos, con el código del país (51 para Perú), como lo pide wa.me. */
  whatsapp: string | null;
}

export function contacto(): Contacto {
  const correo = String(import.meta.env.VITE_CONTACTO_EMAIL ?? '').trim();
  const whatsapp = String(import.meta.env.VITE_CONTACTO_WHATSAPP ?? '').replace(/\D/g, '');
  return { correo: correo || null, whatsapp: whatsapp || null };
}

/** Un correo ya escrito con lo que hace falta para dar de alta una empresa, y nada más (datos mínimos). */
export function correoParaSolicitarCuenta(correo: string): string {
  const asunto = 'Solicitud de cuenta para mi empresa';
  const cuerpo = [
    'Hola, quisiera usar el sistema de gestión documental en mi empresa.',
    '',
    'Empresa:',
    'Rubro:',
    'Nombre de quien la administrará:',
    'Correo de esa persona:',
    'Teléfono de contacto:',
  ].join('\n');
  return `mailto:${correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
}

export function whatsappParaSolicitarCuenta(numero: string): string {
  const texto = 'Hola, quisiera una cuenta del sistema de gestión documental para mi empresa.';
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
