# 02 · Arquitectura

## 1. Vista general

```mermaid
flowchart LR
    subgraph USR["Dispositivo del usuario"]
        NAV["Navegador<br/>PC o celular"]
    end
    subgraph VER["Vercel · CDN global"]
        SPA["SPA React<br/>archivos estáticos"]
    end
    subgraph REN["Render · Virginia, EE. UU."]
        API["API REST · Express<br/>/api/v1"]
    end
    subgraph SUP["Supabase · us-east-1, Virginia"]
        PG[("PostgreSQL")]
        ST[("Storage<br/>bucket privado")]
    end
    MON["Monitor externo"]

    NAV -->|"1 · carga la aplicación"| SPA
    NAV -->|"2 · JSON con el JWT en la cabecera"| API
    API -->|"SQL por Supavisor, modo sesión"| PG
    API -->|"sube archivos y firma enlaces"| ST
    NAV -->|"3 · descarga con enlace firmado de 5 min"| ST
    MON -->|"GET /salud cada 10 min"| API
```

Todo viaja por HTTPS o TLS. El navegador nunca habla con la base de datos, y con Storage solo para
descargar un archivo con un enlace que la API firmó después de autorizar y registrar.

## 2. Estilo: tres capas, un monolito modular

| Capa | Pieza | Responsabilidad |
|---|---|---|
| Presentación | SPA React | Pantallas, navegación y formularios. No decide permisos: oculta lo que la API dice que no se puede hacer |
| Aplicación | API Express | Autenticación, autorización, reglas de negocio, transacciones e historial |
| Datos | PostgreSQL y Storage | Persistencia, integridad (claves foráneas y restricciones) y archivos |

Un solo servicio de backend, organizado en módulos: auth, usuarios, categorías, documentos,
solicitudes, notificaciones e historial. Los microservicios están fuera del alcance, y para siete
módulos y cinco usuarios solo añadirían red y despliegues.

## 3. Dentro de la API

```mermaid
flowchart TB
    REQ["Petición HTTP"] --> MW["Middlewares<br/>contexto · autenticar · autorizar · medir"]
    MW --> CTL["Controlador<br/>traduce HTTP y servicio"]
    CTL --> SRV["Servicio<br/>reglas de negocio y transacción"]
    SRV --> REP["Repositorio<br/>SQL parametrizado"]
    SRV --> HIS["Historial<br/>registrarAccion()"]
    SRV --> ALM["Almacenamiento<br/>interfaz"]
    REP --> PG[("PostgreSQL")]
    HIS --> PG
    ALM --> ST[("Supabase Storage")]
    MW -.->|error| ERR["Manejador central de errores"]
    CTL -.->|error| ERR
    SRV -.->|error| ERR
```

- **Middlewares.** `contexto` asigna un id a la petición y deduce si viene de un móvil; `autenticar`
  resuelve la sesión y crea el **acceso a datos** de la petición (§3.1); `autorizar` exige el permiso
  y, si falla, responde 403 y registra `ACCESO_DENEGADO`. Toda ruta entra por una de dos puertas: la
  de empresa (sesión y un rol de empresa) o la de plataforma (sesión y rol Master).
- **Controlador.** Valida la entrada con el esquema Zod del endpoint, llama al servicio y elige el
  código de estado. Ni SQL ni reglas. Por qué la validación vive aquí y no en un middleware:
  [Estructura §6](05-estructura.md).
- **Servicio.** Las reglas de negocio y la transacción. No conoce Express —no recibe `req` ni
  `res`—, así que se prueba sin levantar un servidor.
- **Repositorio.** SQL parametrizado y la traducción entre `snake_case` y `camelCase`. Ninguna regla.
  Sus consultas filtran por la empresa del actor, y debajo la base vuelve a filtrar (§3.1).
- **Historial.** `registrarAccion()` recibe la conexión de la transacción en curso: el registro y la
  operación se confirman o se deshacen juntos.
- **Errores.** Todos acaban en un único manejador, que produce el formato descrito en la [API](04-api.md).

