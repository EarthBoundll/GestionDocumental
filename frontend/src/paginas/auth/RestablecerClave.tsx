import { Link } from 'react-router';
import { auth } from '../../api/recursos';
import { DefinirClave, EnlaceAceptado } from './DefinirClave';

/** El enlace de «¿Olvidaste tu contraseña?»: una contraseña nueva, y el correo queda confirmado (D41). */
export function RestablecerClave() {
  return (
    <DefinirClave
      titulo="Definir una contraseña nueva"
      subtitulo="El enlace sirve una sola vez y vale 60 minutos"
      boton="Guardar contraseña"
      otroEnlace={<Link to="/recuperar-clave" className="inline-block py-2 text-sm font-medium text-marca-700 hover:underline">Pedir un enlace nuevo</Link>}
      enviar={async (token, claveNueva) => {
        await auth.confirmarRecuperacion(token, claveNueva);
        return <EnlaceAceptado>Tu contraseña se cambió y se cerraron tus sesiones abiertas. Ya puedes entrar con la nueva.</EnlaceAceptado>;
      }}
    />
  );
}
