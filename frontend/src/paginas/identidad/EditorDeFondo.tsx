import { Check, ImageUp, Save, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { ErrorApi } from '../../api/cliente';
import type { OperacionesDeIdentidad } from '../../api/recursos';
import type { Marca } from '../../api/tipos';
import { Aviso } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campos';
import { Tarjeta } from '../../componentes/Pagina';
import { COLOR_DE_LA_PLATAFORMA, urlDeCss } from '../../sesion/apariencia';
import { useSesion } from '../../sesion/SesionContext';
import { esColorHex } from '../../utilidades/color';
import { LADO_MINIMO, prepararFondo, problemaDeFondo, TIPOS_DE_FONDO } from '../../utilidades/imagen';

/**
 * Sugerencias con tonos distintos entre sí. De cualquier color solo cuenta el tono (D39): estos son atajos,
 * no una lista cerrada.
 */
const SUGERIDOS = [
  { nombre: 'Arena', color: '#c8a165' },
  { nombre: 'Salvia', color: '#6b9e7a' },
  { nombre: 'Cielo', color: '#5b8fd6' },
  { nombre: 'Lavanda', color: '#9a7fd1' },
  { nombre: 'Rosa', color: '#d4849b' },
];

/** Los colores fijos de las miniaturas, los de estilos.css en cada modo. */
const MODOS = {
  claro: { pagina: 'var(--pagina-clara)', velo: 'var(--velo-claro)', superficie: '#fff', linea: '#cbd5e1' },
  oscuro: { pagina: 'var(--pagina-oscura)', velo: 'var(--velo-oscuro)', superficie: 'oklch(20.8% 0.042 265.755)', linea: 'oklch(44.6% 0.043 257.281)' },
} as const;

/** Un tono en los dos modos, partido en diagonal: así se ve que el mismo color se adapta al oscuro. */
function Muestra({ color }: { color: string | null }) {
  return (
    <span aria-hidden className="tonos-de-fondo block size-9 rounded-full ring-1 ring-slate-300"
      style={{ ...(color && { '--fondo': color }), background: 'linear-gradient(135deg, var(--pagina-clara) 50%, var(--pagina-oscura) 50%)' } as CSSProperties} />
  );
}

/** Una pantalla en miniatura: menú, cabecera y una tarjeta, sobre el fondo elegido, en un modo. */
function Miniatura({ modo, color, imagen }: { modo: keyof typeof MODOS; color: string | null; imagen: string | null }) {
  const { pagina, velo, superficie, linea } = MODOS[modo];
  const tarjeta = (
    <div className="space-y-1.5 rounded p-2" style={{ backgroundColor: superficie }}>
      <div className="h-1.5 w-2/3 rounded-full" style={{ backgroundColor: linea }} />
      <div className="h-1.5 w-1/2 rounded-full" style={{ backgroundColor: linea }} />
      <div className="h-3 w-10 rounded-sm bg-accion" />
    </div>
  );
  return (
    <figure className="min-w-0 flex-1 space-y-1.5">
      <div className="tonos-de-fondo relative aspect-[16/10] overflow-hidden rounded-lg bg-cover bg-center ring-1 ring-slate-300"
        style={{
          ...(color && { '--fondo': color }),
          backgroundColor: pagina,
          ...(imagen && { backgroundImage: `linear-gradient(${velo}, ${velo}), ${urlDeCss(imagen)}` }),
        } as CSSProperties}>
        <div className="absolute inset-y-0 left-0 w-1/5" style={{ backgroundColor: superficie }} />
        <div className="absolute top-0 right-0 left-1/5 h-[12%]" style={{ backgroundColor: superficie }} />
        {/* Con imagen, el contenido va en su panel (Layout.tsx); sin ella, directo sobre la página. */}
        <div className={`absolute top-[18%] right-[5%] left-[25%] space-y-2 rounded-md ${imagen ? 'bottom-[6%] p-2' : ''}`}
          style={imagen ? { backgroundColor: pagina } : undefined}>
          <div className="h-2 w-1/3 rounded-full" style={{ backgroundColor: linea }} />
          {tarjeta}
        </div>
      </div>
      <figcaption className="text-center text-xs text-slate-600">{modo === 'claro' ? 'Modo claro' : 'Modo oscuro'}</figcaption>
    </figure>
  );
}

interface Props {
  marca: Marca;
  operaciones: OperacionesDeIdentidad;
  alGuardar(marca: Marca): void;
}

/** D39: el color que tiñe las pantallas y la imagen que se ve detrás en una computadora. */
export function EditorDeFondo({ marca, operaciones, alGuardar }: Props) {
  const { previsualizarFondo } = useSesion();
  const [color, setColor] = useState(marca.colorFondo ?? '');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<'color' | 'imagen' | 'preparando' | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const elegido = color.trim().toLowerCase();
  const formatoMalo = elegido !== '' && !esColorHex(elegido);
  const guardado = marca.colorFondo ?? '';
  const deLaMarca = marca.colorPrimario ?? COLOR_DE_LA_PLATAFORMA;
  const opciones = [{ nombre: 'Neutro', color: '' }, ...SUGERIDOS, { nombre: 'Como la marca', color: deLaMarca }];

  // Como con el color principal: mientras se elige, toda la pantalla lo muestra; al salir sin guardar, vuelve.
  useEffect(() => {
    previsualizarFondo(formatoMalo || elegido === guardado ? undefined : elegido || null);
  }, [elegido, guardado, formatoMalo, previsualizarFondo]);
  useEffect(() => () => previsualizarFondo(undefined), [previsualizarFondo]);

  async function hacer(tarea: typeof ocupado, operacion: () => Promise<Marca>, texto: string) {
    setOcupado(tarea);
    setError(null);
    setAviso(null);
    try {
      const nueva = await operacion();
      setColor(nueva.colorFondo ?? '');
      alGuardar(nueva);
      setAviso(texto);
    } catch (causa) {
      setError(causa instanceof ErrorApi ? causa.mensaje : 'No se pudo guardar. Inténtalo de nuevo');
    } finally {
      setOcupado(null);
    }
  }

  function guardarColor(evento: FormEvent) {
    evento.preventDefault();
    if (formatoMalo) return;
    void hacer('color', () => operaciones.editar({ colorFondo: elegido }), 'Fondo guardado. Quienes ya tenían la sesión abierta lo verán al volver a abrir el sistema.');
  }

  async function elegirImagen(archivo: File | undefined) {
    if (entrada.current) entrada.current.value = '';
    if (!archivo) return;
    const problema = problemaDeFondo(archivo);
    if (problema) {
      setError(problema);
      return;
    }
    setOcupado('preparando');
    setError(null);
    setAviso(null);
    let preparada: File;
    try {
      preparada = await prepararFondo(archivo);
    } catch (causa) {
      setError((causa as Error).message);
      setOcupado(null);
      return;
    }
    await hacer('imagen', () => operaciones.cambiarImagen('fondo', preparada), 'Imagen de fondo actualizada.');
  }

  return (
    <Tarjeta className="p-4 sm:p-6 lg:col-span-2">
      <h2 className="mb-1 font-semibold text-slate-900">Fondo</h2>
      <p className="mb-4 text-sm text-slate-600">
        El color tiñe suavemente las pantallas, también en el celular; la imagen se ve detrás en las computadoras.
        En el modo oscuro el mismo color se oscurece y la imagen se atenúa, así que el texto se lee igual con cualquiera.
      </p>
      {aviso && <div className="mb-4"><Aviso tipo="exito">{aviso}</Aviso></div>}
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <form onSubmit={guardarColor} className="space-y-4" noValidate>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">Color de fondo</legend>
              <div className="flex flex-wrap gap-x-3 gap-y-2">
                {opciones.map((opcion) => {
                  const marcado = elegido === opcion.color;
                  return (
                    <button key={opcion.nombre} type="button" aria-pressed={marcado} onClick={() => setColor(opcion.color)}
                      className="flex w-16 flex-col items-center gap-1 rounded-lg p-1 text-xs text-slate-600 hover:bg-slate-100 aria-pressed:font-medium aria-pressed:text-slate-900">
                      <span className="relative">
                        <Muestra color={opcion.color || null} />
                        {marcado && (
                          <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-accion text-white">
                            <Check aria-hidden className="size-3" />
                          </span>
                        )}
                      </span>
                      {opcion.nombre}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Campo
                  etiqueta="Otro color de fondo" opcional value={color} placeholder="#f1e4c8" spellCheck={false} autoComplete="off"
                  onChange={(evento) => setColor(evento.target.value)} error={formatoMalo ? 'Usa un color en formato #f1e4c8' : undefined}
                  ayuda="De este color solo se toma el tono. Vacío, el gris neutro."
                />
              </div>
              <input
                type="color" aria-label="Elegir el color de fondo en la paleta" value={esColorHex(elegido) ? elegido : '#f1e4c8'}
                onChange={(evento) => setColor(evento.target.value)}
                className="mt-6.5 h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-superficie p-1"
              />
            </div>
            <Boton type="submit" icono={Save} cargando={ocupado === 'color'} disabled={formatoMalo || elegido === guardado}>Guardar el fondo</Boton>
          </form>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-700">Imagen de fondo</h3>
            <p className="text-sm text-slate-600">
              {marca.fondoUrl ? 'Hay una imagen: se ve en la vista previa.' : 'Sin imagen.'} JPG, PNG o WebP de al menos {LADO_MINIMO} px de
              ancho; se reduce y se comprime antes de subirla. En el celular no se descarga: allí se ve solo el color.
            </p>
            <input ref={entrada} type="file" accept={TIPOS_DE_FONDO.join(',')} aria-label="Archivo del fondo" className="hidden"
              onChange={(evento) => void elegirImagen(evento.target.files?.[0])} />
            <div className="flex flex-wrap gap-2">
              <Boton variante="secundario" icono={ImageUp} cargando={ocupado === 'preparando' || ocupado === 'imagen'} onClick={() => entrada.current?.click()}>
                {ocupado === 'preparando' ? 'Preparando la imagen…' : marca.fondoUrl ? 'Cambiar imagen' : 'Subir imagen'}
              </Boton>
              {marca.fondoUrl && (
                <Boton variante="fantasma" icono={Trash2} disabled={ocupado !== null}
                  onClick={() => void hacer('imagen', () => operaciones.quitarImagen('fondo'), 'Imagen de fondo quitada.')}>
                  Quitar imagen
                </Boton>
              )}
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-700">Vista previa</h3>
          <div className="flex gap-3">
            <Miniatura modo="claro" color={esColorHex(elegido) ? elegido : null} imagen={marca.fondoUrl} />
            <Miniatura modo="oscuro" color={esColorHex(elegido) ? elegido : null} imagen={marca.fondoUrl} />
          </div>
        </div>
      </div>
    </Tarjeta>
  );
}
