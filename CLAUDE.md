# CLAUDE.md — Sistema Web de Gestión Documental (Tesis UPN) — v2

> **Cambio respecto a la v1:** el sistema pasa a ser **multiempresa (multi-tenant)**
> con tres niveles de acceso. La v1 declaraba multi-tenant fuera de alcance.
> Si ya existe código escrito bajo la v1, leer la sección "Migración desde la v1"
> antes de continuar.

## Tu rol

Eres mi CTO, Arquitecto Senior Full Stack, Analista Funcional y Asesor de Tesis.
No eres un generador de código. Antes de escribir, decides, cuestionas y me
corriges. Si detectas sobreingeniería, una mala decisión técnica o un riesgo
para el plazo, me detienes y propones la alternativa.

Antes de construir cualquier módulo: analiza su viabilidad técnica, evalúa si
aporta valor a la tesis, verifica que esté alineado con Cloud Computing y
confirma que el alcance sigue siendo el de una tesis de pregrado.

## Contexto académico

Tesis de pregrado, Ingeniería de Sistemas Computacionales, UPN.

**Título:** "Desarrollo de un sistema web basado en Cloud Computing para el
mejoramiento de la gestión documental en micro y pequeñas empresas de Lima, 2026"

**Autor:** Diego Moisés Acosta Gerónimo

Esto es un MVP para sustentar una tesis, no un producto comercial. Si una
funcionalidad no aporta a un objetivo de la tesis, se descarta o se posterga.

## Visión del producto

El sistema **no** está diseñado para una sola empresa. Es una plataforma
adaptable a múltiples rubros: talleres textiles, estudios contables,
consultoras, comercios, empresas de servicios, estudios jurídicos y pequeñas
industrias.

Un taller textil de Lima es únicamente el **caso de validación** del prototipo.
La arquitectura debe ser reutilizable y escalable más allá de ese caso.

## Modelo de acceso: tres niveles

| Nivel | Rol | Alcance |
|---|---|---|
| 1 | Administrador Master | Toda la plataforma |
| 2 | Administrador de Empresa | Solo su empresa |
| 3 | Usuario | Solo lo autorizado dentro de su empresa |

**Administrador Master.** Registra empresas, las activa o desactiva, gestiona a
los administradores de empresa, supervisa el uso de la plataforma y el
almacenamiento global, y visualiza métricas generales. Representa al propietario
de la plataforma.

**Administrador de Empresa.** Gestiona los usuarios de su empresa, crea
categorías documentales, configura permisos, administra y aprueba documentos y
revisa el historial de actividad. Solo ve información de su propia empresa.

**Usuario.** Consulta los documentos autorizados, sube, descarga y busca
documentos, y participa en los flujos de aprobación.

## Cuenta del Administrador Master

El Administrador Master es el autor de la tesis, Diego Moisés Acosta Gerónimo.
Es una cuenta única: la plataforma no permite registrar un segundo Master desde
la interfaz.

**Identificación:** correo electrónico. El DNI es un dato del perfil del
usuario, no una credencial, y nunca se usa para autenticar.

**Cómo se crea.** Mediante un script de inicialización (*seed*) que se ejecuta
una sola vez contra la base de datos y lee sus valores de variables de entorno:
`MASTER_EMAIL`, `MASTER_PASSWORD`, `MASTER_NOMBRE`, `MASTER_DNI`. Si el usuario
ya existe, el script no hace nada. No hay registro público de Master.

**Reglas de credenciales — obligatorias:**

- Ningún correo, contraseña, DNI ni token aparece en el código ni en este
  archivo. Todo vive en `.env`, y `.env` está en `.gitignore`.
- El repositorio incluye un `.env.example` con los nombres de las variables y
  valores de ejemplo, nunca los reales.
- Las contraseñas se almacenan con hash **bcrypt**, mínimo 10 rondas. Jamás en
  texto plano, ni siquiera en desarrollo.
- La contraseña del Master no puede ser el DNI, ni el correo, ni una secuencia
  numérica. Mínimo 12 caracteres.
- Si alguna credencial llega a subirse al repositorio por error, se cambia; no
  basta con borrarla del commit.

## Recuperación de contraseña

Está **dentro del alcance** y aplica a los tres roles.

Flujo: el usuario pide recuperar con su correo, recibe un enlace con un token
de un solo uso y vigencia de 60 minutos, define una contraseña nueva y el token
queda invalidado. Por seguridad, la respuesta del sistema es la misma exista o
no el correo, para no revelar qué cuentas están registradas.

Cada solicitud y cada cambio efectivo de contraseña se registran en el
historial de actividad.

## Aislamiento de información — requisito crítico

Cada empresa tiene aislados sus usuarios, documentos, categorías, historiales y
permisos. **Una empresa nunca debe poder acceder a información de otra.**

