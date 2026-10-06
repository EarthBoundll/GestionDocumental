# 05 · Estructura del proyecto

## 1. Repositorio

```
GestionDocumental/
├── CLAUDE.md
├── README.md
├── render.yaml      Blueprint de Render: la API con su configuración (D11, D13)
├── docs/            este diseño
├── backend/         API REST, se despliega en Render
└── frontend/        SPA, se despliega en Vercel
```

## 2. Backend

```
backend/
├── migraciones/                  SQL versionado: 001_esquema_inicial.sql, 002_…
├── scripts/
│   ├── migrar.ts                 aplica en orden las migraciones pendientes
│   ├── crear-master.ts           crea la cuenta única del Master con los datos del .env (RN22)
│   ├── local.ts                  el sistema completo en esta máquina, sin cuentas (D16)
│   ├── informe-aislamiento.ts    ejecuta la batería A contra B y escribe su informe (indicador 6)
│   └── comprobar-despliegue.ts   revisa desde fuera un despliegue: salud, CORS, CSP y URL de la API
├── src/
│   ├── server.ts                 arranque: valida el entorno, crea la app y escucha
│   ├── app.ts                    ensambla middlewares y rutas sin escuchar; lo usan las pruebas
│   ├── config/
│   │   └── entorno.ts            lee y valida las variables de entorno; si falta una, no arranca
│   ├── db/
│   │   ├── pool.ts               conexión a PostgreSQL
│   │   ├── acceso.ts             la capa transversal: acceso de empresa o de plataforma, con RLS (D17)
│   │   ├── transaccion.ts        ejecuta una función entre BEGIN y COMMIT, o ROLLBACK si falla
│   │   └── migraciones.ts        ejecutor de migraciones con suma de verificación (E6)
│   ├── almacenamiento/
│   │   ├── almacenamiento.ts     contrato: subir, firmarEnlace, eliminar
│   │   ├── supabase-storage.ts   implementación con Supabase Storage (producción)
│   │   ├── en-disco.ts           implementación en una carpeta, con enlaces firmados (desarrollo y pruebas, D16)
│   │   └── crear.ts              elige una u otra según ALMACENAMIENTO
│   ├── correo/
│   │   ├── correo.ts             contrato e implementaciones: Brevo (producción) y archivo (desarrollo, D19)
│   │   └── crear.ts              elige una u otra según CORREO
│   ├── respaldos/                respaldo lógico de la base (D25)
│   │   ├── deposito.ts           dónde se guardan: bucket privado (producción) o carpeta (desarrollo)
│   │   ├── respaldo.ts           generar, restaurar y retención de 30 días, con la conexión dueña
│   │   └── respaldos.rutas.ts    lo que ve el Master: la lista y «generar ahora», sin descarga
│   ├── tareas/                   lo que la API hace sola mientras está despierta
│   │   ├── purgar-papelera.ts    cada 6 horas, lo que lleva más de 30 días en la papelera (D23)
│   │   └── respaldo-nocturno.ts  a las 03:00 de Lima (D25)
│   ├── middlewares/
│   │   ├── contexto.ts           id de la petición, user-agent y es_movil
│   │   ├── autenticar.ts         JWT → sesión → usuario y empresa activos → acceso a datos
│   │   ├── autorizar.ts          exige un permiso (403 y ACCESO_DENEGADO); las puertas de empresa y de plataforma
│   │   ├── limitar-intentos.ts   freno a la fuerza bruta en login y a los envíos de recuperación
│   │   └── manejar-errores.ts    único punto que convierte errores en respuestas
│   ├── compartido/
│   │   ├── errores.ts            ErrorAplicacion y sus variantes (404, 409…)
│   │   ├── validacion.ts         Zod con los mensajes en español; todo el código importa z de aquí
│   │   ├── permisos.ts           la matriz de permisos: única fuente de verdad
│   │   ├── peticion.ts           Actor: quién actúa, desde dónde y con qué acceso a los datos
│   │   ├── claves.ts             bcrypt y las reglas de contraseña, también las del Master
│   │   ├── tokens.ts             firma y verificación del JWT
│   │   ├── paginacion.ts
│   │   └── dispositivo.ts        ¿es un móvil?, a partir del user-agent
│   └── modulos/
│       ├── auth/
│       │   ├── auth.rutas.ts
│       │   ├── auth.controlador.ts
│       │   ├── auth.servicio.ts
│       │   ├── auth.repositorio.ts   la capa de identidad: cuentas, sesiones y recuperaciones
│       │   ├── auth.esquemas.ts
│       │   ├── auth.correos.ts       el texto del correo de recuperación
│       │   └── master.ts             crea al Master y valida sus datos (lo usa el script)
│       ├── plataforma/           lo que hace el Master: empresas, administradores y cifras
│       ├── usuarios/             todos los módulos tienen la misma forma
│       ├── categorias/
│       ├── documentos/
│       ├── solicitudes/
│       ├── notificaciones/
│       ├── historial/            incluye registrarAccion(), que usan los demás servicios
│       ├── tiempos-respuesta/
│       ├── tablero/              el estado de la empresa y sus indicadores (RF28)
│       ├── identidad/            nombre comercial, color (con su contraste WCAG) y logo de una empresa (RF31)
│       └── salud/
├── tests/
│   ├── apoyo/                    PostgreSQL de pruebas y datos de ejemplo (E7)
│   ├── unitarias/                piezas sueltas, sin base de datos
│   └── integracion/              la API y el esquema de verdad, contra PostgreSQL 17
├── .env.example
├── package.json
├── tsconfig.json                 comprobación de tipos de todo, pruebas incluidas
├── tsconfig.build.json           compilación de src/ a dist/
└── vitest.config.ts
```