### 3.1 La capa de acceso a datos: el aislamiento entre empresas (D17)

Ningún servicio de negocio recibe el pool de conexiones. Recibe, dentro del `Actor`, un acceso a
datos que creó la autenticación a partir de la identidad guardada en la base, nunca de lo que envía el
cliente. Cada operación corre en una transacción que primero adopta un rol de PostgreSQL sin
privilegios y fija la empresa activa; las políticas RLS hacen el resto.

```mermaid
flowchart LR
    T["Token válido"] --> S["Sesión vigente en la base<br/>usuario, rol, empresa"]
    S -->|Administrador o Usuario| E["accesoDeEmpresa(empresa)<br/>SET ROLE app_empresa<br/>app.empresa_id = empresa"]
    S -->|Master: la excepción, con nombre propio| P["accesoDePlataforma()<br/>SET ROLE app_plataforma"]
    E --> R1[("Solo las filas de su empresa")]
    P --> R2[("Empresas, administradores y cifras;<br/>nunca documentos")]
```

Son tres capas, y cada una basta por sí sola para que una consulta no devuelva nada ajeno: el
repositorio filtra por `empresa_id`; si una consulta lo olvidara, RLS no devuelve filas de otra
empresa; y las claves foráneas compuestas (M2) impiden que una fila apunte a otra empresa. Si la
transacción no fija empresa, `app_empresa` no ve nada: el fallo es cerrado. La identidad (iniciar
sesión, comprobar la sesión, recuperar la contraseña, el script del Master) es la otra excepción
explícita: averigua quién es alguien antes de saber su empresa, y por eso usa la conexión dueña de las
tablas, limitada a cuentas, sesiones y recuperaciones.

## 4. Flujos críticos

### 4.1 Autenticación en cada petición

```mermaid
sequenceDiagram
    autonumber
    participant N as Navegador
    participant A as API
    participant BD as PostgreSQL
    N->>A: petición con Authorization Bearer JWT
    A->>A: verifica firma y caducidad del token
    alt token inválido o caducado
        A-->>N: 401 NO_AUTENTICADO
    end
    A->>BD: sesión (jti), su usuario y su empresa, en una sola consulta
    BD-->>A: sesión, usuario, rol y empresa vigentes
    alt sesión revocada, usuario inactivo, empresa desactivada o empresa distinta de la del token
        A-->>N: 401 NO_AUTENTICADO
    end
    Note over A: identidad y acceso a datos (de empresa o de plataforma) quedan en la petición
    A->>A: puerta de la ruta: ¿rol de empresa o Master?
    alt la puerta no corresponde a su rol
        A->>BD: ACCESO_DENEGADO
        A-->>N: 403 SIN_PERMISO
    end
```

El token lleva la empresa y el rol (decisión C), pero el rol y la empresa que valen son los de la
base: un cambio de rol, una desactivación o la desactivación de la empresa valen desde la petición
siguiente. Si la empresa del token no coincide con la de la base, el token no es de fiar y se rechaza.

### 4.2 Subir un documento

```mermaid
sequenceDiagram
    autonumber
    participant N as Navegador
    participant A as API
    participant S as Storage
    participant BD as PostgreSQL
    N->>A: POST /documentos con archivo y datos
    A->>A: valida datos, tipo y peso
    A->>S: sube el archivo con un nombre generado
    A->>BD: BEGIN, INSERT documento, INSERT historial, COMMIT
    alt la transacción falla
        A->>S: borra el archivo recién subido
        A-->>N: 500 ERROR_INTERNO
    else confirmada
        A-->>N: 201 con el documento
    end
```

El archivo se sube **antes** de la transacción. Al revés, un fallo de Storage después de confirmar
dejaría un documento que apunta a un archivo inexistente. Así, lo peor que puede pasar es un archivo
huérfano que nada referencia, y aun así se intenta borrar.

### 4.3 Ver o descargar

