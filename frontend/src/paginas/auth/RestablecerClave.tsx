import { CircleCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ErrorApi } from '../../api/cliente';
import { auth } from '../../api/recursos';
import { Aviso } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campos';
import { PantallaDeAcceso } from './PantallaDeAcceso';

/**
 * El token llega en el fragmento del enlace (#…), que el navegador no envía a ningún servidor. Se lee
 * una vez y se quita de la barra de direcciones, para que no quede en el historial ni a la vista.
 */
function leerToken(): string {
  const token = window.location.hash.slice(1);
  if (token) window.history.replaceState(window.history.state, '', window.location.pathname);
  return token;
}

export function RestablecerClave() {
  const [token] = useState(leerToken);
  const [claves, setClaves] = useState({ nueva: '', confirmacion: '' });
  const [error, setError] = useState<ErrorApi | null>(null);
  const [hecho, setHecho] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const cambiar = (campo: keyof typeof claves) => (evento: { target: { value: string } }) =>
    setClaves((anteriores) => ({ ...anteriores, [campo]: evento.target.value }));

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (claves.nueva !== claves.confirmacion) {
      setError(new ErrorApi(400, 'VALIDACION', 'Revisa los datos', [{ campo: 'confirmacion', mensaje: 'Las contraseñas no coinciden' }]));
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await auth.confirmarRecuperacion(token, claves.nueva);
      setHecho(true);
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
      titulo="Definir una contraseña nueva"
      subtitulo="El enlace sirve una sola vez y vale 60 minutos"
      pie={<Link to="/login" className="inline-block py-2 font-medium text-marca-700 hover:underline">Ir a iniciar sesión</Link>}
    >
      {hecho ? (
        <div className="space-y-4 text-center">
          <CircleCheck aria-hidden className="mx-auto size-10 text-green-600" />
          <p role="status" className="text-sm text-slate-700">
            Tu contraseña se cambió y se cerraron tus sesiones abiertas. Ya puedes entrar con la nueva.
          </p>
          <Link to="/login" className="inline-block py-2 font-medium text-marca-700 hover:underline">Iniciar sesión</Link>
        </div>
      ) : enlaceInvalido ? (
        <div className="space-y-4">
          <Aviso tipo="error">{error?.mensaje ?? 'El enlace está incompleto. Ábrelo tal como llegó en el correo.'}</Aviso>
          <Link to="/recuperar-clave" className="inline-block py-2 text-sm font-medium text-marca-700 hover:underline">Pedir un enlace nuevo</Link>
        </div>
      ) : (
        <form onSubmit={(evento) => void enviar(evento)} className="space-y-4" noValidate>
          {error && !error.detalles.length && <Aviso tipo="error">{error.mensaje}</Aviso>}
          <Campo etiqueta="Contraseña nueva" type="password" autoComplete="new-password" required ayuda="Al menos 8 caracteres"
            value={claves.nueva} onChange={cambiar('nueva')} error={errores.claveNueva} />
          <Campo etiqueta="Repite la contraseña nueva" type="password" autoComplete="new-password" required
            value={claves.confirmacion} onChange={cambiar('confirmacion')} error={errores.confirmacion} />
          <Boton type="submit" cargando={enviando} className="w-full">Guardar contraseña</Boton>
        </form>
      )}
    </PantallaDeAcceso>
  );
}