Las capas que un módulo no necesita, no existen: `salud/` no tiene reglas ni entrada que validar, así
que solo tiene rutas, controlador y repositorio. En los módulos cuyos manejadores son de tres líneas
(notificaciones, solicitudes, tiempos de respuesta, consulta del historial) el controlador vive en el
mismo archivo que las rutas.

**Regla de dependencias.** Dentro de cada módulo, las llamadas van en un solo sentido:

```
rutas → controlador → servicio → repositorio | almacenamiento | historial
```

| Pieza | Hace | No hace |
|---|---|---|
| `*.rutas.ts` | Declara la URL, sus middlewares y su controlador | Nada más |
| `*.controlador.ts` | Valida la entrada con su esquema (`esquema.parse(req.body)`), llama al servicio y elige el código HTTP. Si la entrada no es válida, Zod lanza y el manejador central responde 400 | SQL o reglas de negocio |
| `*.servicio.ts` | Reglas de negocio, transacción y registro en el historial, siempre con `actor.datos.ejecutar()` | Importar Express, tocar `req` y `res`, o recibir el pool |
| `*.repositorio.ts` | SQL parametrizado y traducción entre `snake_case` y `camelCase` | Reglas, o llamar a otro módulo |
| `*.esquemas.ts` | Esquemas Zod de entrada y los tipos que se derivan de ellos | Lógica |

## 3. Frontend

```
frontend/
├── public/
├── src/
│   ├── main.tsx                  monta React y el enrutador
│   ├── rutas.tsx                 mapa de rutas: públicas y con sesión
│   ├── estilos.css               Tailwind, los tonos de la marca a partir de un color y el modo oscuro (D28)
│   ├── api/
│   │   ├── cliente.ts            fetch con el token, errores uniformes, 401 → sesión terminada
│   │   ├── recursos.ts           una función por endpoint de docs/04-api.md, agrupadas por recurso
│   │   └── tipos.ts              forma de las respuestas de la API
│   ├── sesion/
│   │   ├── SesionContext.tsx     usuario, empresa y token; iniciar, cerrar y caducar la sesión; tema y marca
│   │   ├── apariencia.ts         pone el tema en <html data-tema> y el color de la empresa en --marca
│   │   └── Rutas.tsx             sin sesión → /login; la primera pantalla según el rol; el permiso lo decide la API (D8)
│   ├── layout/
│   │   ├── Layout.tsx            barra lateral en escritorio, menú plegable en el celular, barra superior
│   │   ├── Navegacion.tsx        los grupos del menú y qué rol ve cada uno
│   │   └── Campana.tsx           las notificaciones de la barra superior (no para el Master)
│   ├── componentes/              piezas reutilizables sin lógica de negocio: botón, campos, diálogo, avisos, página, ruta (Migas)
│   ├── paginas/
│   │   ├── auth/                 IniciarSesion, RecuperarClave, RestablecerClave
│   │   ├── plataforma/           Resumen, NuevaEmpresa, DetalleEmpresa (solo el Master)
│   │   ├── documentos/           ListaDocumentos, SubirDocumento, DetalleDocumento y su ActividadDelDocumento
│   │   ├── solicitudes/
│   │   ├── notificaciones/
│   │   ├── cuenta/               MiCuenta: datos, contraseña y tema
│   │   ├── identidad/            EditorDeIdentidad, que usan el administrador y el Master
│   │   ├── admin/                Tablero, Usuarios, Categorias, Historial, Papelera, Identidad
│   │   └── errores/              NoEncontrado (el 403 lo explica ErrorDeCarga, en componentes/Pagina)
│   ├── hooks/                    useConsulta (cancela la petición anterior) y la medición del listado (indicador 7)
│   ├── utilidades/               fechas en hora de Lima, pesos de archivo, resumen del historial…
│   ├── pruebas/                  preparación de Vitest y una API simulada en memoria
│   └── **/*.test.ts(x)           pruebas junto a lo que prueban: sesión, marco, documentos, apariencia, cliente
├── e2e/                          pruebas funcionales de punta a punta (E8)
│   ├── *.spec.ts                 un caso por requisito, con su código RF en el título
│   ├── apoyo.ts                  datos de partida por la API, inicio de sesión, correos
│   ├── entorno.ts                puertos y carpeta desechable de cada ejecución
│   └── informe.ts                escribe docs/evidencias/pruebas-funcionales.md
├── index.html
├── vercel.json                   redirección de la SPA y cabeceras de seguridad (CSP)
├── playwright.config.ts          levanta la API y la compilación de producción para las pruebas funcionales
├── vite.config.ts
├── .env.example
├── package.json
└── tsconfig.json
```