```mermaid
sequenceDiagram
    autonumber
    participant N as Navegador
    participant A as API
    participant S as Storage
    participant BD as PostgreSQL
    N->>A: GET /documentos/ID/archivo?modo=descargar
    A->>BD: ¿existe, es de su empresa y no está eliminado?
    A->>S: firma un enlace de 5 minutos
    A->>BD: INSERT historial DOCUMENTO_DESCARGADO
    alt no se pudo registrar
        A-->>N: 500 y el enlace se descarta
    else registrado
        A-->>N: 200 con url y expiraEn
        N->>S: GET al enlace firmado
        S-->>N: el archivo, sin pasar por la API
    end
```

El enlace se firma antes de registrar y se entrega después: si el registro falla, el enlace existe,
pero nadie lo recibe.

### 4.4 Ciclo de una solicitud de aprobación

```mermaid
stateDiagram-v2
    [*] --> pendiente: el propietario la crea
    pendiente --> aprobada: un administrador aprueba
    pendiente --> rechazada: un administrador rechaza con motivo
    aprobada --> [*]
    rechazada --> [*]
```

Cada transición es una transacción: el cambio de estado, su registro en el historial y las
notificaciones. La resolución solo se aplica si la solicitud sigue pendiente; si dos administradores
resuelven a la vez, el segundo recibe 409 `SOLICITUD_RESUELTA`.

## 5. Despliegue

| Pieza | Servicio y plan | Región | Límites que condicionan el diseño |
|---|---|---|---|
| SPA | Vercel, Hobby | CDN global | Solo uso no comercial |
| API | Render, web service Free | Virginia | 512 MB de RAM y 0,1 CPU; se duerme tras 15 min sin tráfico y tarda alrededor de un minuto en despertar; 750 h al mes; 5 GB de salida al mes; disco efímero; puertos SMTP bloqueados |
| Base de datos | Supabase, Free | us-east-1 | 500 MB; se pausa tras 7 días sin actividad; sin copias de seguridad |
| Archivos | Supabase Storage, Free | us-east-1 | 1 GB; 50 MB por archivo (usamos 10); 5 GB de salida al mes |
| Monitor | UptimeRobot o cron-job.org, gratis | — | — |

**Entornos.** Desarrollo: API y frontend en local, contra un proyecto de Supabase «desarrollo».
Producción: Render y Vercel, contra un proyecto «producción». Son los dos proyectos activos que
permite el plan gratuito, y mantienen los datos de la evaluación lejos de las pruebas.

**Sin tarjeta registrada** en ningún proveedor: si se supera un límite, el servicio se restringe o
se suspende en vez de cobrar.

## 6. Seguridad

| Amenaza | Control |
|---|---|
| Robo de la base de datos | Contraseñas con bcrypt (coste 10); nunca en claro, tampoco en el historial |
| Fuerza bruta contra el inicio de sesión | Límite de intentos fallidos por IP (RN20); el mismo mensaje, y el mismo tiempo de respuesta, para un correo inexistente que para una contraseña errónea |
| Robo del token | Caduca en 8 h y se puede revocar; contra XSS, el escapado de React y una CSP estricta en Vercel |
| Escalada de privilegios | Rol leído de la base en cada petición; matriz aplicada solo en la API; cada 403 queda registrado; el rol `master` no se puede asignar desde la API y la base admite un solo Master |
| Acceso a datos de otra empresa | Empresa tomada de la identidad, nunca del cliente; capa de acceso transversal con RLS (D17); claves foráneas compuestas (M2); UUID imposibles de adivinar; lo ajeno responde 404; batería de pruebas A contra B en cada endpoint |
| Un token con otra empresa, aun firmado con el secreto | La empresa del token se compara con la de la base: si no coinciden, 401 |
| El Master leyendo el contenido de una empresa | Su rol de base (`app_plataforma`) no tiene permisos sobre documentos, solicitudes, notificaciones ni tiempos de respuesta; sus cifras salen de una función que solo devuelve conteos (decisión E) |
| Recuperación de contraseña como oráculo de cuentas o puerta trasera | Misma respuesta y mismo tiempo exista o no el correo; token de 256 bits, de un solo uso, 60 minutos, guardado como huella SHA-256 y enviado en el fragmento del enlace; límite de peticiones por IP |
| Inyección SQL | Solo consultas parametrizadas |
| Archivo malicioso | Lista blanca de tipos, 10 MB, nombre generado por el servidor, bucket privado y servido desde el dominio de Supabase, no desde el de la aplicación |
| Lectura de tablas por la API automática de Supabase | Data API desactivada y RLS activo en todas las tablas, con políticas solo para los roles propios de la API (D14, D17) |
| Secretos en el repositorio | Variables de entorno; `.env` ignorado por git; la clave secreta de Supabase y la de Brevo solo existen en Render; los datos del Master solo en el `.env` de quien ejecuta el script |
| Manipulación del historial | Solo inserción, impuesto por un trigger (M4) |
| Errores que revelan el interior | Manejador central: en producción, un 500 no lleva trazas ni SQL |
| Peticiones desde otros sitios | CORS solo admite el origen del frontend |

