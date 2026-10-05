import { ImageUp, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ErrorApi } from '../../api/cliente';
import type { OperacionesDeIdentidad } from '../../api/recursos';
import type { Marca } from '../../api/tipos';
import { Aviso } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campos';
import { Tarjeta } from '../../componentes/Pagina';
import { COLOR_DE_LA_PLATAFORMA } from '../../sesion/apariencia';
import { useSesion } from '../../sesion/SesionContext';
import { CONTRASTE_MINIMO, contrasteConBlanco, esColorHex } from '../../utilidades/color';

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

/** RF31: nombre comercial, color y logo. Lo usan el administrador en su empresa y el Master en cualquiera. */
export function EditorDeIdentidad({ razonSocial, marca: inicial, operaciones, alGuardar }: Props) {
  const { previsualizarColor } = useSesion();
  const [marca, setMarca] = useState(inicial);
  const [nombre, setNombre] = useState(inicial.nombreComercial ?? '');
  const [color, setColor] = useState(inicial.colorPrimario ?? '');
  const [errorDatos, setErrorDatos] = useState<ErrorApi | null>(null);
  const [errorLogo, setErrorLogo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ de: 'datos' | 'logo'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<'datos' | 'logo' | null>(null);
  const entradaLogo = useRef<HTMLInputElement>(null);

  const elegido = color.trim().toLowerCase();
  const problema = problemaDeColor(elegido);
  const guardado = marca.colorPrimario ?? '';

  // Mientras se elige un color distinto del guardado, toda la pantalla lo muestra. Al guardar, o al salir
  // sin guardar, vuelve el de la sesión.
  useEffect(() => {
    previsualizarColor(problema || elegido === guardado ? null : elegido || COLOR_DE_LA_PLATAFORMA);
  }, [elegido, guardado, problema, previsualizarColor]);
  useEffect(() => () => previsualizarColor(null), [previsualizarColor]);

  function guardada(nueva: Marca, de: 'datos' | 'logo', texto: string) {
    setMarca(nueva);
    setAviso({ de, texto });
    alGuardar?.(nueva);
  }

  async function guardarDatos(evento: FormEvent) {
    evento.preventDefault();
    if (problema) return;
    setOcupado('datos');
    setErrorDatos(null);
    setAviso(null);
    try {
      const nueva = await operaciones.editar({ nombreComercial: nombre.trim(), colorPrimario: elegido });
      setNombre(nueva.nombreComercial ?? '');
      setColor(nueva.colorPrimario ?? '');
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
    else void cambiarLogo(() => operaciones.cambiarLogo(archivo), 'Logo actualizado.');
  }

  const errores = errorDatos?.porCampo() ?? {};
  const muestra = esColorHex(elegido) ? elegido : COLOR_DE_LA_PLATAFORMA;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Tarjeta className="p-4 sm:p-6">
        <h2 className="mb-1 font-semibold text-slate-900">Nombre y color</h2>
        <p className="mb-4 text-sm text-slate-600">
          Mientras eliges un color, toda la pantalla lo muestra. Si sales sin guardar, vuelve el que estaba.
        </p>
        <form onSubmit={(evento) => void guardarDatos(evento)} className="space-y-4" noValidate>
          {aviso?.de === 'datos' && <Aviso tipo="exito">{aviso.texto}</Aviso>}
          {errorDatos && !errorDatos.detalles.length && <Aviso tipo="error">{errorDatos.mensaje}</Aviso>}
          <Campo
            etiqueta="Nombre comercial" opcional maxLength={60} value={nombre} placeholder={razonSocial}
            onChange={(evento) => setNombre(evento.target.value)} error={errores.nombreComercial}
            ayuda={<>Es el que se ve en el menú. Sin él, se ve la razón social: «{razonSocial}».</>}
          />
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Campo
                etiqueta="Color principal" opcional value={color} placeholder={COLOR_DE_LA_PLATAFORMA} spellCheck={false} autoComplete="off"
                onChange={(evento) => setColor(evento.target.value)} error={problema ?? errores.colorPrimario}
                ayuda="El de los botones y los enlaces. Vacío, el de la plataforma."
              />
            </div>
            <input
              type="color" aria-label="Elegir el color en la paleta" value={muestra} onChange={(evento) => setColor(evento.target.value)}
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
          <div className="flex flex-wrap gap-2">
            <Boton type="submit" icono={Save} cargando={ocupado === 'datos'} disabled={Boolean(problema)}>Guardar</Boton>
            {color !== '' && (
              <Boton variante="fantasma" icono={RotateCcw} onClick={() => setColor('')}>Usar el color de la plataforma</Boton>
            )}
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
                onClick={() => void cambiarLogo(() => operaciones.quitarLogo(), 'Logo quitado: se ve el icono de la plataforma.')}>
                Quitar logo
              </Boton>
            )}
          </div>
        </div>
      </Tarjeta>
    </div>
  );
}