Reglas obligatorias:

- Toda tabla de negocio lleva `empresa_id` con clave foránea.
- Ninguna consulta de datos de empresa se ejecuta sin filtrar por `empresa_id`.
- El `empresa_id` se obtiene **del token JWT**, nunca de un parámetro que envíe
  el cliente. Si llega por body o por query, se ignora.
- El filtrado vive en una capa transversal (middleware o repositorio base), no
  repetido a mano en cada endpoint.
- El Administrador Master es la única excepción, y debe ser explícita en el
  código, no un efecto colateral de un filtro ausente.

Un fallo aquí no es un bug menor: es una fuga de datos entre empresas y es lo
primero que un jurado técnico va a intentar romper.

## Objetivos que el sistema debe permitir demostrar

El sistema se evalúa en preprueba y posprueba, midiendo:

| # | Indicador | Cómo se obtiene |
|---|---|---|
| 1 | Tiempo de organización y categorización de documentos | Cronómetro sobre la tarea real |
| 2 | Tiempo de búsqueda de un documento | Cronómetro sobre la tarea real |
| 3 | Tasa de recuperación exitosa de documentos | Documentos obtenidos / solicitados |
| 4 | Porcentaje de acciones registradas en el historial | Acciones en historial / ejecutadas |
| 5 | Accesibilidad remota del sistema | Accesos exitosos desde móvil / intentos |
| 6 | Accesos correctos según rol de usuario | Accesos correctos / evaluados |
| 7 | Tiempo de respuesta del sistema | Tiempo de carga de un listado |

**Requisito no negociable:** el sistema debe dejar rastro de estos datos por sí
mismo. El historial guarda usuario, empresa, acción, entidad afectada y
timestamp. Sin eso no hay Capítulo 3 y la tesis no cierra.

El indicador 6 ahora cubre también el aislamiento entre empresas, no solo los
permisos dentro de una empresa.

## Alcance del MVP

**Dentro:**

- Autenticación con JWT: registro, login, logout
- Tres roles: Administrador Master, Administrador de Empresa, Usuario
- Gestión de empresas por el Administrador Master (alta, baja, activación)
- Gestión de usuarios por el Administrador de Empresa
- Recuperación de contraseña por correo, con token de un solo uso
- Subida, visualización, descarga y búsqueda de documentos
- Categorías documentales definidas por cada empresa
- Búsqueda por nombre, categoría y fecha
- Flujo de aprobación de un nivel: pendiente → aprobado o rechazado
- Historial de actividad con trazabilidad completa
- Interfaz responsive, usable desde celular

**Fuera (no proponer, no implementar):**

- Blockchain, inteligencia artificial, OCR, firma digital
- Flujos de aprobación multinivel
- Facturación, planes de pago, suscripciones
- Tiempo real, websockets, notificaciones push
- Microservicios, Docker, Kubernetes, CI/CD complejo
- Bases de datos o esquemas separados por empresa (ver "Decisiones ya tomadas")

**Añadido tras la auditoría técnica (octubre de 2026):**

- Categorías restringidas a personas concretas de la empresa (permisos por categoría)
- Papelera de 30 días con restauración y eliminación definitiva
- Auditoría de la plataforma para el Master (sus acciones y los accesos sin empresa)
- Tablero del Administrador de Empresa con los siete indicadores
- Respaldo nocturno de la base con restauración probada
- Bloqueo por cuenta tras contraseñas incorrectas

**Añadido tras la segunda auditoría (octubre de 2026):**

- Actividad de cada documento en su ficha, y tablero con flujo de aprobación y actividad reciente (hecho)
- Identidad visual por empresa reducida: nombre comercial, logo y un color primario; solo la cambian el
  Administrador de Empresa y el Master (hecho)
- Modo oscuro, elegido por cada persona y guardado en su cuenta (hecho)
- Vista previa del archivo (PDF e imágenes) dentro de la ficha del documento (hecho)

**Postergado — solo si sobra tiempo al final:**

- Etiquetas de documentos además de las categorías
- Versionado de documentos (5,5 días; si no cabe antes del congelamiento, va a la tesis como trabajo
  futuro) y reportes
- Color secundario y favicon por empresa, favoritos y búsquedas recientes, que la segunda auditoría
  descartó

## Stack

| Capa | Tecnología | Despliegue |
|---|---|---|
| Frontend | React + TailwindCSS | Vercel |
| Backend | Node.js + Express (API REST) | Render |
| Base de datos | PostgreSQL | Supabase |
| Archivos | Supabase Storage | — |
| Autenticación | JWT | — |

Costo objetivo: 0. Todo en capa gratuita. Si una decisión implica pagar, avísame
antes.

## Decisiones ya tomadas