## 7. Decisiones técnicas

Cada una dice qué se decidió, por qué y qué se descartó. Las decisiones de datos están en el
[modelo de datos](03-modelo-datos.md) (M1–M10) y las de código, en la [estructura](05-estructura.md) (E1–E7).

### Las preguntas del jurado

**D1 · Una API propia entre el navegador y los datos.** Toda lectura y escritura pasa por Express. Es
la única forma de garantizar que cada acción quede en el historial dentro de su misma transacción
—lecturas incluidas: búsquedas y descargas— y de tener las reglas de negocio en un solo sitio.
*Descartado:* usar Supabase como backend completo (su Auth y su API automática con RLS) llamado desde
React. El navegador escribiría directamente y el registro dependería del cliente: un corte de red a
mitad de camino, y el indicador 4 pierde una acción.

**D2 · PostgreSQL.** Los datos son relacionales por naturaleza —empresas, usuarios, documentos,
solicitudes— y la integridad se puede exigir en la propia base: claves foráneas, restricciones,
índices únicos parciales y transacciones. Los indicadores, además, se calculan con SQL estándar.
*Descartado:* una base documental (MongoDB, Firestore). Sin claves foráneas, la coherencia entre
documento, solicitud e historial dependería solo del código.

**D3 · React, como SPA.** Una aplicación que vive detrás de un inicio de sesión no gana nada con el
renderizado en servidor: compilada a archivos estáticos, se sirve gratis desde una CDN y solo habla
con la API. React aporta componentes reutilizables y el ecosistema más amplio.
*Descartado:* Next.js (el renderizado en servidor no aporta detrás de un login y complica el
despliegue) y Angular (más estructura de la que piden una decena de pantallas).

**D4 · JWT, pero revocable.** El token, firmado con HS256 y válido 8 horas, lleva el id del
usuario, el de su sesión (`jti`) y, desde la v2, su empresa y su rol (decisión C). En cada petición la API comprueba esa sesión y al usuario en la
base, con una consulta que haría falta de todos modos para leer el rol vigente. Así, cerrar sesión,
desactivar a alguien o cambiarle el rol surte efecto al instante; la firma, por su parte, rechaza un
token manipulado o caducado sin tocar la base.
*Descartado:* JWT sin estado. Un usuario desactivado seguiría entrando hasta que caducara su token, y
eso es exactamente un acceso incorrecto para el indicador 6.

### Sesión, permisos y empresas

**D5 · El token viaja en la cabecera Authorization, no en una cookie.** El frontend (`vercel.app`) y
la API (`onrender.com`) están en dominios distintos, así que una cookie de sesión sería de terceros,
y Safari —el navegador del iPhone— las bloquea por defecto: iniciar sesión desde un iPhone fallaría,
y eso es el indicador 5.
*Descartado:* cookie httpOnly, que exige poner ambos bajo un dominio propio (cuesta dinero). El
riesgo que se acepta —un token en `localStorage` es legible si hubiera XSS— se acota con el escapado
de React, una CSP estricta y la caducidad de 8 horas.