## 4. Dependencias previstas

### Backend

| Paquete | Para qué | Por qué este |
|---|---|---|
| `express` 5 | Servidor HTTP y rutas | Lo fija el stack; la versión 5 lleva los errores de funciones `async` al manejador central (E4) |
| `pg` | Cliente de PostgreSQL | El estándar en Node; SQL directo, sin ORM |
| `zod` | Validar la entrada | Un esquema valida y da el tipo a la vez |
| `jose` | Firmar y verificar los JWT | Sin dependencias propias y mantenido activamente |
| `bcryptjs` | Hash de contraseñas | JavaScript puro: no necesita compilación nativa ni en Windows ni en Render |
| `multer` | Recibir archivos (`multipart/form-data`) | Express no lo trae; corta por tamaño mientras recibe |
| `@supabase/storage-js` | Subir archivos y firmar enlaces | Solo el cliente de Storage, no el SDK completo |
| `cors` | Admitir solo el origen del frontend | Pequeño y estándar |
| `express-rate-limit` | Limitar los intentos de inicio de sesión y las peticiones de recuperación | Resuelve los casos borde (ventanas, cabeceras) que un limitador casero olvida |

En desarrollo: `typescript`, `tsx` (ejecutar TypeScript sin compilar), `vitest` (pruebas),
`supertest` (pruebas HTTP), `embedded-postgres` (PostgreSQL 17 para las pruebas, E7) y los tipos
`@types/*`.

npm 11 bloquea por defecto los scripts de instalación. En `package.json` quedan decididos uno a
uno: se deniega el de `esbuild`, porque solo verifica un binario que ya llega instalado, y se permiten
los de `embedded-postgres` para Windows y para Linux, que recrean los enlaces que necesitan sus binarios.
PostgreSQL no arranca como root: en Linux, las pruebas se ejecutan con un usuario normal.

### Frontend

| Paquete | Para qué |
|---|---|
| `react`, `react-dom` | La interfaz |
| `react-router` | Rutas y navegación |
| `lucide-react` | Iconos |

En desarrollo: `vite`, `@vitejs/plugin-react`, `tailwindcss` con `@tailwindcss/vite`, `typescript`,
`vitest` con `jsdom` y la familia `@testing-library` (pruebas de pantallas), y para las pruebas
funcionales `@playwright/test` con `@types/node` (E8). Ninguna llega al navegador del usuario.

### Lo que no se instala

| Paquete | Por qué no |
|---|---|
| Un ORM (Prisma, TypeORM) | Para nueve tablas, el SQL a la vista es más corto y más fácil de defender que una capa intermedia |
| `helmet` | La API solo devuelve JSON. Las cabeceras que importan (CSP) van en el frontend, en `vercel.json`, y la cabecera `X-Powered-By` se quita con una línea |
| `axios` | `fetch` es nativo en el navegador y en Node 24 |
| Redux, Zustand | El único estado global es la sesión |
| TanStack Query | Pocas pantallas y ningún dato compartido entre ellas |
| `nodemailer` u otro proveedor de correo | Las notificaciones son internas (D15) |
| `moment`, `date-fns` | `Intl.DateTimeFormat` con la zona `America/Lima` es suficiente |
| `@supabase/supabase-js` | Incluye Auth, Realtime y la API automática, que no se usan (D14) |

