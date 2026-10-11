import { ImageUp, RotateCcw, Save, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ErrorApi } from '../../api/cliente';
import type { CambiosDeIdentidad, OperacionesDeIdentidad } from '../../api/recursos';
import type { Esquinas, EstiloDeZona, Marca } from '../../api/tipos';
import { Aviso } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campos';
import { Opciones, type Opcion } from '../../componentes/Opciones';
import { Tarjeta } from '../../componentes/Pagina';
import { COLOR_DE_LA_PLATAFORMA, ESTILO_DE_LA_PLATAFORMA, type Estilo } from '../../sesion/apariencia';
import { useSesion } from '../../sesion/SesionContext';
import { CONTRASTE_MINIMO, contrasteConBlanco, esColorHex } from '../../utilidades/color';
import { EditorDeFondo } from './EditorDeFondo';

/** Los de la API (identidad.servicio.ts): se comprueban antes para no gastar datos del celular en un rechazo. */
const PESO_MAXIMO_LOGO = 256 * 1024;
const EXTENSIONES_DE_LOGO = /\.(png|jpe?g)$/i;

const decimal = (valor: number) => valor.toLocaleString('es-PE', { maximumFractionDigits: 1 });

/** Qué tiene de malo el color escrito, o null si sirve. Vacío sirve: es el de la plataforma. */
function problemaDeColor(color: string): string | null {
  if (color === '') return null;
  if (!esColorHex(color)) return 'Usa un color en formato #1f6f5c';
  const razon = contrasteConBlanco(color);
  if (razon >= CONTRASTE_MINIMO) return null;
  return `Con texto blanco encima se lee mal (${decimal(razon)}:1; hace falta ${decimal(CONTRASTE_MINIMO)}:1). Elige un tono más oscuro`;
}

function problemaDeLogo(archivo: File): string | null {
  if (!EXTENSIONES_DE_LOGO.test(archivo.name)) return 'El logo debe ser una imagen PNG o JPG';
  if (archivo.size > PESO_MAXIMO_LOGO) return 'El logo supera los 256 KB';
  return null;
}

interface Props {
  /** El nombre legal, que no cambia aquí: se muestra cuando no hay nombre comercial. */
  razonSocial: string;
  marca: Marca;
  /** Las de la propia empresa (administrador) o las de la empresa elegida (Master). */
  operaciones: OperacionesDeIdentidad;
  /** Tras cada cambio guardado, con la identidad que devolvió la API. */
  alGuardar?(marca: Marca): void;
}

/** Lo que se edita junto y se guarda con un solo botón: el nombre, el color y el estilo (D47). */
interface Formulario extends Estilo {
  nombre: string;
  color: string;
}

const formularioDe = (marca: Marca): Formulario => ({
  nombre: marca.nombreComercial ?? '', color: marca.colorPrimario ?? '',
  estiloMenu: marca.estiloMenu, estiloBarra: marca.estiloBarra, esquinas: marca.esquinas,
});

/** Lo que la API recibiría: el nombre sin espacios de más y el color en minúsculas. */
const normalizado = (formulario: Formulario): Formulario =>
  ({ ...formulario, nombre: formulario.nombre.trim(), color: formulario.color.trim().toLowerCase() });

/** Solo lo que cambió respecto de lo guardado: así el historial no registra lo que nadie tocó. */
function cambiosEntre(guardado: Formulario, elegido: Formulario): CambiosDeIdentidad {
  const cambios: CambiosDeIdentidad = {};
  if (elegido.nombre !== guardado.nombre) cambios.nombreComercial = elegido.nombre;
  if (elegido.color !== guardado.color) cambios.colorPrimario = elegido.color;
  for (const campo of ['estiloMenu', 'estiloBarra', 'esquinas'] as const) {
    if (elegido[campo] !== guardado[campo]) Object.assign(cambios, { [campo]: elegido[campo] });
  }
  return cambios;
}

const muestraDeZona = (estilo: EstiloDeZona) => (
  <span className={`block h-5 w-10 rounded-sm ${estilo === 'marca' ? 'bg-[var(--marca)]' : 'bg-superficie ring-1 ring-slate-300'}`} />
);
const ZONAS: Opcion<EstiloDeZona>[] = [
  { valor: 'claro', texto: 'Claro', muestra: muestraDeZona('claro') },
  { valor: 'marca', texto: 'Del color de la empresa', muestra: muestraDeZona('marca') },
];
/** Con radios fijos: la muestra no cambia mientras la pantalla ya enseña las esquinas elegidas. */
const ESQUINAS: Opcion<Esquinas>[] = [
  { valor: 'rectas', texto: 'Rectas', muestra: <span className="block h-5 w-8 rounded-[2px] border-2 border-current" /> },
  { valor: 'suaves', texto: 'Suaves', muestra: <span className="block h-5 w-8 rounded-[6px] border-2 border-current" /> },
  { valor: 'redondeadas', texto: 'Redondeadas', muestra: <span className="block h-5 w-8 rounded-[11px] border-2 border-current" /> },
];

