import { KeyRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ErrorApi } from '../../api/cliente';
import { auth } from '../../api/recursos';
import { Aviso } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campos';
import { EncabezadoDePagina, Tarjeta } from '../../componentes/Pagina';
import { useSesion } from '../../sesion/SesionContext';

export function MiCuenta() {
  const { sesion } = useSesion();
  const [claves, setClaves] = useState({ actual: '', nueva: '', confirmacion: '' });
  const [error, setError] = useState<ErrorApi | null>(null);
  const [hecho, setHecho] = useState(false);
  const [enviando, setEnviando] = useState(false);
  if (!sesion) return null;
  const cambiar = (campo: keyof typeof claves) => (evento: { target: { value: string } }) =>
    setClaves((anteriores) => ({ ...anteriores, [campo]: evento.target.value }));

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setHecho(false);
    if (claves.nueva !== claves.confirmacion) {
      setError(new ErrorApi(400, 'VALIDACION', 'Revisa los datos', [{ campo: 'confirmacion', mensaje: 'Las contraseñas no coinciden' }]));
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await auth.cambiarClave(claves.actual, claves.nueva);
      setClaves({ actual: '', nueva: '', confirmacion: '' });
      setHecho(true);
    } catch (causa) {
      setError(causa as ErrorApi);
    } finally {
      setEnviando(false);
    }
  }

  const errores = error?.porCampo() ?? {};
  const { usuario, organizacion } = sesion;
  return (
    <>
      <EncabezadoDePagina titulo="Mi cuenta" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta className="p-4 sm:p-6">
          <h2 className="mb-4 font-semibold text-slate-900">Tus datos</h2>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-slate-500">Nombre</dt><dd className="font-medium text-slate-900">{usuario.nombre}</dd></div>
            <div><dt className="text-slate-500">Correo</dt><dd className="font-medium text-slate-900">{usuario.email}</dd></div>
            <div><dt className="text-slate-500">Rol</dt><dd className="font-medium text-slate-900">{usuario.rol === 'administrador' ? 'Administrador' : 'Usuario'}</dd></div>
            <div><dt className="text-slate-500">Organización</dt><dd className="font-medium text-slate-900">{organizacion.nombre}</dd></div>
          </dl>
          <p className="mt-4 text-xs text-slate-500">Para cambiar tu nombre o tu rol, pídeselo a un administrador.</p>
        </Tarjeta>

        <Tarjeta className="p-4 sm:p-6">
          <h2 className="mb-1 font-semibold text-slate-900">Cambiar contraseña</h2>
          <p className="mb-4 text-sm text-slate-600">Se cerrarán tus sesiones en otros dispositivos; esta se mantiene.</p>
          <form onSubmit={(evento) => void enviar(evento)} className="space-y-4" noValidate>
            {hecho && <Aviso tipo="exito">Tu contraseña se cambió.</Aviso>}
            {error && !error.detalles.length && <Aviso tipo="error">{error.mensaje}</Aviso>}
            <Campo etiqueta="Contraseña actual" type="password" autoComplete="current-password" value={claves.actual} onChange={cambiar('actual')} error={errores.claveActual} />
            <Campo etiqueta="Contraseña nueva" type="password" autoComplete="new-password" ayuda="Al menos 8 caracteres" value={claves.nueva} onChange={cambiar('nueva')} error={errores.claveNueva} />
            <Campo etiqueta="Repite la contraseña nueva" type="password" autoComplete="new-password" value={claves.confirmacion} onChange={cambiar('confirmacion')} error={errores.confirmacion} />
            <Boton type="submit" icono={KeyRound} cargando={enviando}>Cambiar contraseña</Boton>
          </form>
        </Tarjeta>
      </div>
    </>
  );
}