## 5. Variables de entorno

### Backend

| Variable | Ejemplo | Para qué |
|---|---|---|
| `NODE_ENV` | `production` | Activa las respuestas de error sin detalles técnicos |
| `PORT` | `4000` | En producción la define Render. En local no es 3000 porque ese puerto lo usa tu PostgreSQL instalado |
| `DATABASE_URL` | `postgresql://postgres.<ref>:<clave>@<host-del-pooler>:5432/postgres` | Supavisor en modo sesión (D12). Sin `?sslmode`: el cifrado lo configura `DATABASE_CA` |
| `DATABASE_CA` | El certificado de Supabase, en PEM | Con él, la conexión se cifra **y** comprueba que el servidor es Supabase. Obligatoria si la base no está en la misma máquina: sin ella la API no arranca |
| `JWT_SECRETO` | 32 bytes aleatorios o más | Firma de los tokens |
| `JWT_DURACION_HORAS` | `8` | Duración de una sesión |
| `SUPABASE_URL` | `https://<ref>.supabase.co` | Storage |
| `SUPABASE_CLAVE_SECRETA` | — | Clave de servidor de Supabase; solo existe en el backend |
| `STORAGE_BUCKET` | `documentos` | Bucket privado |
| `RESPALDOS_BUCKET` | `respaldos` | Bucket privado de los respaldos de la base (D25) |
| `DIRECTORIO_RESPALDOS` | `respaldos` | Carpeta de los respaldos con `ALMACENAMIENTO=disco` |
| `CORS_ORIGEN` | `https://<app>.vercel.app` | Orígenes admitidos, separados por comas. Por defecto, el de Vite en local |
| `PROXIES_DE_CONFIANZA` | `0` en local | Cuántos proxies hay delante de la API. Si se queda corto, todos los usuarios parecen la misma IP y comparten el límite de intentos; si se pasa, cualquiera falsifica su IP con una cabecera. En Render se fija con `DIAGNOSTICO_RED` ([backend/README.md](../backend/README.md)) |
| `DIAGNOSTICO_RED` | `false` | Activa `GET /salud/red`, que muestra qué IP ve la API. Solo para el primer despliegue |
| `ALMACENAMIENTO` | `disco` en local, `supabase` en producción | Dónde viven los archivos (D16). En producción, `disco` impide arrancar |
| `DIRECTORIO_ARCHIVOS` | `archivos` | Carpeta de los archivos con `ALMACENAMIENTO=disco` |
| `URL_PUBLICA` | `http://localhost:4000` | Dirección de la API para los enlaces de archivos en disco |
| `CORREO` | `archivo` en local, `brevo` en producción | Cómo salen los correos (D19). En producción, `archivo` impide arrancar |
| `DIRECTORIO_CORREOS` | `correos` | Carpeta de los correos con `CORREO=archivo` |
| `BREVO_CLAVE_API` | — | Clave de la API de Brevo; solo existe en el backend |
| `CORREO_REMITENTE` | `avisos@ejemplo.pe` | Remitente verificado en Brevo |
| `CORREO_REMITENTE_NOMBRE` | `Gestión Documental` | Nombre visible del remitente |
| `URL_FRONTEND` | `https://<app>.vercel.app` | Adonde apunta el enlace de recuperación. En producción no puede ser localhost |

Las del Master solo las lee `npm run crear-master` (y `npm run local`, si están): `MASTER_EMAIL`,
`MASTER_PASSWORD`, `MASTER_NOMBRE` y `MASTER_DNI`. Viven en el `.env` de quien ejecuta el script, que
no se sube al repositorio, y nunca en Render.

### Frontend

| Variable | Ejemplo | Para qué |
|---|---|---|
| `VITE_API_URL` | `https://<servicio>.onrender.com/api/v1` | Dirección de la API |

Todo lo que empieza por `VITE_` acaba dentro del JavaScript que descarga el navegador: ahí nunca va
un secreto.

## 6. Decisiones de estructura

**E1 · Un repositorio con dos proyectos.** `backend/` y `frontend/` conviven en el mismo repositorio,
cada uno con su `package.json` y sin workspaces. Vercel y Render permiten indicar la carpeta de cada uno.
*Descartado:* dos repositorios (doble mantenimiento y la historia de la tesis partida en dos) y los
workspaces de npm (una herramienta más, sin código compartido que la justifique).

