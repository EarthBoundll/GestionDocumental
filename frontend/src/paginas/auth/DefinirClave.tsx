import { CircleCheck } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ErrorApi } from '../../api/cliente';
import { Aviso } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campos';
import { PantallaDeAcceso } from './PantallaDeAcceso';

/**
 * El token llega en el fragmento del enlace (#…), que el navegador no envía a ningún servidor. Se lee
 * una vez y se quita de la barra de direcciones, para que no quede en el historial ni a la vista.
 */
export function leerTokenDelEnlace(): string {
  const token = window.location.hash.slice(1);
  if (token) window.history.replaceState(window.history.state, '', window.location.pathname);
  return token;
}

/** El final feliz de un enlace del correo: qué pasó y el camino para entrar, con el correo ya escrito. */
export function EnlaceAceptado({ children, email }: { children: ReactNode; email?: string }) {
  return (
    <div className="space-y-4 text-center">
      <CircleCheck aria-hidden className="mx-auto size-10 text-green-600" />
      <p role="status" className="text-sm text-slate-700">{children}</p>
      <Link to="/login" state={email ? { email } : undefined} className="inline-block py-2 font-medium text-marca-700 hover:underline">
        Iniciar sesión
      </Link>
    </div>
  );
}

/** El enlace no sirve: lo dice la API (caducó, ya se usó) o llegó incompleto. Y cómo conseguir otro. */
export function EnlaceInvalido({ error, otro }: { error: ErrorApi | null; otro: ReactNode }) {
  return (
    <div className="space-y-4">
      <Aviso tipo="error">{error?.mensaje ?? 'El enlace está incompleto. Ábrelo tal como llegó en el correo.'}</Aviso>
      {otro}
    </div>
  );
}

/**
 * Definir una contraseña con un enlace del correo: la nueva tras recuperarla, o la primera al aceptar una
 * invitación (D41). Cambia lo que se dice y a qué endpoint va; el formulario y sus reglas son los mismos.
 */
export function DefinirClave({ titulo, subtitulo, boton, otroEnlace, enviar }: {
  titulo: string;
  subtitulo: string;
  boton: string;
  /** Cómo pedir otro enlace si este ya no sirve. */
  otroEnlace: ReactNode;
  /** Gasta el enlace con la contraseña elegida y devuelve lo que se muestra al terminar. */
  enviar(token: string, claveNueva: string): Promise<ReactNode>;
}) {
  const [token] = useState(leerTokenDelEnlace);
  const [claves, setClaves] = useState({ nueva: '', confirmacion: '' });
  const [error, setError] = useState<ErrorApi | null>(null);
  const [hecho, setHecho] = useState<ReactNode>(null);
  const [enviando, setEnviando] = useState(false);
  const cambiar = (campo: keyof typeof claves) => (evento: { target: { value: string } }) =>
    setClaves((anteriores) => ({ ...anteriores, [campo]: evento.target.value }));

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    // La confirmación solo protege de un error al teclear; no viaja a la API.
    if (claves.nueva !== claves.confirmacion) {
      setError(new ErrorApi(400, 'VALIDACION', 'Revisa los datos', [{ campo: 'confirmacion', mensaje: 'Las contraseñas no coinciden' }]));
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      setHecho(await enviar(token, claves.nueva));
    } catch (causa) {
      setError(causa as ErrorApi);
    } finally {
      setEnviando(false);
    }
  }

  const errores = error?.porCampo() ?? {};
  const enlaceInvalido = !token || error?.codigo === 'ENLACE_INVALIDO';
  return (
    <PantallaDeAcceso
      titulo={titulo}
      subtitulo={subtitulo}
      pie={<Link to="/login" className="inline-block py-2 font-medium text-marca-700 hover:underline">Ir a iniciar sesión</Link>}
    >
      {hecho ? hecho : enlaceInvalido ? (
        <EnlaceInvalido error={error} otro={otroEnlace} />
      ) : (
        <form onSubmit={(evento) => void guardar(evento)} className="space-y-4" noValidate>
          {error && !error.detalles.length && <Aviso tipo="error">{error.mensaje}</Aviso>}
          <Campo etiqueta="Contraseña nueva" type="password" autoComplete="new-password" required ayuda="Al menos 8 caracteres"
            value={claves.nueva} onChange={cambiar('nueva')} error={errores.claveNueva} />
          <Campo etiqueta="Repite la contraseña nueva" type="password" autoComplete="new-password" required
            value={claves.confirmacion} onChange={cambiar('confirmacion')} error={errores.confirmacion} />
          <Boton type="submit" cargando={enviando} className="w-full">{boton}</Boton>
        </form>
      )}
    </PantallaDeAcceso>
  );
}