/** RF31 y D47: nombre comercial, colores, estilo, logo y fondo. Lo usan el administrador en su empresa y el Master en cualquiera. */
export function EditorDeIdentidad({ razonSocial, marca: inicial, operaciones, alGuardar }: Props) {
  const { previsualizarColor, previsualizarEstilo } = useSesion();
  const [marca, setMarca] = useState(inicial);
  const [formulario, setFormulario] = useState(() => formularioDe(inicial));
  const [errorDatos, setErrorDatos] = useState<ErrorApi | null>(null);
  const [errorLogo, setErrorLogo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ de: 'datos' | 'logo'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<'datos' | 'logo' | null>(null);
  const entradaLogo = useRef<HTMLInputElement>(null);

  const guardado = formularioDe(marca);
  const elegido = normalizado(formulario);
  const problema = problemaDeColor(elegido.color);
  const cambios = cambiosEntre(guardado, elegido);
  const pendiente = Object.keys(cambios).length > 0;
  const esElDeLaPlataforma = elegido.color === '' &&
    (Object.keys(ESTILO_DE_LA_PLATAFORMA) as (keyof Estilo)[]).every((campo) => elegido[campo] === ESTILO_DE_LA_PLATAFORMA[campo]);
  const editar = (campos: Partial<Formulario>) => setFormulario((anterior) => ({ ...anterior, ...campos }));

  // Mientras se elige un color o un estilo distinto del guardado, toda la pantalla lo muestra. Al guardar, o al
  // salir sin guardar, vuelve el de la sesión.
  useEffect(() => {
    previsualizarColor(problema || elegido.color === guardado.color ? null : elegido.color || COLOR_DE_LA_PLATAFORMA);
  }, [elegido.color, guardado.color, problema, previsualizarColor]);
  const { estiloMenu, estiloBarra, esquinas } = elegido;
  const estiloCambiado = estiloMenu !== guardado.estiloMenu || estiloBarra !== guardado.estiloBarra || esquinas !== guardado.esquinas;
  useEffect(() => {
    previsualizarEstilo(estiloCambiado ? { estiloMenu, estiloBarra, esquinas } : null);
  }, [estiloCambiado, estiloMenu, estiloBarra, esquinas, previsualizarEstilo]);
  useEffect(() => () => {
    previsualizarColor(null);
    previsualizarEstilo(null);
  }, [previsualizarColor, previsualizarEstilo]);

  function guardada(nueva: Marca, de: 'datos' | 'logo', texto: string) {
    setMarca(nueva);
    setAviso({ de, texto });
    alGuardar?.(nueva);
  }

  async function guardarDatos(evento: FormEvent) {
    evento.preventDefault();
    if (problema || !pendiente) return;
    setOcupado('datos');
    setErrorDatos(null);
    setAviso(null);
    try {
      const nueva = await operaciones.editar(cambios);
      setFormulario(formularioDe(nueva));
      guardada(nueva, 'datos', 'Identidad guardada. Quienes ya tenían la sesión abierta la verán al volver a abrir el sistema.');
    } catch (causa) {
      setErrorDatos(causa as ErrorApi);
    } finally {
      setOcupado(null);
    }
  }

  async function cambiarLogo(operacion: () => Promise<Marca>, texto: string) {
    setOcupado('logo');
    setErrorLogo(null);
    setAviso(null);
    try {
      guardada(await operacion(), 'logo', texto);
    } catch (causa) {
      setErrorLogo((causa as ErrorApi).mensaje);
    } finally {
      setOcupado(null);
    }
  }

  function elegirLogo(archivo: File | undefined) {
    // Se vacía para que elegir otra vez el mismo archivo (tras corregirlo) vuelva a avisar.
    if (entradaLogo.current) entradaLogo.current.value = '';
    if (!archivo) return;
    const problemaLogo = problemaDeLogo(archivo);
    if (problemaLogo) setErrorLogo(problemaLogo);
    else void cambiarLogo(() => operaciones.cambiarImagen('logo', archivo), 'Logo actualizado.');
  }

  const errores = errorDatos?.porCampo() ?? {};
  const muestra = esColorHex(elegido.color) ? elegido.color : COLOR_DE_LA_PLATAFORMA;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Tarjeta className="p-4 sm:p-6 lg:col-span-2">
        <h2 className="mb-1 font-semibold text-slate-900">Nombre, colores y estilo</h2>
        <p className="mb-4 text-sm text-slate-600">
          Mientras eliges, toda la pantalla muestra cómo quedará; nadie más lo ve hasta que guardes. Si sales sin guardar,
          vuelve lo que estaba.
        </p>
        <form onSubmit={(evento) => void guardarDatos(evento)} className="space-y-4" noValidate>
          {aviso?.de === 'datos' && !pendiente && <Aviso tipo="exito">{aviso.texto}</Aviso>}
          {errorDatos && !errorDatos.detalles.length && <Aviso tipo="error">{errorDatos.mensaje}</Aviso>}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <Campo
                etiqueta="Nombre comercial" opcional maxLength={60} value={formulario.nombre} placeholder={razonSocial}
                onChange={(evento) => editar({ nombre: evento.target.value })} error={errores.nombreComercial}
                ayuda={<>Es el que se ve en el menú. Sin él, se ve la razón social: «{razonSocial}».</>}
              />
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Campo
                    etiqueta="Color principal" opcional value={formulario.color} placeholder={COLOR_DE_LA_PLATAFORMA} spellCheck={false} autoComplete="off"
                    onChange={(evento) => editar({ color: evento.target.value })} error={problema ?? errores.colorPrimario}
                    ayuda="El de los botones y los enlaces. Vacío, el de la plataforma."
                  />
                </div>
                <input
                  type="color" aria-label="Elegir el color en la paleta" value={muestra} onChange={(evento) => editar({ color: evento.target.value })}
                  className="mt-6.5 h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-superficie p-1"
                />
              </div>
              <div className="flex flex-col items-start gap-3 rounded-lg p-3 ring-1 ring-slate-200 sm:flex-row sm:items-center">
                <span aria-hidden className="inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-medium text-white" style={{ backgroundColor: muestra }}>
                  Así se ve un botón
                </span>
                <p className="text-sm text-slate-600 sm:min-w-0 sm:flex-1">
                  Contraste con el texto blanco: <strong className="text-slate-900">{decimal(contrasteConBlanco(muestra))}:1</strong> (mínimo {decimal(CONTRASTE_MINIMO)}:1).
                </p>
              </div>
            </div>
            <div className="space-y-5">
              <Opciones nombre="estilo-menu" leyenda="Menú lateral" valor={formulario.estiloMenu} opciones={ZONAS}
                ayuda="El de la izquierda en la computadora; en el celular, al abrir el menú." alCambiar={(valor) => editar({ estiloMenu: valor })} />
              <Opciones nombre="estilo-barra" leyenda="Barra superior" valor={formulario.estiloBarra} opciones={ZONAS}
                ayuda="La de arriba, con la campana y tu nombre." alCambiar={(valor) => editar({ estiloBarra: valor })} />
              <Opciones nombre="esquinas" leyenda="Esquinas" valor={formulario.esquinas} opciones={ESQUINAS}
                ayuda="De tarjetas, botones, campos y diálogos." alCambiar={(valor) => editar({ esquinas: valor })} />
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:flex-wrap sm:items-center">
            {pendiente && (
              <p role="status" className="flex items-center gap-2 text-sm font-medium text-amber-800 sm:mr-auto">
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-amber-500" />
                Cambios sin guardar: solo los ves tú.
              </p>
            )}
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              {!esElDeLaPlataforma && (
                <Boton variante="fantasma" icono={RotateCcw} onClick={() => editar({ color: '', ...ESTILO_DE_LA_PLATAFORMA })}>
                  Restablecer colores y estilo
                </Boton>
              )}
              {pendiente && (
                <Boton variante="secundario" icono={Undo2} onClick={() => setFormulario(guardado)}>Descartar</Boton>
              )}
              <Boton type="submit" icono={Save} cargando={ocupado === 'datos'} disabled={Boolean(problema) || !pendiente}>Guardar</Boton>
            </div>
          </div>
        </form>
      </Tarjeta>

      <Tarjeta className="p-4 sm:p-6">
        <h2 className="mb-1 font-semibold text-slate-900">Logo</h2>
        <p className="mb-4 text-sm text-slate-600">
          PNG o JPG de hasta 256 KB. Se ve en el menú a unos 36 px de alto y sobre blanco, también en el modo oscuro:
          mejor horizontal y sin márgenes.
        </p>
        <div className="space-y-4">
          {aviso?.de === 'logo' && <Aviso tipo="exito">{aviso.texto}</Aviso>}
          {errorLogo && <Aviso tipo="error">{errorLogo}</Aviso>}
          {marca.logoUrl ? (
            <img src={marca.logoUrl} alt={`Logo de ${marca.nombreComercial ?? razonSocial}`}
              className="h-16 max-w-48 rounded-lg bg-white object-contain p-2 ring-1 ring-slate-200" />
          ) : (
            <p className="flex h-16 w-40 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">Sin logo</p>
          )}
          <input ref={entradaLogo} type="file" accept="image/png,image/jpeg" aria-label="Archivo del logo" className="hidden"
            onChange={(evento) => elegirLogo(evento.target.files?.[0])} />
          <div className="flex flex-wrap gap-2">
            <Boton variante="secundario" icono={ImageUp} cargando={ocupado === 'logo'} onClick={() => entradaLogo.current?.click()}>
              {marca.logoUrl ? 'Cambiar logo' : 'Subir logo'}
            </Boton>
            {marca.logoUrl && (
              <Boton variante="fantasma" icono={Trash2} disabled={ocupado === 'logo'}
                onClick={() => void cambiarLogo(() => operaciones.quitarImagen('logo'), 'Logo quitado: se ve el icono de la plataforma.')}>
                Quitar logo
              </Boton>
            )}
          </div>
        </div>
      </Tarjeta>

      <EditorDeFondo marca={marca} operaciones={operaciones} alGuardar={(nueva) => {
        setMarca(nueva);
        alGuardar?.(nueva);
      }} />
    </div>
  );
}