**Multi-tenancy por columna compartida.** Una sola base de datos, un solo
esquema, y una columna `empresa_id` en cada tabla de negocio. Se descartaron un
esquema por empresa y una base por empresa: ambos multiplican el costo de las
migraciones y no aportan nada demostrable para la tesis.

**Supabase Storage para archivos.** Vive en la misma cuenta que la base de
datos, tiene capa gratuita y no exige configurar permisos de un proveedor
aparte. Se descartó AWS S3 por sumar una cuenta y una configuración más sin
beneficio para el alcance.

**JWT en lugar de sesiones en servidor.** Sin estado, lo que encaja con un
backend desplegado en Render que puede reiniciarse. El token transporta el
`empresa_id` y el rol, que es justo lo que necesita el filtrado multiempresa.

**Envío de correos: autenticación propia y Brevo.** Decidido en la migración a
v2. Los correos de recuperación salen por la API HTTPS de Brevo (300 al día
gratis, sin dominio propio; Render gratuito bloquea SMTP), detrás de una
interfaz que en desarrollo los guarda en una carpeta. Se descartó Supabase Auth:
habría que duplicar las cuentas y el historial dependería de otro sistema; y
Resend, que exige un dominio propio para escribir a terceros.

**JWT con la sesión comprobada en la base.** El token lleva `empresa_id` y rol,
pero en cada petición se comprueba su sesión (`jti`) y se leen el rol y la
empresa vigentes: cerrar sesión, desactivar a alguien o a su empresa vale al
instante. Se descartó el JWT puramente sin estado, que dejaría entrar a un
usuario desactivado hasta que caducara su token.

**Aislamiento en una capa transversal y con RLS.** Ningún servicio recibe la
conexión: recibe un acceso a datos que adopta un rol de PostgreSQL sin
privilegios y fija la empresa de la identidad; las políticas RLS filtran todas
las tablas. Se descartó filtrar solo en el código: un `WHERE` olvidado sería una
fuga.

**El Master, excepción explícita.** Tiene su propio acceso (`app_plataforma`) y
sus propias rutas (`/plataforma`); ve empresas, administradores y conteos, nunca
documentos. Se descartó un Master que «ve todo», que sería el atajo para leer
datos ajenos.

**Sin registro público.** Las empresas las da de alta el Master con su primer
administrador. Se descartó el autorregistro: cualquiera crearía empresas en la
plataforma de la tesis.

**La API entra a la base con un usuario propio, `gestion_api`.** Dueño del esquema, sin superusuario
ni BYPASSRLS, creado una vez con su contraseña ya cifrada (D21). Se descartó conectar como `postgres`:
más privilegios de los necesarios, y Supabase solo deja cambiar su contraseña desde el panel.

**El monitor vive en Supabase.** Un trabajo de `pg_cron` llama a `/salud` cada 10 minutos con `pg_net`:
la API no se duerme y Supabase no pausa el proyecto (D13). Se descartó depender solo de UptimeRobot, que
exige otra cuenta; queda como opcional para tener un registro de caídas visto desde fuera.

**Pruebas funcionales contra la compilación de producción.** Playwright recorre cada requisito en un
navegador real contra la API con una base desechable y el frontend compilado como en Vercel, y deja su
informe en `docs/evidencias/`. Se descartó probar contra `npm run dev`, donde StrictMode tapaba un fallo
que solo existía en producción, y la prueba manual con planilla, que no se repite igual dos veces.

**Los permisos por categoría también los decide la base.** Cada transacción fija quién actúa y con qué rol, y
una política RLS restrictiva oculta una categoría restringida y sus documentos a quien no tiene acceso (D22). Se
descartó comprobarlo en cada servicio: un olvido sería una fuga dentro de la empresa.

**Papelera con purga que deja constancia.** Lo eliminado se restaura durante 30 días; después una tarea de la
API borra el archivo y deja la fila con `purgado_en` (D23). Se descartó borrar la fila: el historial la nombra.

**El Master audita solo lo que es de la plataforma.** RLS le deja leer del historial sus acciones y lo que no
es de ninguna empresa (D24). Se descartó darle el historial completo: sería leer el contenido por la puerta de
atrás.

**Respaldo lógico nocturno en un bucket privado.** La API guarda cada noche la base comprimida y conserva 30
días; se restaura con un script en una base vacía, y el Master no puede descargarlos (D25). Se descartaron
`pg_dump` (no está en Render) y el plan Pro de Supabase (de pago).

**Integración continua sin despliegue.** GitHub Actions ejecuta las pruebas en cada push y pull request; Render y
Vercel siguen desplegando solos (D26). Se descartó un pipeline que despliegue: es el CI/CD complejo que queda fuera.

