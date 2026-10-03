import type { Mensaje } from '../../correo/correo.js';

const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, (caracter) => `&#${caracter.charCodeAt(0)};`);

/** El correo con el enlace para definir una contraseña nueva. */
export function correoDeRecuperacion({ para, nombre, enlace, minutos }: {
  para: string; nombre: string; enlace: string; minutos: number;
}): Mensaje {
  const asunto = 'Recupera tu contraseña · Gestión Documental';
  const texto = [
    `Hola, ${nombre}:`,
    '',
    'Alguien pidió recuperar la contraseña de tu cuenta. Si fuiste tú, abre este enlace y define una nueva:',
    '',
    enlace,
    '',
    `El enlace sirve una sola vez y caduca en ${minutos} minutos.`,
    'Si no lo pediste, ignora este correo: tu contraseña sigue siendo la misma.',
  ].join('\n');
  const html = `<!doctype html>
<html lang="es"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f2937;max-width:520px">
<p>Hola, ${escapar(nombre)}:</p>
<p>Alguien pidió recuperar la contraseña de tu cuenta. Si fuiste tú, define una nueva:</p>
<p><a href="${escapar(enlace)}" style="display:inline-block;padding:10px 16px;background:#1d4ed8;color:#fff;border-radius:6px;text-decoration:none">Definir una contraseña nueva</a></p>
<p style="font-size:14px;color:#4b5563">El enlace sirve una sola vez y caduca en ${minutos} minutos.
Si no lo pediste, ignora este correo: tu contraseña sigue siendo la misma.</p>
</body></html>`;
  return { para, asunto, texto, html };
}