**D6 · Una plataforma multiempresa por columna compartida (v2).** Todas las empresas viven en la
misma base y las mismas tablas; cada fila de negocio lleva `empresa_id`. Hay un Administrador Master
que da de alta las empresas con su primer administrador (no hay registro público, decisión B) y que no
pertenece a ninguna. Permite evaluar con personas de varias MYPEs sin mezclar sus documentos y sin un
despliegue por empresa.
*Descartado:* un esquema o una base por empresa (las migraciones se multiplican, y el plan gratuito
limita conexiones y proyectos) y una instalación por empresa. La v1 tenía ya la «organización» como
entidad; la v2 la renombra a empresa y añade el Master ([06-migracion-v2.md](06-migracion-v2.md)).

**D7 · El historial se escribe en la misma transacción que la acción.** Cada servicio abre una
transacción, ejecuta la operación y llama a `registrarAccion()` con la misma conexión: se confirman
las dos cosas o ninguna.
*Descartado:* triggers de auditoría. No ven las lecturas (búsquedas, descargas), no saben qué usuario
de la aplicación actuó y son más difíciles de probar. Sí se usa un trigger, pero solo para impedir que
el historial se modifique (M4).

**D8 · El frontend oculta; la API decide.** La interfaz esconde lo que el rol no permite, pero no
bloquea rutas por rol: si un usuario teclea `/admin/usuarios`, la página pide los datos, la API
responde 403 y lo registra. Si el bloqueo ocurriera en el navegador, ese intento no llegaría al
servidor y el indicador 6 no lo vería. Para no duplicar la matriz de permisos en el frontend, la API
devuelve con cada documento qué puede hacer con él quien lo consulta.
*Descartado:* guardas de ruta por rol en React: una segunda copia de la matriz, que tarde o temprano
diverge de la primera.

### Archivos

**D9 · Archivos en Supabase Storage, servidos con enlace firmado.** Bucket privado: la API firma un
enlace de 5 minutos después de autorizar y registrar, y el navegador descarga directamente de
Supabase. Mismo proveedor que la base, 1 GB gratis y sin tarjeta. Además, las descargas no
atraviesan Render, cuyo plan gratuito tiene 0,1 CPU y 5 GB de salida al mes.
*Descartado:* el disco de Render (se borra en cada reinicio), Amazon S3 (pide tarjeta y cobra al
salir de la capa gratuita) y Cloudinary (pensado para imágenes).

**D10 · La subida pasa por la API.** La validación (tipo y peso) y el registro ocurren en un solo
punto, y con un tope de 10 MB el archivo cabe en memoria.
*Descartado:* la subida directa del navegador a Storage con un enlace firmado de subida. Ahorraría
tráfico en Render, pero son dos pasos, deja archivos huérfanos si el segundo falla y el registro
dependería de que el navegador complete el proceso. Si el volumen creciera, sería el cambio natural.

### Infraestructura

**D11 · API y base de datos en la misma región: Virginia, EE. UU.** Cada petición hace varias
consultas; con la API y la base en regiones distintas, cada consulta pagaría el viaje de ida y vuelta.
Juntas, el único tramo largo es navegador → API, una vez por petición. Render no tiene región en
Sudamérica, así que la base va a us-east-1 aunque Supabase ofrezca São Paulo.
*Descartado:* Supabase en São Paulo con la API en Virginia.

**D12 · Conexión por Supavisor en modo sesión.** La conexión directa de Supabase solo funciona por
IPv6, y Render solo sale por IPv4: sin esto, la API no conecta (`ENETUNREACH`). El pooler en modo
sesión usa IPv4 y se comporta como una conexión normal, transacciones incluidas.
*Descartado:* el complemento IPv4 de Supabase, que es de pago.

