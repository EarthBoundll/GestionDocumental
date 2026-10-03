const URL_API = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');

export interface DetalleError {
  campo: string;
  mensaje: string;
}

/** Un error de la API con su forma común (docs/04-api.md §2), o la falta de conexión. */
export class ErrorApi extends Error {
  readonly estado: number;
  readonly codigo: string;
  readonly detalles: DetalleError[];

  constructor(estado: number, codigo: string, mensaje: string, detalles: DetalleError[] = []) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.codigo = codigo;
    this.detalles = detalles;
  }

  /** El mensaje para la persona, ya en español: es el que envía la API. */
  get mensaje(): string {
    return this.message;
  }

  /** Los mensajes por campo, para mostrarlos junto a cada casilla del formulario. */
  porCampo(): Record<string, string> {
    return Object.fromEntries(this.detalles.map(({ campo, mensaje }) => [campo, mensaje]));
  }
}

interface ManejoDeSesion {
  token(): string | null;
  /** La API respondió 401 a una petición con token: la sesión ya no vale. */
  alCaducar(): void;
}

let sesion: ManejoDeSesion = { token: () => null, alCaducar: () => {} };

export function conectarSesion(manejo: ManejoDeSesion): void {
  sesion = manejo;
}

type Consulta = Record<string, string | number | boolean | undefined | null>;

export interface Opciones {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  cuerpo?: unknown;
  formulario?: FormData;
  consulta?: Consulta;
  senal?: AbortSignal;
}

export function urlDe(ruta: string, consulta: Consulta = {}): string {
  const url = new URL(URL_API + ruta);
  for (const [clave, valor] of Object.entries(consulta)) {
    // Un filtro vacío es un filtro que no se envía.
    if (valor !== undefined && valor !== null && valor !== '') url.searchParams.set(clave, String(valor));
  }
  return url.toString();
}

async function pedir(ruta: string, { metodo = 'GET', cuerpo, formulario, consulta, senal }: Opciones): Promise<Response> {
  const token = sesion.token();
  const cabeceras: Record<string, string> = {};
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';

  let respuesta: Response;
  try {
    respuesta = await fetch(urlDe(ruta, consulta), {
      method: metodo,
      headers: cabeceras,
      body: formulario ?? (cuerpo === undefined ? undefined : JSON.stringify(cuerpo)),
      signal: senal,
    });
  } catch (error) {
    if (senal?.aborted) throw error;
    throw new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo');
  }

  if (!respuesta.ok) {
    const { error } = (await respuesta.json().catch(() => ({}))) as { error?: { codigo?: string; mensaje?: string; detalles?: DetalleError[] } };
    if (respuesta.status === 401 && token) sesion.alCaducar();
    throw new ErrorApi(respuesta.status, error?.codigo ?? 'ERROR', error?.mensaje ?? 'Ocurrió un error inesperado', error?.detalles ?? []);
  }
  return respuesta;
}

/** Una petición JSON a la API, con el token de la sesión y los errores ya traducidos a ErrorApi. */
export async function api<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const respuesta = await pedir(ruta, opciones);
  return (respuesta.status === 204 ? undefined : await respuesta.json()) as T;
}

/** Una descarga que necesita el token, como el CSV del historial: se recibe y se guarda con su nombre. */
export async function descargar(ruta: string, consulta: Consulta, nombrePorDefecto: string): Promise<void> {
  const respuesta = await pedir(ruta, { consulta });
  const nombre = /filename="([^"]+)"/.exec(respuesta.headers.get('content-disposition') ?? '')?.[1] ?? nombrePorDefecto;
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(await respuesta.blob());
  enlace.download = nombre;
  enlace.click();
  // Safari y Firefox cancelan la descarga si el enlace se revoca en el mismo instante del clic.
  setTimeout(() => URL.revokeObjectURL(enlace.href), 10_000);
}
