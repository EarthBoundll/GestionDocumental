import { MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { ErrorApi } from '../../api/cliente';
import { auth } from '../../api/recursos';
import { Aviso } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campos';
import { PantallaDeAcceso } from './PantallaDeAcceso';

/**
 * Pide el enlace para definir una contraseña nueva. La respuesta es la misma exista o no la cuenta
 * (CLAUDE.md v2), así que la pantalla tampoco puede decir más que eso.
 */
export function RecuperarClave() {
  const ubicacion = useLocation();
  const [email, setEmail] = useState((ubicacion.state as { email?: string } | null)?.email ?? '');
  const [respuesta, setRespuesta] = useState<string | null>(null);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      setRespuesta((await auth.solicitarRecuperacion(email)).mensaje);
    } catch (causa) {
      setError(causa as ErrorApi);
    } finally {
      setEnviando(false);
    }
  }

  const errores = error?.porCampo() ?? {};
  return (
    <PantallaDeAcceso
      titulo="Recuperar la contraseña"
      subtitulo="Te enviaremos un enlace para definir una nueva"
      pie={<Link to="/login" className="inline-block py-2 font-medium text-marca-700 hover:underline">Volver a iniciar sesión</Link>}
    >
      {respuesta ? (
        <div className="space-y-4 text-center">
          <MailCheck aria-hidden className="mx-auto size-10 text-marca-600" />
          <p role="status" className="text-sm text-slate-700">{respuesta}</p>
          <p className="text-xs text-slate-500">Si no lo ves, revisa la carpeta de correo no deseado.</p>
        </div>
      ) : (
        <form onSubmit={(evento) => void enviar(evento)} className="space-y-4" noValidate>
          {error && !error.detalles.length && <Aviso tipo="error">{error.mensaje}</Aviso>}
          <Campo etiqueta="Correo de tu cuenta" type="email" autoComplete="username" inputMode="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} error={errores.email} />
          <Boton type="submit" cargando={enviando} className="w-full">Enviar enlace</Boton>
        </form>
      )}
    </PantallaDeAcceso>
  );
}
