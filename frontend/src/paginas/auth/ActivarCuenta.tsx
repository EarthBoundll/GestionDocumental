import { Link } from 'react-router';
import { auth } from '../../api/recursos';
import { DefinirClave, EnlaceAceptado } from './DefinirClave';

/**
 * La invitación de una cuenta nueva (D41): la persona define su contraseña, que nadie más conoce, y al
 * gastar el enlace demuestra que el correo es suyo. Hasta aquí la cuenta existía pero no podía entrar.
 */
export function ActivarCuenta() {
  return (
    <DefinirClave
      titulo="Activa tu cuenta"
      subtitulo="Elige tu contraseña: con ella y tu correo entrarás desde cualquier dispositivo"
      boton="Activar mi cuenta"
      otroEnlace={
        <p className="text-sm text-slate-600">
          Pide otro con tu correo en{' '}
          <Link to="/recuperar-clave" className="inline-block py-2 font-medium text-marca-700 hover:underline">¿Olvidaste tu contraseña?</Link>
          : te llegará una invitación nueva. También puede reenviártela quien te creó la cuenta.
        </p>
      }
      enviar={async (token, claveNueva) => {
        const { email } = await auth.activarCuenta(token, claveNueva);
        return <EnlaceAceptado email={email}>Tu cuenta está activa y tu correo quedó confirmado. Ya puedes entrar con tu contraseña.</EnlaceAceptado>;
      }}
    />
  );
}