**E2 · TypeScript en los dos lados.** Los errores de forma —un campo mal escrito, un nulo no
previsto— aparecen al compilar y no frente al jurado. En el backend, cada esquema Zod valida la
entrada y define su tipo a la vez.
*Descartado:* JavaScript plano. Arranca antes, pero a lo largo de siete fases ese ahorro se paga
depurando.

**E3 · Módulos por funcionalidad, con capas dentro de cada módulo.** Todo lo de documentos vive en
`modulos/documentos/`. Los servicios no conocen Express, así que las reglas se prueban sin levantar un
servidor. Solo el almacenamiento está detrás de una interfaz, porque es la única pieza con una
alternativa real (S3, disco); los repositorios no, porque no habrá otra base de datos.
*Descartado:* carpetas por capa en la raíz (`controllers/`, `services/`…), que obligan a recorrer cinco
carpetas para entender una funcionalidad, y una Clean Architecture completa, con interfaces para todo,
que aquí sería ceremonia.

**E4 · Express 5 y Zod.** Express 5 envía al manejador central los errores de las funciones `async` sin
envoltorios; en Express 4, una promesa rechazada dejaba la petición colgada. Con Zod, un esquema por
endpoint valida y tipa a la vez.
*Descartado:* NestJS (sobredimensionado para 28 endpoints), express-validator y Joi (no derivan los tipos).

**E5 · Frontend con Vite, Tailwind 4 y React Router, sin librería de estado.** El único estado global es
la sesión, y para eso basta un Context. Los datos se piden con `fetch` y unos pocos hooks propios.
*Descartado:* Create React App (abandonado por el propio equipo de React), y Redux o TanStack Query, que
resuelven problemas que diez pantallas sin datos compartidos no tienen.

**E6 · Migraciones en SQL con un ejecutor propio de unas 80 líneas.** Cada archivo se aplica en su propia
transacción y se registra con su suma SHA-256. Si una migración ya aplicada cambia o desaparece, el
ejecutor se detiene sin tocar nada: así, la base de desarrollo y la de producción no pueden divergir
sin que nadie lo note. Los saltos de línea se normalizan antes de calcular la suma, porque Git los
convierte al clonar en Windows y la misma migración daría dos sumas distintas.
*Descartado:* node-pg-migrate y Prisma Migrate (más dependencias y más conceptos para una tarea que
cabe en un archivo legible) y las migraciones de la CLI de Supabase (atarían el esquema a Supabase, que
D14 evita).

**E7 · Las pruebas corren contra un PostgreSQL 17 real, sin instalar nada.** El paquete
`embedded-postgres` arranca los binarios oficiales de PostgreSQL en un directorio temporal, una vez
por ejecución; cada archivo de pruebas crea su propia base y le aplica las migraciones reales. Así, las
restricciones, los triggers, el índice de trigramas y `unaccent` se prueban tal como funcionarán en
Supabase, con la misma versión mayor.
*Descartado:* PGlite (PostgreSQL compilado a WebAssembly). Se probó primero, y su servidor de sockets
cierra la conexión tras cualquier error de SQL, justo el caso que más prueban estas pruebas. Tampoco se
usaron Docker (fuera del alcance) ni el proyecto de Supabase (lento, compartido y con datos reales).

**E8 · Pruebas funcionales con Playwright, contra la compilación de producción.** Cada requisito
funcional tiene un caso que lo recorre en un Chromium real como lo haría una persona, contra la API con
un PostgreSQL desechable y el frontend compilado para producción. Lo segundo importa: el fallo más
grave de la Fase 7 (las primeras peticiones al recargar salían sin token) solo existía en esa
compilación, porque en desarrollo StrictMode lo tapaba. El informe sale solo y es evidencia para la tesis.
*Descartado:* Cypress (otra herramienta y otro estilo de pruebas para lo mismo), probar a mano con una
planilla (no se repite igual dos veces) y probar contra `npm run dev` (habría pasado con el fallo dentro).

**Validación en el controlador.** La Fase 0 preveía un middleware `validar`. Se descartó al construirlo:
en Express 5, `req.query` es de solo lectura, así que el middleware tendría que dejar los datos validados
en otro sitio y perderían su tipo. El controlador llama a `esquema.parse(req.body)` y obtiene la entrada ya
tipada; si no es válida, Zod lanza y el manejador central responde 400.