**D13 · Un monitor externo mantiene despierta la API.** Render gratuito duerme la API tras 15 minutos
sin tráfico y tarda alrededor de un minuto en despertarla: la primera persona de cada sesión de
evaluación esperaría un minuto (indicador 7) o vería un error (indicador 5). Un monitor gratuito
llama a `/salud` cada 10 minutos, y las 750 horas mensuales de Render cubren una instancia encendida
todo el mes, siempre que sea la única gratuita del workspace. Como `/salud` consulta una tabla real,
mantiene activo también el proyecto de Supabase, que se pausa tras 7 días sin actividad. Y su
registro de caídas es evidencia externa de disponibilidad.
*Descartado:* un plan de pago de Render, y «abrir la página un rato antes», que depende de acordarse.

**D14 · Supabase se usa como PostgreSQL y almacén, nada más.** Ni Supabase Auth, ni su API automática,
ni Realtime. Se desactiva la Data API y, por si se reactivara, RLS está activo en cada tabla con
políticas solo para los roles propios de la API (`app_empresa`, `app_plataforma`), de modo que nadie
pueda leerlas por esa vía. De paso, la base es PostgreSQL estándar: cambiar de proveedor es cambiar una
cadena de conexión.

**D15 · Notificaciones dentro del sistema.** Una tabla que la interfaz consulta al navegar y al
volver a la pestaña. El único correo que envía el sistema es el de recuperación de contraseña (D19).
*Descartado:* avisar de las solicitudes por correo (más envíos de los que caben en la capa gratuita y
más datos personales circulando) y las notificaciones push o por websockets, fuera del alcance.

**D16 · En desarrollo y en las pruebas, los archivos van a una carpeta local.** Una segunda
implementación del almacenamiento imita a Supabase: la API firma un enlace con caducidad (HMAC) y una
ruta propia sirve el archivo solo si la firma y el plazo son válidos. Así el sistema completo funciona
en una sola máquina, sin cuentas, y las pruebas suben y descargan archivos de verdad en vez de usar un
doble. En producción el arranque lo impide: el disco de Render se borra en cada reinicio.
*Descartado:* depender de un proyecto de Supabase para desarrollar (lento, con datos compartidos, y
gasta uno de los dos proyectos gratuitos) y un doble en memoria (no habría probado la firma de enlaces).

### Multiempresa (v2)

**D17 · El aislamiento vive en una capa transversal y, debajo, en la propia base.** Los servicios no
reciben el pool, sino un acceso a datos creado por la autenticación (§3.1). Cada transacción adopta
`app_empresa` con la empresa de la identidad, o `app_plataforma` para el Master; RLS filtra todas las
tablas de negocio. Así el aislamiento no depende de que cada consulta se acuerde del `WHERE`: una
consulta que lo olvide sigue sin ver nada ajeno. Los roles se adoptan con `set_config('role', …, true)`
dentro de la transacción, que funciona igual a través de Supavisor (D12) y deja la conexión limpia al
terminar.
*Descartado:* filtrar solo en el código (un olvido es una fuga), una conexión por rol con su propia
contraseña (más secretos y más conexiones, que Supavisor limita) y RLS con las variables de Supabase
Auth (no se usa su Auth, D14).

**D18 · El Master es una excepción explícita, con su propia puerta.** Su acceso se decide en un solo
sitio (`accesoDe`), sus rutas cuelgan de `/plataforma` y su rol de base solo alcanza empresas,
administradores y dos funciones: las cifras por empresa (solo conteos) y revocar las sesiones de una
empresa al desactivarla. Su cuenta es única, la crea un script con datos del entorno y su contraseña
tiene reglas propias (RN22, RN23). Lo que hace con una empresa queda en el historial de esa empresa.
*Descartado:* un Master que «ve todo» (sería el atajo para leer documentos ajenos, y la decisión E lo
excluye) y crearlo desde la interfaz.

