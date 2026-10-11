import { KeyRound, Monitor, Moon, RotateCcw, Sun } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ErrorApi } from '../../api/cliente';
import { auth } from '../../api/recursos';
import type { Preferencias, TamanoDeTexto, Tema } from '../../api/tipos';
import { Aviso } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campos';
import { Opciones, type Opcion } from '../../componentes/Opciones';
import { EncabezadoDePagina, Tarjeta } from '../../componentes/Pagina';
import { useSesion } from '../../sesion/SesionContext';
import { NOMBRES_DE_ROLES } from '../../utilidades/roles';

const TEMAS: Opcion<Tema>[] = [
  { valor: 'sistema', texto: 'Del dispositivo', icono: Monitor },
  { valor: 'claro', texto: 'Claro', icono: Sun },
  { valor: 'oscuro', texto: 'Oscuro', icono: Moon },
];

/** La muestra va en tamaños fijos: «Aa» se ve igual de grande aunque la página ya esté agrandada. */
const TAMANOS: Opcion<TamanoDeTexto>[] = [
  { valor: 'normal', texto: 'Normal', muestra: <span className="text-[16px] leading-5 font-semibold">Aa</span> },
  { valor: 'grande', texto: 'Grande', muestra: <span className="text-[19px] leading-5 font-semibold">Aa</span> },
  { valor: 'muy_grande', texto: 'Muy grande', muestra: <span className="text-[22px] leading-5 font-semibold">Aa</span> },
];

/**
 * RF32: lo que cada persona elige para sí. Se ve al instante y se guarda en la cuenta, así que la sigue en cualquier
 * dispositivo; no cambia lo que ven los demás ni los colores de la empresa (D47).
 */
function Apariencia({ tema, tamanoTexto }: Preferencias) {
  const { cambiarPreferencias } = useSesion();
  const [error, setError] = useState<string | null>(null);

  function elegir(cambios: Partial<Preferencias>) {
    setError(null);
    cambiarPreferencias(cambios).catch((causa: unknown) => setError((causa as ErrorApi).mensaje));
  }

  return (
    <Tarjeta className="p-4 sm:p-6 lg:col-span-2">
      <h2 className="mb-1 font-semibold text-slate-900">Apariencia</h2>
      <p className="mb-4 text-sm text-slate-600">
        Solo para ti: se guarda en tu cuenta y la verás igual en el celular y en la computadora. No cambia lo que ven los
        demás ni los colores de tu empresa.
      </p>
      {error && <div className="mb-4"><Aviso tipo="error">No se pudo guardar el cambio: {error}</Aviso></div>}
      <div className="grid gap-6 md:grid-cols-2">
        <Opciones nombre="tema" leyenda="Tema" ayuda="«Del dispositivo» sigue el modo claro u oscuro de cada uno."
          valor={tema} opciones={TEMAS} alCambiar={(valor) => elegir({ tema: valor })} />
        <Opciones nombre="tamano-texto" leyenda="Tamaño del texto" ayuda="Agranda toda la interfaz, también los botones."
          valor={tamanoTexto} opciones={TAMANOS} alCambiar={(valor) => elegir({ tamanoTexto: valor })} />
      </div>
      {(tema !== 'sistema' || tamanoTexto !== 'normal') && (
        <div className="mt-4">
          <Boton variante="fantasma" icono={RotateCcw} onClick={() => elegir({ tema: 'sistema', tamanoTexto: 'normal' })}>
            Volver a lo predeterminado
          </Boton>
        </div>
      )}
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

        <Apariencia tema={usuario.tema} tamanoTexto={usuario.tamanoTexto} />
      </div>
    </>
  );
}
