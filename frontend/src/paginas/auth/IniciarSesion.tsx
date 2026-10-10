import { ArrowRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ErrorApi } from '../../api/cliente';
import { auth } from '../../api/recursos';
import { Aviso } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campos';
import { useSesion } from '../../sesion/SesionContext';
import { destinoTrasEntrar } from '../../utilidades/roles';
import { PantallaDeAcceso } from './PantallaDeAcceso';

export function IniciarSesion() {
  const { iniciar } = useSesion();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const [parametros] = useSearchParams();
  // Quien acaba de activar su cuenta llega con su correo ya escrito.
  const [email, setEmail] = useState((ubicacion.state as { email?: string } | null)?.email ?? '');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<ErrorApi | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const sesion = await auth.iniciarSesion(email, clave);
      iniciar(sesion);
      const desde = (ubicacion.state as { desde?: string } | null)?.desde;
      navegar(destinoTrasEntrar(sesion.usuario.rol, desde), { replace: true });
    } catch (causa) {
      setError(causa as ErrorApi);
      setEnviando(false);
    }
  }

  const errores = error?.porCampo() ?? {};
  return (
    <PantallaDeAcceso
      titulo="Iniciar sesión"
      subtitulo="Entra con el correo y la contraseña de tu cuenta."
      pie="¿Aún no tienes cuenta? Te la crea el administrador de tu empresa y te llega una invitación por correo."
    >
      <form onSubmit={(evento) => void enviar(evento)} className="space-y-4" noValidate>
        {parametros.get('motivo') === 'sesion' && !error && <Aviso>Tu sesión terminó. Vuelve a iniciar sesión para continuar.</Aviso>}
        {parametros.get('motivo') === 'salida' && !error && <Aviso tipo="exito">Cerraste tu sesión. Hasta pronto.</Aviso>}
        {/* D41: con la contraseña correcta pero el correo sin confirmar, el aviso dice qué hacer, no que falló. */}
        {error && !error.detalles.length && <Aviso tipo={error.codigo === 'CORREO_SIN_VERIFICAR' ? 'advertencia' : 'error'}>{error.mensaje}</Aviso>}
        <Campo etiqueta="Correo" type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={errores.email} />
        <Campo etiqueta="Contraseña" type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} error={errores.clave} />
        <p className="-my-2 text-right text-sm">
          <Link to="/recuperar-clave" state={{ email }} className="inline-block py-2 font-medium text-marca-700 hover:underline">¿Olvidaste tu contraseña?</Link>
        </p>
        <Boton type="submit" cargando={enviando} className="con-brillo group w-full">
          Entrar
          {!enviando && <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" />}
        </Boton>
      </form>
    </PantallaDeAcceso>
  );
}
