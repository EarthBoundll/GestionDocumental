import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ErrorApi } from '../../api/cliente';
import { auth } from '../../api/recursos';
import { Aviso } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { EnlaceAceptado, EnlaceInvalido, leerTokenDelEnlace } from './DefinirClave';
import { PantallaDeAcceso } from './PantallaDeAcceso';

/**
 * Confirma el correo de una cuenta que ya tiene contraseña (D41). Se confirma con un botón y no al abrir
 * la página: algunos filtros de correo abren los enlaces para revisarlos, y no deben gastarlo por la persona.
 */
export function VerificarCorreo() {
  const [token] = useState(leerTokenDelEnlace);
  const [confirmado, setConfirmado] = useState<string | null>(null);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    setEnviando(true);
    setError(null);
    try {
      setConfirmado((await auth.verificarCorreo(token)).email);
    } catch (causa) {
      setError(causa as ErrorApi);
    } finally {
      setEnviando(false);
    }
  }

  const enlaceInvalido = !token || error?.codigo === 'ENLACE_INVALIDO';
  return (
    <PantallaDeAcceso
      titulo="Confirma tu correo"
      subtitulo="Un paso para seguir entrando a tu cuenta"
      pie={<Link to="/login" className="inline-block py-2 font-medium text-marca-700 hover:underline">Ir a iniciar sesión</Link>}
    >
      {confirmado ? (
        <EnlaceAceptado email={confirmado}>Listo: tu correo quedó confirmado. Ya puedes entrar con tu contraseña de siempre.</EnlaceAceptado>
      ) : enlaceInvalido ? (
        <EnlaceInvalido error={error} otro={<p className="text-sm text-slate-600">Inicia sesión con tu correo y tu contraseña: si aún falta confirmarlo, te enviaremos otro enlace.</p>} />
      ) : (
        <div className="space-y-4">
          {error && <Aviso tipo="error">{error.mensaje}</Aviso>}
          <div className="flex items-start gap-3 text-sm text-slate-700">
            <MailCheck aria-hidden className="size-6 shrink-0 text-marca-600" />
            <p>Confirma que este correo es tuyo. Tu contraseña no cambia.</p>
          </div>
          <Boton cargando={enviando} className="w-full" onClick={() => void confirmar()}>Confirmar mi correo</Boton>
        </div>
      )}
    </PantallaDeAcceso>
  );
}
