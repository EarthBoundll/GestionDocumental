import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface Mensaje {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

/**
 * Cómo salen los correos (D19). Detrás de una interfaz, como el almacenamiento: en producción, Brevo
 * por su API HTTPS (Render gratuito bloquea los puertos SMTP); en desarrollo y pruebas, un archivo.
 */
export interface Correo {
  enviar(mensaje: Mensaje): Promise<void>;
}

/** Desarrollo: cada correo se guarda como un archivo y su contenido sale por consola, enlace incluido. */
export class CorreoEnArchivo implements Correo {
  readonly #directorio: string;

  constructor(directorio: string) {
    this.#directorio = resolve(directorio);
  }

  async enviar(mensaje: Mensaje): Promise<void> {
    await mkdir(this.#directorio, { recursive: true });
    const nombre = `${new Date().toISOString().replace(/[:.]/g, '-')}-${mensaje.para.replace(/[^\w.@-]/g, '_')}.txt`;
    await writeFile(join(this.#directorio, nombre), `Para: ${mensaje.para}\nAsunto: ${mensaje.asunto}\n\n${mensaje.texto}\n`);
    console.log(`[correo] «${mensaje.asunto}» para ${mensaje.para} (copia en ${join(this.#directorio, nombre)}):
${mensaje.texto}`);
  }
}

/** Producción: la API transaccional de Brevo, con un remitente verificado en su panel. */
export class CorreoBrevo implements Correo {
  readonly #claveApi: string;
  readonly #remitente: { email: string; name: string };
  readonly #fetch: typeof fetch;

  constructor({ claveApi, remitente, nombreRemitente, fetch: fetchPropio }: {
    claveApi: string; remitente: string; nombreRemitente: string; fetch?: typeof fetch;
  }) {
    this.#claveApi = claveApi;
    this.#remitente = { email: remitente, name: nombreRemitente };
    this.#fetch = fetchPropio ?? fetch;
  }

  async enviar({ para, asunto, texto, html }: Mensaje): Promise<void> {
    const respuesta = await this.#fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': this.#claveApi, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: this.#remitente, to: [{ email: para }], subject: asunto, textContent: texto, htmlContent: html }),
    });
    if (!respuesta.ok) {
      throw new Error(`Brevo rechazó el correo para ${para}: ${respuesta.status} ${await respuesta.text()}`);
    }
  }
}
