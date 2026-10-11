import type { Mensaje } from '../../correo/correo.js';

const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, (caracter) => `&#${caracter.charCodeAt(0)};`);

const HORA_DE_LIMA = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});

/**
 * La hora del envío, para el asunto. Cada enlace nuevo anula los anteriores, y con el mismo asunto Gmail junta los
 * correos en una conversación y deja a la vista el primero, cuyo enlace ya no sirve: así cada correo es uno aparte.
 */
export const enviadoEl = (fecha = new Date()) => HORA_DE_LIMA.format(fecha).replace(',', '');

const USA_EL_MAS_RECIENTE = 'Cada correo nuevo anula el enlace anterior: si te llegó más de uno, usa el más reciente.';

/** Un correo con un solo botón: el texto plano dice lo mismo que el HTML, para los clientes que no lo muestran. */
function conBoton({ para, asunto, saludo, parrafos, boton, enlace, notas }: {
  para: string; asunto: string; saludo: string; parrafos: string[]; boton: string; enlace: string; notas: string[];
}): Mensaje {
  const texto = [saludo, '', ...parrafos, '', enlace, '', ...notas].join('\n');
  const html = `<!doctype html>
<html lang="es"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f2937;max-width:520px">
<p>${escapar(saludo)}</p>
${parrafos.map((parrafo) => `<p>${escapar(parrafo)}</p>`).join('\n')}
<p><a href="${escapar(enlace)}" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none">${escapar(boton)}</a></p>
<p style="font-size:14px;color:#4b5563">${notas.map(escapar).join('<br>')}</p>
</body></html>`;
  return { para, asunto, texto, html };
}

/** El correo con el enlace para definir una contraseña nueva. */
export function correoDeRecuperacion({ para, nombre, enlace, minutos }: {
  para: string; nombre: string; enlace: string; minutos: number;
}): Mensaje {
  return conBoton({
    para,
    asunto: `Recupera tu contraseña (${enviadoEl()}) · Gestión Documental`,
    saludo: `Hola, ${nombre}:`,
    parrafos: ['Alguien pidió recuperar la contraseña de tu cuenta. Si fuiste tú, abre este enlace y define una nueva:'],
    boton: 'Definir una contraseña nueva',
    enlace,
    notas: [
      `El enlace sirve una sola vez y caduca en ${minutos} minutos.`,
      USA_EL_MAS_RECIENTE,
      'Si no lo pediste, ignora este correo: tu contraseña sigue siendo la misma.',
    ],
  });
}

/** La invitación de una cuenta nueva (D41): al abrirla, la persona define su contraseña y verifica su correo. */
export function correoDeInvitacion({ para, nombre, empresa, enlace, horas }: {
  para: string; nombre: string; empresa: string | null; enlace: string; horas: number;
}): Mensaje {
  const donde = empresa ? `para ${empresa}` : 'para administrar la plataforma';
  return conBoton({
    para,
    asunto: `Activa tu cuenta${empresa ? ` de ${empresa}` : ''} (${enviadoEl()}) · Gestión Documental`,
    saludo: `Hola, ${nombre}:`,
    parrafos: [
      `Te crearon una cuenta en Gestión Documental ${donde}, con este correo.`,
      'Para activarla, abre este enlace y define tu contraseña. Nadie más la conocerá:',
    ],
    boton: 'Activar mi cuenta',
    enlace,
    notas: [
      `El enlace sirve una sola vez y caduca en ${horas} horas. Si caduca, pide otro con «¿Olvidaste tu contraseña?».`,
      USA_EL_MAS_RECIENTE,
      'Si no esperabas este correo, ignóralo: sin activarla, la cuenta no sirve para entrar.',
    ],
  });
}

/** Para confirmar el correo de una cuenta que ya tiene contraseña: una anterior a la verificación, o un correo nuevo. */
export function correoDeVerificacion({ para, nombre, enlace, horas }: {
  para: string; nombre: string; enlace: string; horas: number;
}): Mensaje {
  return conBoton({
    para,
    asunto: `Confirma tu correo (${enviadoEl()}) · Gestión Documental`,
    saludo: `Hola, ${nombre}:`,
    parrafos: ['Para seguir entrando a Gestión Documental, confirma que este correo es tuyo:'],
    boton: 'Confirmar mi correo',
    enlace,
    notas: [
      `El enlace sirve una sola vez y caduca en ${horas} horas.`,
      USA_EL_MAS_RECIENTE,
      'Tu contraseña no cambia. Si no reconoces esta cuenta, ignora este correo.',
    ],
  });
}

/** «a***@dominio.pe»: lo justo para reconocer el correo nuevo sin escribirlo entero. */
export function enmascarar(email: string): string {
  const [local = '', dominio = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${dominio}`;
}

/** Al correo anterior, cuando el Master cambia el de un administrador: si no fue con su acuerdo, lo sabrá. */
export function correoDeCambioDeCorreo({ para, nombre, nuevo }: { para: string; nombre: string; nuevo: string }): Mensaje {
  const texto = [
    `Hola, ${nombre}:`,
    '',
    `El correo con el que entras a Gestión Documental cambió a ${enmascarar(nuevo)}. Desde ahora, los avisos y la`,
    'recuperación de tu contraseña llegarán allí, y tus sesiones abiertas se cerraron.',
    '',
    'Si no lo pediste, escribe al administrador de la plataforma.',
  ].join('\n');
  const html = `<!doctype html>
<html lang="es"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f2937;max-width:520px">
${texto.split('\n\n').map((parrafo) => `<p>${escapar(parrafo.replaceAll('\n', ' '))}</p>`).join('\n')}
</body></html>`;
  return { para, asunto: 'Tu correo de acceso cambió · Gestión Documental', texto, html };
}
