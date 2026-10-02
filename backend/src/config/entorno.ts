import { z } from '../compartido/validacion.js';

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '[::1]']);

// Una variable definida pero vacía (`DATABASE_CA=` en el .env) cuenta como no definida.
const vacioComoAusente = (valor: unknown) => (valor === '' ? undefined : valor);
const opcional = <T extends z.ZodType>(esquema: T) => z.preprocess(vacioComoAusente, esquema);

const esquema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    DATABASE_URL: z
      .url({ protocol: /^postgres(ql)?$/ })
      .refine(
        (url) => !URL.canParse(url) || !new URL(url).searchParams.has('sslmode'),
        'Quita ?sslmode de la URL: el cifrado lo configura DATABASE_CA',
      ),
    DATABASE_CA: opcional(z.string().includes('-----BEGIN CERTIFICATE-----').optional()),
    JWT_SECRETO: z
      .string()
      .min(32, 'Debe tener al menos 32 caracteres; genera uno con: node -e "console.log(crypto.randomBytes(32).toString(\'base64url\'))"'),
    JWT_DURACION_HORAS: opcional(z.coerce.number().int().min(1).max(24).default(8)),
    REGISTRO_ABIERTO: opcional(z.stringbool().default(true)),
    CORS_ORIGEN: opcional(
      z.string()
        .default('http://localhost:5173')
        .transform((valor) => valor.split(',').map((origen) => origen.trim()).filter(Boolean))
        .pipe(z.array(z.url()).min(1)),
    ),
    // Cuántos proxies hay entre el usuario y la API. En Render se comprueba con DIAGNOSTICO_RED (backend/README.md).
    PROXIES_DE_CONFIANZA: opcional(z.coerce.number().int().min(0).max(5).default(0)),
    DIAGNOSTICO_RED: opcional(z.stringbool().default(false)),
    ALMACENAMIENTO: opcional(z.enum(['disco', 'supabase']).default('disco')),
    DIRECTORIO_ARCHIVOS: opcional(z.string().default('archivos')),
    // Dirección con la que el navegador llega a la API; con almacenamiento en disco, los enlaces la usan.
    URL_PUBLICA: opcional(z.url().optional()),
    SUPABASE_URL: opcional(z.url().optional()),
    SUPABASE_CLAVE_SECRETA: opcional(z.string().min(20).optional()),
    STORAGE_BUCKET: opcional(z.string().default('documentos')),
  })
  .refine((entorno) => entorno.DATABASE_CA !== undefined || esBaseLocal(entorno.DATABASE_URL), {
    path: ['DATABASE_CA'],
    message: 'Es obligatoria si la base no está en esta máquina: sin ella, la conexión no comprueba con quién habla',
  })
  .refine((entorno) => entorno.NODE_ENV !== 'production' || entorno.ALMACENAMIENTO === 'supabase', {
    path: ['ALMACENAMIENTO'],
    message: 'En producción debe ser supabase: el disco de Render se borra en cada reinicio',
  })
  .refine((entorno) => entorno.ALMACENAMIENTO !== 'supabase' || (entorno.SUPABASE_URL && entorno.SUPABASE_CLAVE_SECRETA), {
    path: ['SUPABASE_CLAVE_SECRETA'],
    message: 'Con ALMACENAMIENTO=supabase hacen falta SUPABASE_URL y SUPABASE_CLAVE_SECRETA',
  });

export type Entorno = z.infer<typeof esquema>;

/** Valida las variables de entorno al arrancar: si falta o sobra algo, la API no arranca. */
export function leerEntorno(variables: Record<string, string | undefined> = process.env): Entorno {
  const resultado = esquema.safeParse(variables);
  if (!resultado.success) {
    const problemas = resultado.error.issues.map((problema) => `  - ${problema.path.join('.')}: ${problema.message}`);
    throw new Error(`Variables de entorno inválidas:\n${problemas.join('\n')}`);
  }
  return resultado.data;
}

function esBaseLocal(url: string): boolean {
  // Si la URL no se puede leer, ese error ya lo informa DATABASE_URL.
  return !URL.canParse(url) || HOSTS_LOCALES.has(new URL(url).hostname);
}