**D19 · El correo sale por la API HTTPS de Brevo.** Render gratuito bloquea SMTP, y Brevo permite
enviar 300 correos al día desde un remitente verificado sin dominio propio. Detrás de una interfaz
`Correo`, como el almacenamiento: en desarrollo y en las pruebas los correos se guardan en una carpeta
(el enlace sale por la consola), y en producción el arranque exige Brevo.
*Descartado:* Resend (exige un dominio propio para escribir a terceros), SMTP de Gmail (bloqueado en
Render y frágil) y Supabase Auth solo para el correo (obligaría a duplicar las cuentas).

**D20 · Recuperación de contraseña con un enlace de un solo uso.** Un token aleatorio de 256 bits que
viaja en el fragmento del enlace (`/restablecer-clave#…`), que el navegador no envía a ningún servidor;
en la base solo queda su huella SHA-256, con 60 minutos de vigencia contados por el reloj de la base.
Gastarlo es una sola sentencia (dos peticiones a la vez no lo usan dos veces), pedir otro anula el
anterior, y definir la contraseña cierra todas las sesiones. La respuesta a la petición es la misma
exista o no el correo, y el correo se envía sin esperarlo para que tampoco el tiempo lo delate.
*Descartado:* códigos de 6 dígitos (adivinables con pocos intentos) y guardar el token en claro.

## 8. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | La API está dormida cuando empieza una sesión de evaluación: alrededor de un minuto de espera | Monitor cada 10 minutos (D13). Plan B: abrir `/salud` dos minutos antes |
| R2 | Supabase pausa el proyecto tras 7 días sin actividad, por ejemplo entre la preprueba y la posprueba, o antes de sustentar | `/salud` consulta una tabla real. Si aun así se pausa, se restaura desde el panel sin perder datos; revisarlo la semana previa a cada hito |
| R3 | El plan gratuito de Supabase no tiene copias de seguridad, y el historial es la evidencia del capítulo 3 | Exportar el historial y los tiempos de respuesta al cerrar cada sesión de evaluación, y guardarlos fuera de Supabase |
| R4 | Los problemas de infraestructura aparecen en la Fase 7, sin margen | Desplegar desde la Fase 1 |
| R5 | Agotar una cuota: 1 GB de archivos y 5 GB de salida en Supabase, 5 GB de salida en Render | Tope de 10 MB por archivo, y los archivos no salen por Render. Con cinco usuarios el margen es amplio; revisar el panel de uso cada semana durante la evaluación |
| R6 | Un proveedor cambia su capa gratuita, como hizo Render el 1 de agosto de 2026 al bajar la salida incluida de 100 GB a 5 GB | PostgreSQL estándar y almacenamiento detrás de una interfaz: cada pieza tiene alternativa sin reescribir la lógica |
| R7 | Vercel Hobby es solo para uso no comercial | La tesis lo es. Si una MYPE lo adoptara después, el frontend es estático y se mueve a otro hosting sin cambios |

## 9. Encaje con Cloud Computing

Para el marco teórico: las cinco características esenciales de la definición del NIST (SP 800-145) y
dónde se ven en el sistema.

| Característica | En este sistema |
|---|---|
| Autoservicio bajo demanda | El Master da de alta una empresa en un minuto, y desde ese momento su administrador gestiona a su equipo sin intervención de nadie |
| Amplio acceso por red | Un navegador en PC o celular, desde cualquier lugar (indicador 5) |
| Agrupación de recursos | Varias empresas comparten la misma infraestructura y la misma base, aisladas lógicamente por la capa de acceso y RLS (D17) |
| Elasticidad rápida | La API no guarda estado en memoria (salvo el limitador de intentos), así que en un plan de pago podría replicarse. En el gratuito no se usa, y conviene decirlo así |
| Servicio medido | El propio sistema mide su uso (historial, tiempos de respuesta) y los proveedores miden el consumo de cada recurso |

Modelo de servicio: el sistema se ofrece como **SaaS** a las MYPEs y está construido sobre **PaaS**
(Render, Vercel) y sobre servicios gestionados de base de datos y almacenamiento (Supabase). Modelo de
despliegue: nube pública.
