import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ErrorApi } from '../../api/cliente';
import { auth } from '../../api/recursos';
import { Aviso } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campos';
import { useSesion } from '../../sesion/SesionContext';
import { PantallaDeAcceso } from './PantallaDeAcceso';

export function IniciarSesion() {
  const { iniciar } = useSesion();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const [parametros] = useSearchParams();
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<ErrorApi | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      iniciar(await auth.iniciarSesion(email, clave));
      const desde = (ubicacion.state as { desde?: string } | null)?.desde;
      navegar(desde ?? '/documentos', { replace: true });
    } catch (causa) {
      setError(causa as ErrorApi);
      setEnviando(false);
    }
  }

  const errores = error?.porCampo() ?? {};
  return (
    <PantallaDeAcceso
      titulo="Iniciar sesión"
      subtitulo="Los documentos de tu empresa, desde cualquier lugar"
      pie={<>¿Tu empresa aún no está registrada? <Link to="/registro" className="font-medium text-marca-700 hover:underline">Regístrala</Link></>}
    >
      <form onSubmit={(evento) => void enviar(evento)} className="space-y-4" noValidate>
        {parametros.get('motivo') === 'sesion' && !error && <Aviso>Tu sesión terminó. Vuelve a iniciar sesión para continuar.</Aviso>}
        {error && !error.detalles.length && <Aviso tipo="error">{error.mensaje}</Aviso>}
        <Campo etiqueta="Correo" type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={errores.email} />
        <Campo etiqueta="Contraseña" type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} error={errores.clave} />
        <Boton type="submit" cargando={enviando} className="w-full">Entrar</Boton>
      </form>
    </PantallaDeAcceso>
  );
}
