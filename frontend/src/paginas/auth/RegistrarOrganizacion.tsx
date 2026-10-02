import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ErrorApi } from '../../api/cliente';
import { auth } from '../../api/recursos';
import { Aviso } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campos';
import { useSesion } from '../../sesion/SesionContext';
import { PantallaDeAcceso } from './PantallaDeAcceso';

const VACIO = { organizacion: '', ruc: '', nombre: '', email: '', clave: '', confirmacion: '' };

export function RegistrarOrganizacion() {
  const { iniciar } = useSesion();
  const navegar = useNavigate();
  const [datos, setDatos] = useState(VACIO);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cambiar = (campo: keyof typeof VACIO) => (evento: { target: { value: string } }) =>
    setDatos((anteriores) => ({ ...anteriores, [campo]: evento.target.value }));

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    // La confirmación solo protege de un error al teclear; no viaja a la API.
    if (datos.clave !== datos.confirmacion) {
      setError(new ErrorApi(400, 'VALIDACION', 'Revisa los datos', [{ campo: 'confirmacion', mensaje: 'Las contraseñas no coinciden' }]));
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      iniciar(await auth.registrar({
        organizacion: { nombre: datos.organizacion, ...(datos.ruc && { ruc: datos.ruc }) },
        administrador: { nombre: datos.nombre, email: datos.email, clave: datos.clave },
      }));
      navegar('/documentos', { replace: true });
    } catch (causa) {
      setError(causa as ErrorApi);
      setEnviando(false);
    }
  }

  const errores = error?.porCampo() ?? {};
  return (
    <PantallaDeAcceso
      titulo="Registra tu empresa"
      subtitulo="Crearás la cuenta de administrador, que luego podrá invitar al resto del equipo"
      pie={<>¿Ya tienes cuenta? <Link to="/login" className="font-medium text-marca-700 hover:underline">Inicia sesión</Link></>}
    >
      <form onSubmit={(evento) => void enviar(evento)} className="space-y-4" noValidate>
        {error && !error.detalles.length && <Aviso tipo="error">{error.mensaje}</Aviso>}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-slate-900">Empresa</legend>
          <Campo etiqueta="Nombre o razón social" required autoComplete="organization" value={datos.organizacion} onChange={cambiar('organizacion')} error={errores['organizacion.nombre']} />
          <Campo etiqueta="RUC" opcional inputMode="numeric" maxLength={11} value={datos.ruc} onChange={cambiar('ruc')} error={errores['organizacion.ruc']} />
        </fieldset>
        <fieldset className="space-y-4 border-t border-slate-200 pt-4">
          <legend className="pt-4 text-sm font-semibold text-slate-900">Tu cuenta de administrador</legend>
          <Campo etiqueta="Tu nombre" required autoComplete="name" value={datos.nombre} onChange={cambiar('nombre')} error={errores['administrador.nombre']} />
          <Campo etiqueta="Correo" type="email" required autoComplete="email" inputMode="email" value={datos.email} onChange={cambiar('email')} error={errores['administrador.email']} />
          <Campo etiqueta="Contraseña" type="password" required autoComplete="new-password" ayuda="Al menos 8 caracteres" value={datos.clave} onChange={cambiar('clave')} error={errores['administrador.clave']} />
          <Campo etiqueta="Repite la contraseña" type="password" required autoComplete="new-password" value={datos.confirmacion} onChange={cambiar('confirmacion')} error={errores.confirmacion} />
        </fieldset>
        <Boton type="submit" cargando={enviando} className="w-full">Registrar empresa</Boton>
      </form>
    </PantallaDeAcceso>
  );
}
