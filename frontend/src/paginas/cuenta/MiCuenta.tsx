import { KeyRound, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ErrorApi } from '../../api/cliente';
import { auth } from '../../api/recursos';
import type { Tema } from '../../api/tipos';
import { Aviso } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campos';
import { EncabezadoDePagina, Tarjeta } from '../../componentes/Pagina';
import { useSesion } from '../../sesion/SesionContext';
import { NOMBRES_DE_ROLES } from '../../utilidades/roles';

const TEMAS: { valor: Tema; texto: string; icono: LucideIcon }[] = [
  { valor: 'sistema', texto: 'Del dispositivo', icono: Monitor },
  { valor: 'claro', texto: 'Claro', icono: Sun },
  { valor: 'oscuro', texto: 'Oscuro', icono: Moon },
];

/** RF32: se ve al instante y se guarda en la cuenta, así que sigue a la persona en cualquier dispositivo. */
function Apariencia({ tema }: { tema: Tema }) {
  const { cambiarTema } = useSesion();
  const [error, setError] = useState<string | null>(null);

  function elegir(valor: Tema) {
    setError(null);
    cambiarTema(valor).catch((causa: unknown) => setError((causa as ErrorApi).mensaje));
  }

  return (
    <Tarjeta className="p-4 sm:p-6 lg:col-span-2">
      <fieldset>
        <legend className="mb-1 font-semibold text-slate-900">Apariencia</legend>
        <p className="mb-4 text-sm text-slate-600">
          Se guarda en tu cuenta: la verás igual en el celular y en el ordenador. «Del dispositivo» sigue el modo claro u oscuro de cada uno.
        </p>
        {error && <div className="mb-4"><Aviso tipo="error">No se pudo guardar el tema: {error}</Aviso></div>}
        <div className="grid grid-cols-3 gap-2 sm:max-w-md">
          {TEMAS.map(({ valor, texto, icono: Icono }) => (
            <label key={valor}
              className="flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg px-2 py-3 text-center text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 has-checked:bg-marca-50 has-checked:text-marca-800 has-checked:ring-2 has-checked:ring-marca-600 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-marca-600">
              <input type="radio" name="tema" value={valor} checked={tema === valor} onChange={() => elegir(valor)} className="sr-only" />
              <Icono aria-hidden className="size-5" />
              {texto}
            </label>
          ))}
        </div>
      </fieldset>
    </Tarjeta>
  );
}

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
  const { usuario, empresa } = sesion;
  const esMaster = usuario.rol === 'master';
  return (
    <>
      <EncabezadoDePagina titulo="Mi cuenta" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta className="p-4 sm:p-6">
          <h2 className="mb-4 font-semibold text-slate-900">Tus datos</h2>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-slate-500">Nombre</dt><dd className="font-medium text-slate-900">{usuario.nombre}</dd></div>
            <div><dt className="text-slate-500">Correo</dt><dd className="font-medium text-slate-900">{usuario.email}</dd></div>
            <div><dt className="text-slate-500">Rol</dt><dd className="font-medium text-slate-900">{NOMBRES_DE_ROLES[usuario.rol]}</dd></div>
            {usuario.dni && <div><dt className="text-slate-500">DNI</dt><dd className="font-medium text-slate-900">{usuario.dni}</dd></div>}
            {empresa && <div><dt className="text-slate-500">Empresa</dt><dd className="font-medium text-slate-900">{empresa.nombre}</dd></div>}
          </dl>
          {!esMaster && <p className="mt-4 text-xs text-slate-500">Para cambiar tu nombre o tu rol, pídeselo a un administrador.</p>}
        </Tarjeta>

        <Tarjeta className="p-4 sm:p-6">
          <h2 className="mb-1 font-semibold text-slate-900">Cambiar contraseña</h2>
          <p className="mb-4 text-sm text-slate-600">Se cerrarán tus sesiones en otros dispositivos; esta se mantiene.</p>
          <form onSubmit={(evento) => void enviar(evento)} className="space-y-4" noValidate>
            {hecho && <Aviso tipo="exito">Tu contraseña se cambió.</Aviso>}
            {error && !error.detalles.length && <Aviso tipo="error">{error.mensaje}</Aviso>}
            <Campo etiqueta="Contraseña actual" type="password" autoComplete="current-password" value={claves.actual} onChange={cambiar('actual')} error={errores.claveActual} />
            <Campo etiqueta="Contraseña nueva" type="password" autoComplete="new-password" ayuda={esMaster ? 'Al menos 12 caracteres, sin tu DNI, tu correo ni solo números' : 'Al menos 8 caracteres'} value={claves.nueva} onChange={cambiar('nueva')} error={errores.claveNueva} />
            <Campo etiqueta="Repite la contraseña nueva" type="password" autoComplete="new-password" value={claves.confirmacion} onChange={cambiar('confirmacion')} error={errores.confirmacion} />
            <Boton type="submit" icono={KeyRound} cargando={enviando}>Cambiar contraseña</Boton>
          </form>
        </Tarjeta>

        <Apariencia tema={usuario.tema} />
      </div>
    </>
  );
}