**La actividad de un documento sale del historial, según quién mira.** La ficha muestra su línea de tiempo sin
tablas nuevas: todos ven el ciclo de vida, quien consulta el historial ve además vistas y descargas (D27). Se descartó
mostrar todo a todos: la ficha sería una vigilancia entre compañeros.

**La preprueba mide el proceso actual; el sistema se congela antes de la capacitación.** El diseño es O1 → X → O2 y la
preprueba no usa el sistema, así que puede adelantarse; desde la capacitación hasta terminar la posprueba el sistema no
cambia (etiqueta de versión y respaldo restaurado). Se descartó congelar desde la preprueba: frenaba el desarrollo sin
proteger ninguna medición (`docs/09-protocolo-evaluacion.md`).

**Identidad y tema sobre variables de CSS.** Un solo color por empresa da todos los tonos con `color-mix`, y el modo
oscuro redefine las variables de Tailwind: ningún componente cambió de clases. La API solo acepta colores con 4,5:1 frente
al texto blanco, y el logo (PNG o JPG) vive en el bucket privado con enlace firmado; el tema se guarda en la cuenta (D28).
Se descartaron un bucket público para los logos, admitir SVG y guardar el tema solo en el navegador.

**Vista previa con el enlace de «Ver» y el visor del navegador.** Usa el mismo enlace firmado, así que queda registrada
como vista; un PDF solo se incrusta si el navegador tiene visor (Chrome en Android no) y la CSP admite marcos solo de
Supabase (D29). Se descartaron pdf.js (más de 1 MB), un visor de Office en línea (manda el archivo a un tercero) y pasar
el archivo por la API.

Cuando tomes una decisión técnica relevante, agrégala aquí en dos o tres líneas,
con la alternativa descartada. El jurado va a preguntar por qué cada cosa.

## Migración desde la v1

Si ya existe código construido bajo la v1, **no sigas agregando funcionalidades**
hasta resolver esto. El orden es:

1. Auditar qué tablas y endpoints existen hoy.
2. Crear la tabla `empresas` y agregar `empresa_id` a cada tabla de negocio.
3. Agregar el rol de Administrador Master al modelo de usuarios.
4. Incluir `empresa_id` y rol en el payload del JWT.
5. Centralizar el filtrado por empresa en una capa transversal.
6. Revisar endpoint por endpoint que ninguno devuelva datos sin filtrar.
7. Probar explícitamente que un usuario de la empresa A no puede leer, modificar
   ni descargar nada de la empresa B.

El paso 7 no es opcional y debe quedar documentado: es evidencia directa del
indicador 6.

## Cómo trabajamos

Nunca empieces programando. El orden es:

1. Analizar el problema
2. Diseñar la solución
3. Diseñar la arquitectura
4. Diseñar la base de datos
5. Diseñar los endpoints de la API
6. Definir la estructura de carpetas
7. Diseñar los componentes
8. Recién entonces, escribir código

Si intento saltarme un paso, detenme y explícame por qué importa.

Trabajamos por fases. Al terminar cada fase paras, me muestras el resultado y
esperas mi aprobación. No avances dos fases en un mensaje.

## Reglas de código

- Clean Architecture donde aporte, sin dogmatismo
- Principios SOLID
- Código modular, funciones cortas, nombres explícitos
- Comentarios solo donde el porqué no sea obvio
- Variables de entorno para todo lo sensible; nunca credenciales en el código
- Manejo de errores centralizado en el backend
- Validación de entrada en el backend, siempre
- Sin dependencias que no hagan falta

## Fases del proyecto

- **Fase 0** — Análisis y arquitectura: diagrama de arquitectura, modelo
  entidad-relación multiempresa, catálogo de endpoints, estructura de carpetas.
  Sin código.
- **Fase 1** — Base del backend: proyecto, conexión a base de datos,
  migraciones, manejo de errores, variables de entorno.
- **Fase 2** — Autenticación, tres roles y aislamiento por empresa. Incluye el
  script de inicialización del Administrador Master, la recuperación de
  contraseña por correo y el historial de actividad. El historial entra aquí,
  no al final.
- **Fase 3** — Empresas y usuarios: alta de empresas por el Master, alta de
  usuarios por el Administrador de Empresa.
- **Fase 4** — Documentos: subida, categorías, búsqueda, descarga.
- **Fase 5** — Flujo de aprobación.
- **Fase 6** — Frontend: layout, sidebar, navbar, rutas protegidas por rol,
  componentes reutilizables.
- **Fase 7** — Pantallas funcionales conectadas a la API.
- **Fase 8** — Responsive, pruebas de aislamiento entre empresas, pruebas
  funcionales y despliegue.

## Qué necesito de ti al final de cada fase

- Qué quedó hecho, en lenguaje claro
- Qué decisiones tomaste y por qué
- Qué falta y qué sigue
- Si algo del plan ya no tiene sentido, dímelo
