# API · Gestión documental

API REST en Express 5 y TypeScript sobre PostgreSQL, multiempresa: cada empresa aislada de las demás
por una capa de acceso transversal y RLS. El diseño está en [`../docs`](../docs/README.md).

## Puesta en marcha

Requiere Node 24.

```bash
npm ci
cp .env.example .env       # y rellénalo
npm run migrar             # crea o actualiza el esquema
npm run dev                # http://localhost:4000/api/v1/salud
npm run crear-master       # una sola vez: la cuenta del Master con los datos MASTER_* del .env
```

O todo en esta máquina, sin cuentas ni instalaciones: `npm run local` levanta su propio PostgreSQL 17
(datos en `.local/`), aplica las migraciones, crea el Master si el `.env` trae sus datos y deja los
correos de recuperación en `.local/correos`, con el enlace también en la consola.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Arranca la API y la reinicia al guardar un cambio |
| `npm run local` | El sistema completo en esta máquina, sin cuentas: PostgreSQL propio, archivos y correos en carpetas |
| `npm run migrar` | Aplica las migraciones pendientes de `migraciones/` |
| `npm run crear-master` | Crea la cuenta única del Administrador Master con `MASTER_EMAIL`, `MASTER_PASSWORD`, `MASTER_NOMBRE` y `MASTER_DNI`. Si ya existe, no hace nada |
| `npm run informe:aislamiento` | Ejecuta la batería «la empresa A no alcanza nada de la B» y escribe su informe en `docs/evidencias/` (indicador 6) |
| `npm run comprobar-despliegue -- <api> <web>` | Revisa desde fuera un despliegue: salud, CORS, CSP, rutas de la SPA y que el frontend llame a esta API ([07 · Despliegue](../docs/07-despliegue.md)) |
| `npm test` | Ejecuta todas las pruebas. No necesita nada instalado: levanta su propio PostgreSQL 17 |
| `npm run typecheck` | Comprueba los tipos de todo el proyecto, pruebas incluidas |
| `npm run build` y `npm start` | Compila a `dist/` y arranca la versión compilada, como en Render |

## Migraciones

- Una migración es un archivo `NNN_descripcion.sql` en `migraciones/`, y se aplica en su propia
  transacción. Por eso no lleva `BEGIN` ni `COMMIT`.
- **Una migración aplicada no se edita.** El ejecutor guarda la suma SHA-256 de cada archivo y se
  niega a seguir si cambió: los cambios van en una migración nueva.
- En Render se aplican durante la compilación (ver `../render.yaml`). Si fallan, el despliegue se
  detiene y sigue en línea la versión anterior.

## Pruebas

Las pruebas de integración corren contra un PostgreSQL 17 real, la misma versión mayor que Supabase,
que el paquete `embedded-postgres` arranca en un directorio temporal. Cada archivo de pruebas trabaja
en su propia base, recién creada y migrada.

PostgreSQL se niega a arrancar como root: en Linux, ejecuta las pruebas con un usuario normal.

El aislamiento entre empresas tiene tres baterías: `rls.test.ts` (la base, con SQL directo y por la
capa de acceso), `aislamiento.test.ts` (cada endpoint, de la empresa A contra la B) y
`plataforma.test.ts` (lo que el Master puede y no puede hacer).

## Primer despliegue en Render

La guía completa, con Supabase, Brevo, Vercel, el Master y el monitor, está en
[07 · Despliegue](../docs/07-despliegue.md). Aquí, lo que toca a la API:

1. En Supabase, crea el proyecto en la región **East US (North Virginia)**. Copia la URL del
   *Session pooler*, descarga el certificado, crea un bucket **privado** llamado `documentos` y copia la
   URL del proyecto y su clave secreta (*Project Settings → API Keys*).
2. En Brevo, crea la cuenta gratuita, verifica el remitente (*Senders*) y genera una clave de API.
3. En Render: **New → Blueprint**, elige el repositorio y pega `DATABASE_URL` y `DATABASE_CA` cuando
   los pida, junto con `SUPABASE_URL`, `SUPABASE_CLAVE_SECRETA`, `BREVO_CLAVE_API`, `CORREO_REMITENTE`,
   `CORS_ORIGEN` y `URL_FRONTEND`. `JWT_SECRETO` lo genera Render.
4. Cuando `https://<servicio>.onrender.com/api/v1/salud` responda `{"estado":"ok"}`, **fija los proxies
   de confianza**. El limitador de intentos cuenta por IP, y la API tiene que ver la IP real de cada
   persona, no la del proxy de Render:
   - Abre `https://<servicio>.onrender.com/api/v1/salud/red` y compara `ip` con tu IP pública (por
     ejemplo, la que muestra cualquier web de «cuál es mi IP»).
   - Si no coinciden, mira `cadena`: tu IP es el primer elemento. Ajusta `PROXIES_DE_CONFIANZA` hasta que
     `ip` sea la tuya.
   - Pon `DIAGNOSTICO_RED` en `false`. La ruta deja de existir.
5. **Crea el Master** desde tu máquina, una sola vez: pon en tu `.env` la `DATABASE_URL` y el
   `DATABASE_CA` de producción y tus `MASTER_*`, y ejecuta `npm run crear-master`. Sus datos no pasan
   por Render ni por el repositorio. Después, quita la URL de producción de tu `.env`.
