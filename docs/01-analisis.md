# 01 · Análisis

## 1. El problema

En una MYPE de Lima los documentos —comprobantes, contratos, cotizaciones, documentos del
personal— están repartidos entre archivadores, carpetas de una PC, el correo y WhatsApp. De ahí
salen los síntomas que la tesis mide:

| Síntoma | Indicador |
|---|---|
| Ordenar y clasificar documentos lleva tiempo y depende de quién lo haga | 1 · Tiempo de organización y categorización |
| Encontrar un documento concreto lleva tiempo | 2 · Tiempo de búsqueda |
| Hay documentos que, cuando se necesitan, no aparecen | 3 · Tasa de recuperación |
| No queda constancia de quién hizo qué ni cuándo | 4 · Acciones registradas en el historial |
| Los documentos solo están donde está la PC o el archivador | 5 · Accesibilidad remota |
| Todos ven todo, o nadie sabe quién puede hacer qué | 6 · Accesos correctos según rol |
| La herramienta hace esperar | 7 · Tiempo de respuesta |

**La solución:** una plataforma documental en la nube que sirve a varias empresas a la vez, cada una
aislada de las demás, con categorías propias, búsqueda, acceso desde cualquier dispositivo, permisos por rol, aprobación de un nivel y un
historial que registra cada acción. Lo que queda fuera del alcance está en el `CLAUDE.md`.

## 2. Actores

| Actor | Qué hace |
|---|---|
| Visitante | Inicia sesión o pide recuperar su contraseña. No hay registro público (decisión B) |
| Usuario | Sube, clasifica, busca, ve y descarga los documentos de su empresa; pide la aprobación de los suyos |
| Administrador de Empresa | Lo mismo que el usuario, y además gestiona los usuarios y las categorías de su empresa, resuelve solicitudes y consulta su historial |
| Administrador Master | Administra la plataforma: da de alta empresas con su primer administrador, las edita, las desactiva y ve sus cifras. No pertenece a ninguna empresa y no ve el contenido de ninguna (decisión E). Es una cuenta única, creada por un script |

El investigador no es un rol del sistema: obtiene los datos exportando el historial con la cuenta de
administrador de cada empresa evaluada, y con consultas de solo lectura a la base.

## 3. Requisitos funcionales

La columna «Fase» indica cuándo se construyó en la API; las pantallas llegan en la Fase 6. «v2» marca lo que
añadió la migración a multiempresa ([06-migracion-v2.md](06-migracion-v2.md)); «A» lo que se añadió tras la
auditoría técnica de octubre de 2026 (permisos finos, recuperación y supervisión, D22–D26); «B», lo que se añadió tras
la segunda auditoría: hacer visible la trazabilidad (D27), adaptar la interfaz a cada empresa y a cada persona (D28),
ver el archivo en la ficha (D29) y guardar sus versiones (D30).

| ID | Requisito | Quién | Fase |
|---|---|---|---|
| RF01 | Dar de alta una empresa junto con su primer administrador | Master | v2 |
| RF02 | Iniciar sesión con correo y contraseña | Visitante | 2 |
| RF03 | Cerrar sesión, revocándola en el servidor | Todos | 2 |
| RF04 | Cambiar la propia contraseña | Todos | 2 |
| RF05 | Registrar automáticamente cada acción auditable (§7) | Sistema | 2 en adelante |
| RF06 | Crear, listar, editar y desactivar categorías | Administrador | 3 |
| RF07 | Subir un documento con nombre, categoría, fecha y una descripción opcional | Todos | 3 |
| RF08 | Editar los datos y la categoría de un documento | Quien lo subió, administrador | 3 |
| RF09 | Eliminar un documento (eliminación lógica) | Quien lo subió, administrador | 3 |
| RF10 | Buscar documentos por nombre —sin distinguir mayúsculas ni tildes—, categoría y rango de fechas, con paginación | Todos | 3 |
| RF11 | Ver un documento en el navegador o descargarlo | Todos | 3 |
| RF12 | Registrar el tiempo de respuesta del listado de documentos, medido en el servidor y en el navegador | Sistema | 3 y 6 |
| RF13 | Crear, listar y editar usuarios (nombre, rol, contraseña) | Administrador | 4 |
| RF14 | Desactivar y reactivar usuarios | Administrador | 4 |
| RF15 | Solicitar la aprobación de un documento propio | Todos | 4 |
| RF16 | Aprobar o rechazar una solicitud, con comentario | Administrador | 4 |
| RF17 | Notificar dentro del sistema: a los administradores cuando se crea una solicitud y al solicitante cuando se resuelve | Sistema | 4 |
| RF18 | Consultar las notificaciones y marcarlas como leídas | Todos | 4 |
| RF19 | Consultar el historial filtrando por usuario, acción, entidad y fechas | Administrador | 4 |
| RF20 | Exportar el historial a CSV | Administrador | 4 |
| RF21 | Recuperar la contraseña con un enlace de un solo uso enviado al correo | Visitante | v2 |
| RF22 | Listar, editar, desactivar y reactivar empresas | Master | v2 |
| RF23 | Añadir, editar, desactivar y reactivar a los administradores de una empresa | Master | v2 |
| RF24 | Consultar las cifras de la plataforma y de cada empresa: usuarios, documentos, almacenamiento y último acceso; y, de la plataforma, el espacio de archivos frente al límite gratuito y el último respaldo | Master | v2 y B |
| RF25 | Restringir una categoría, y sus documentos, a personas concretas de la empresa | Administrador | A |
| RF26 | Restaurar lo eliminado desde la papelera durante 30 días, o eliminarlo para siempre | Administrador | A |
| RF27 | Auditar la plataforma: las acciones del Master y los accesos que no son de ninguna empresa | Master | A |
| RF28 | Ver el tablero de la empresa: su estado, el flujo de aprobación, las últimas acciones y lo que el sistema registra de cada indicador en un periodo | Administrador | A y B |
| RF29 | Respaldar la base cada noche y a petición, y restaurarla en una base vacía | Sistema, Master | A |
| RF30 | Ver en la ficha de un documento su actividad: su ciclo de vida para todos y, para el administrador, también quién lo vio y lo descargó | Todos | B |
| RF31 | Dar a la empresa una identidad visual (nombre comercial, color principal y logo) que ven todas sus personas | Administrador, Master | B |
| RF32 | Elegir el tema de la interfaz (el del dispositivo, claro u oscuro) y que se guarde en la cuenta | Todos | B |
| RF33 | Ver una vista previa del PDF o la imagen dentro de la ficha del documento, sin abrir otra pestaña | Administrador, Usuario | B |
| RF34 | Subir una versión nueva de un documento sin perder las anteriores, verlas y descargarlas, y restaurar una anterior como versión nueva | Administrador, Usuario (de los suyos) | B |

## 4. Requisitos no funcionales

| ID | Atributo | Requisito | Cómo se cumple |
|---|---|---|---|
| RNF01 | Accesibilidad | Usable desde un celular (desde 360 px de ancho) sin instalar nada | SPA responsive; sin cookies de terceros (D5) |
| RNF02 | Seguridad | Contraseñas nunca en claro, sesiones revocables, toda entrada validada en el backend | [Arquitectura §6](02-arquitectura.md) |
| RNF03 | Aislamiento | Nadie lee, modifica ni descarga datos de otra empresa | Capa de acceso transversal, RLS en la base (D17) y claves foráneas compuestas (M2); batería A contra B |
| RNF04 | Trazabilidad | Ninguna acción auditable sin registro, e historial inalterable | Misma transacción (D7) y trigger (M4) |
| RNF05 | Rendimiento | Listado de documentos en menos de 1 s, percibido por el usuario, con la API activa | API y base en la misma región (D11), paginación e índices |
| RNF06 | Disponibilidad | La API no se duerme durante la evaluación, y una base perdida se puede reconstruir | Monitor en Supabase (D13); respaldo nocturno con restauración probada (D25) |
| RNF07 | Costo | Cero: solo capas gratuitas | Ninguna tarjeta registrada: al superar un límite, el servicio se restringe en vez de cobrar |
| RNF08 | Portabilidad | Cambiar de proveedor no toca la lógica de negocio | PostgreSQL estándar; almacenamiento detrás de una interfaz |
| RNF09 | Mantenibilidad | Código tipado, modular y con pruebas de reglas y permisos | TypeScript y módulos por funcionalidad (E2, E3) |
| RNF10 | Privacidad | Guardar el mínimo de datos personales (Ley 29733) | Sin IP en el historial (M9) |
| RNF11 | Legibilidad | Texto legible en claro y en oscuro, con cualquier color de empresa (WCAG 2.1 AA, 4,5:1) | La API rechaza los colores sin contraste con el blanco y la interfaz deriva de él los demás tonos (D28) |

## 5. Reglas de negocio

**Empresas y usuarios**

- **RN01** Todo dato de negocio pertenece a una empresa, y cada usuario solo ve y modifica los de la
  suya. La empresa sale de la identidad de la sesión, nunca de lo que envía el navegador: un
  `empresaId` en la URL o en el cuerpo se ignora.
- **RN02** El correo es único en todo el sistema y se guarda en minúsculas: así el inicio de sesión
  no necesita elegir empresa. El DNI es un dato del perfil, opcional, y nunca sirve para entrar.
- **RN03** Un administrador no puede cambiar su propio rol ni desactivarse. Consecuencia: la
  empresa nunca se queda sin administrador activo por obra suya, porque quitar a uno exige que actúe
  otro (o el Master).
- **RN04** Desactivar a un usuario revoca sus sesiones al instante y le impide volver a entrar. Sus
  documentos y su historial se conservan.
- **RN05** Un cambio de rol vale desde la petición siguiente: el rol se lee de la base de datos en
  cada petición. El token también lo lleva, pero manda la base.
- **RN06** Cambiar la propia contraseña cierra las demás sesiones del usuario. Si es un administrador
  (o el Master) quien la restablece, o se define con un enlace de recuperación, se cierran todas: la
  anterior ya no es de fiar.
- **RN07** Al dar de alta una empresa se crean cinco categorías iniciales, que su administrador
  puede renombrar o desactivar: Facturas y boletas, Contratos, Cotizaciones, Recursos humanos y Otros.
- **RN08** El nombre de una categoría es único en su empresa, sin distinguir mayúsculas. Las
  categorías no se borran, se desactivan: una inactiva no se ofrece para documentos nuevos, y los que
  ya la tienen la conservan.

**Documentos**

- **RN09** Se admiten PDF, JPG, PNG, DOC, DOCX, XLS y XLSX de hasta 10 MB. El nombre con el que se
  guarda el archivo lo genera el servidor.
- **RN10** Solo quien subió un documento, o un administrador, puede editarlo o eliminarlo. La
  eliminación es lógica: el documento deja de aparecer en las búsquedas y pasa a la papelera (RN28),
  con quién lo eliminó.
- **RN11** No se puede eliminar un documento con una solicitud pendiente.

**Aprobación**

- **RN12** Solo quien subió un documento puede pedir su aprobación, y solo puede haber una solicitud
  pendiente por documento.
- **RN13** La resuelve un administrador distinto del solicitante: nadie aprueba lo suyo. Si el
  solicitante es el único administrador activo, la solicitud no se crea y se le explica por qué.
- **RN14** Rechazar exige un motivo; aprobar admite un comentario opcional. Una solicitud resuelta ya
  no cambia; tras un rechazo, el propietario puede pedir otra.
- **RN15** Crear una solicitud notifica a todos los administradores activos salvo al solicitante;
  resolverla notifica al solicitante.

**Trazabilidad y seguridad**

- **RN16** Toda acción auditable (§7) se registra en la misma transacción que la ejecuta. Si el
  registro falla, la acción no se ejecuta. En particular, no se entrega un enlace de descarga sin
  haber registrado antes la descarga.
- **RN17** El historial solo admite inserciones: nadie, tampoco un administrador, puede editarlo ni
  borrarlo.
- **RN18** Los enlaces para ver o descargar un archivo caducan a los 5 minutos y solo los genera la
  API, después de autorizar y registrar.
- **RN19** Las contraseñas tienen al menos 8 caracteres y como máximo 72 bytes (el límite de bcrypt:
  se valida, no se recorta), sin reglas de composición obligatorias. Una sesión dura 8 horas.
- **RN20** Diez inicios de sesión **fallidos** desde la misma IP en 15 minutos bloquean nuevos intentos
  hasta que pase la ventana; los correctos no cuentan, porque en una MYPE toda la oficina sale a
  internet con la misma IP y cinco personas entrando a la vez no deben bloquearse entre sí. Pedir
  enlaces de recuperación admite diez por hora y por IP: cada uno puede ser un correo.

**Plataforma (v2)**

- **RN21** No hay registro público: las empresas las da de alta el Master, siempre con su primer
  administrador. El RUC, si se indica, es único en la plataforma.
- **RN22** Hay un único Master. Se crea con un script que lee sus datos del entorno y no hace nada si
  ya existe; la base rechaza un segundo. Ninguna pantalla ni endpoint crea un Master.
- **RN23** La contraseña del Master tiene al menos 12 caracteres y no puede ser una secuencia de
  números ni contener su DNI ni su correo. Se comprueba al crearla, al cambiarla y al restablecerla.
- **RN24** Desactivar una empresa cierra al instante las sesiones de todos sus usuarios y les impide
  entrar hasta que se reactive. Sus datos se conservan intactos.
- **RN25** El Master ve empresas, sus administradores y cifras, nunca el contenido: ni documentos, ni
  archivos, ni solicitudes, ni a los usuarios que no son administradores (decisión E). Lo impide la
  API y, debajo, la base.
- **RN26** Recuperar la contraseña: el enlace vale 60 minutos y una sola vez, pedir otro anula el
  anterior, y la respuesta es la misma exista o no el correo. En la base solo se guarda la huella
  (SHA-256) del token.

**Tras la auditoría (A)**

- **RN27** Cinco contraseñas incorrectas para un mismo correo en 15 minutos bloquean ese correo hasta
  que pase la ventana, también con la contraseña correcta. Se cuenta por correo, exista o no la cuenta,
  para que el bloqueo no revele cuáles existen. Un acceso correcto o un restablecimiento por correo
  ponen la cuenta a cero, y los intentos rechazados por el bloqueo no cuentan. Complementa a RN20: el
  freno por IP no detiene a quien prueba contra una cuenta desde varias redes.
- **RN28** Lo eliminado pasa 30 días en la papelera. Un administrador puede restaurarlo tal como estaba
  o eliminarlo para siempre antes; pasado el plazo, el sistema lo purga solo. Purgar borra el archivo
  del almacenamiento y deja la fila como constancia: el historial y las solicitudes la siguen
  nombrando. Lo purgado no se restaura.
- **RN29** Una categoría restringida, y sus documentos, solo la ven los administradores y las personas
  que ellos autoricen, en el listado, la búsqueda, la ficha, el archivo y al subir. La restricción
  manda sobre la autoría: quien subió un documento a una categoría que luego se restringe sin incluirlo
  deja de verlo. Al abrir la categoría se borran sus accesos; si se vuelve a restringir, se empieza de
  cero. Solo se autoriza a personas de la propia empresa.
- **RN30** Cada noche, a las 03:00 de Lima, se guarda un respaldo lógico de la base en un depósito
  privado, y se conservan 30 días. El Master puede pedir uno en el momento y ver cuáles hay, pero no
  descargarlos: contienen los datos de todas las empresas (RN25). Un respaldo solo se restaura en una
  base vacía con las mismas migraciones, y no incluye sesiones ni enlaces de recuperación.

**Tras la segunda auditoría (B)**

- **RN31** La identidad de una empresa es un nombre comercial (de 2 a 60 caracteres), un color principal
  y un logo; cualquiera de los tres puede faltar, y entonces valen la razón social, el color y el icono de
  la plataforma. La cambian su administrador y el Master, y la ven todas sus personas. El color solo se
  acepta si el texto blanco encima se lee (contraste de 4,5:1, WCAG 2.1 AA). El logo es PNG o JPG de hasta
  256 KB, se guarda en el almacenamiento privado, en la carpeta de la empresa, y se entrega con un enlace
  firmado que dura lo que la sesión. La razón social no cambia con ella: es un dato legal que cambia el Master.
- **RN33** Un documento guarda todas sus versiones; ninguna se borra ni se modifica. La vigente es la
  que se ve, se busca y se descarga; las anteriores se ven y descargan desde la ficha, y verlas o
  descargarlas se registra igual. Sube o restaura versiones quien puede editarlo (RN10), nunca con una
  solicitud de aprobación pendiente. Restaurar copia una versión anterior como la siguiente (v4 = copia
  de la v2): la historia no retrocede. La aprobación es de una versión: con una nueva, la ficha dice en
  cuál se aprobó y que la vigente no se ha revisado. Purgar un documento borra el archivo de todas sus
  versiones, y el espacio ocupado las cuenta todas.
- **RN32** Cada persona elige su tema: el del dispositivo (por defecto), claro u oscuro. Se guarda en su
  cuenta, así que la sigue a cualquier dispositivo, y no se registra en el historial: es una preferencia
  de presentación, no una acción sobre los datos.

## 6. Matriz de permisos

El visitante solo puede iniciar sesión y pedir la recuperación de su contraseña.

| Acción | Usuario | Administrador de Empresa | Master |
|---|:-:|:-:|:-:|
| Listar, buscar, ver y descargar documentos de su empresa | ✔ | ✔ | ✘ |
| Subir documentos | ✔ | ✔ | ✘ |
| Editar o eliminar un documento | solo los suyos | todos los de su empresa | ✘ |
| Subir o restaurar versiones de un documento | solo de los suyos | de todos los de su empresa | ✘ |
| Ver los documentos de una categoría restringida | si está autorizado | ✔ | ✘ |
| Restringir una categoría y elegir quién la ve | ✘ | ✔ | ✘ |
| Ver la papelera, restaurar y eliminar para siempre | ✘ | ✔ | ✘ |
| Ver el tablero de su empresa | ✘ | ✔ | ✘ |
| Ver la actividad de un documento: subidas, ediciones, eliminaciones y aprobaciones | ✔ | ✔ | ✘ |
| …y además quién lo vio, quién lo descargó y quién intentó lo que no podía | ✘ | ✔ | ✘ |
| Solicitar aprobación | de los suyos | de los suyos | ✘ |
| Consultar solicitudes | las suyas | todas las de su empresa | ✘ |
| Aprobar o rechazar | ✘ | todas menos las suyas | ✘ |
| Consultar sus notificaciones | ✔ | ✔ | ✘ |
| Ver las categorías activas | ✔ | ✔ | ✘ |
| Ver las inactivas, crear y editar categorías | ✘ | ✔ | ✘ |
| Gestionar los usuarios de su empresa | ✘ | ✔ | ✘ |
| Consultar y exportar el historial de su empresa | ✘ | ✔ | ✘ |
| Dar de alta, editar, desactivar y reactivar empresas | ✘ | ✘ | ✔ |
| Gestionar a los administradores de una empresa | ✘ | ✘ | ✔ |
| Ver las cifras de la plataforma y de cada empresa | ✘ | ✘ | ✔ |
| Auditar la plataforma (sus acciones y los accesos sin empresa) | ✘ | ✘ | ✔ |
| Ver los respaldos y pedir uno (no descargarlos) | ✘ | ✘ | ✔ |
| Cambiar la identidad visual (nombre comercial, color y logo) | ✘ | la de su empresa | la de cualquier empresa |
| Elegir su tema: el del dispositivo, claro u oscuro | ✔ | ✔ | ✔ |
| Cualquier cosa de **otra** empresa | ✘ | ✘ | — |
| Cambiar su contraseña, recuperarla y cerrar sesión | ✔ | ✔ | ✔ |

Esta matriz es la referencia del indicador 6: cada caso de prueba toma de aquí su resultado
esperado, fijado antes de evaluar. Un recurso de otra empresa responde 404, igual que uno que no
existe: un 403 confirmaría que existe. La batería `tests/integracion/aislamiento.test.ts` lo prueba
endpoint por endpoint y deja su informe en [evidencias/](evidencias/aislamiento-entre-empresas.md).

## 7. Acciones auditables

Definen qué cuenta como «acción» en el indicador 4. Cada registro guarda además quién actuó, con qué
rol, en qué empresa, cuándo, con qué navegador y si era un móvil. Lo que hace el Master con una
empresa queda en el historial de esa empresa, con el rol `master` y sin los datos de su cuenta; el
Master lo lee en su auditoría (RF27), junto con lo que no pertenece a ninguna empresa.

| Acción | Se registra cuando… | Entidad | Detalle |
|---|---|---|---|
| `SESION_INICIADA` | un inicio de sesión tiene éxito | sesión | — |
| `SESION_FALLIDA` | un inicio de sesión falla | — | correo intentado y motivo (también empresa desactivada) |
| `SESION_CERRADA` | el usuario cierra sesión | sesión | — |
| `CLAVE_CAMBIADA` | el usuario cambia su contraseña | usuario | sesiones cerradas |
| `RECUPERACION_SOLICITADA` | alguien pide un enlace de recuperación, exista o no la cuenta | usuario, si existe | correo, si se envió y por qué no |
| `CLAVE_RESTABLECIDA` | se define una contraseña nueva con un enlace | usuario | sesiones cerradas |
| `EMPRESA_CREADA` | el Master da de alta una empresa | empresa | nombre y RUC |
| `EMPRESA_EDITADA` | el Master cambia su nombre o RUC, o su administrador o el Master su identidad visual | empresa | antes → después; del logo, si había y si hay, y el nombre del archivo subido |
| `EMPRESA_DESACTIVADA` · `EMPRESA_REACTIVADA` | el Master cambia su estado | empresa | sesiones cerradas |
| `USUARIO_CREADO` | un administrador crea un usuario, el Master un administrador o el script al Master | usuario | nombre, correo y rol |
| `USUARIO_EDITADO` | se cambian nombre, rol, DNI o contraseña | usuario | antes → después; del DNI y la contraseña, solo que cambiaron |
| `USUARIO_DESACTIVADO` · `USUARIO_REACTIVADO` | se cambia el estado de un usuario | usuario | sesiones revocadas |
| `CATEGORIA_CREADA` · `CATEGORIA_EDITADA` | un administrador crea o cambia una categoría | categoría | antes → después; si es restringida, a quién se dio y quitó acceso, por nombre |
| `DOCUMENTO_SUBIDO` | se sube un documento | documento | nombre, categoría, tipo y peso |
| `DOCUMENTO_EDITADO` | se cambian sus datos | documento | antes → después |
| `DOCUMENTO_ELIMINADO` | se elimina (pasa a la papelera) | documento | nombre |
| `DOCUMENTO_RESTAURADO` | un administrador lo saca de la papelera | documento | nombre |
| `DOCUMENTO_PURGADO` | un administrador lo elimina para siempre, o el sistema al vencer los 30 días (sin autor) | documento | nombre; si lo hizo el sistema, motivo y plazo |
| `DOCUMENTO_VISUALIZADO` · `DOCUMENTO_DESCARGADO` | la API entrega un enlace para verlo (también para la vista previa, RF33) o descargarlo | documento | nombre que tenía en ese momento y número de versión |
| `BUSQUEDA_REALIZADA` | se listan documentos con al menos un filtro | — | filtros y número de resultados |
| `SOLICITUD_CREADA` | se pide aprobar un documento | solicitud | documento y comentario |
| `SOLICITUD_APROBADA` · `SOLICITUD_RECHAZADA` | un administrador la resuelve | solicitud | comentario |
| `ACCESO_DENEGADO` | la API responde 403 a alguien con sesión | la del recurso, si la hay | lo que se exigía (un permiso de la §6, o ser el propietario, o no ser el solicitante) y la ruta u operación |
| `HISTORIAL_EXPORTADO` | un administrador exporta el historial | — | filtros y filas exportadas |
| `RESPALDO_GENERADO` | se guarda un respaldo de la base: cada noche (sin autor) o a petición del Master | — | archivo, tamaño y filas por tabla |
| `VERSION_SUBIDA` | se sube una versión nueva de un documento | documento | número, archivo y comentario |
| `VERSION_RESTAURADA` | se restaura una versión anterior como versión nueva | documento | número nuevo y de cuál viene |

Son 32 acciones. El intento rechazado por el bloqueo por cuenta (RN27) es un `SESION_FALLIDA` con
motivo `CUENTA_BLOQUEADA`. **No se registra, a propósito:** abrir el listado sin filtros (es navegar, no
buscar; su tiempo de respuesta sí se mide), ver la ficha de un documento (no entrega el archivo),
leer notificaciones (no cambia nada), consultar la actividad de un documento (es parte de su ficha), cambiar el tema
(es una preferencia de presentación, RN32), las peticiones con datos inválidos (400) o sin sesión (401)
—no hubo acción, o no hay autor—, las frenadas por el límite de intentos por IP (429) y los 404 por un
recurso de otra empresa (para quien pregunta, ese recurso no existe).

## 8. De dónde sale cada indicador

| # | Indicador | Lo que registra el sistema | Cálculo | Lo que el sistema no puede saber |
|---|---|---|---|---|
| 1 | Tiempo de organización y categorización | `DOCUMENTO_SUBIDO` y `DOCUMENTO_EDITADO`, con su instante | Tiempo entre la primera y la última acción de la tarea, por usuario | Cuándo empezó la tarea: la persona lee la consigna antes de tocar nada. El cronómetro sigue siendo la fuente principal; el sistema lo corrobora |
| 2 | Tiempo de búsqueda | Cada consulta del listado, con o sin filtros (usuario e instante en `tiempos_respuesta`; los filtros, en `BUSQUEDA_REALIZADA`), y la obtención del documento (`DOCUMENTO_VISUALIZADO` o `DOCUMENTO_DESCARGADO`) | Tiempo entre la primera consulta del listado y la obtención del documento pedido. Cuenta también a quien lo encuentra recorriendo el listado sin filtrar | Lo mismo que en el 1 |
| 3 | Tasa de recuperación | `DOCUMENTO_VISUALIZADO` y `DOCUMENTO_DESCARGADO` | Documentos pedidos que se obtuvieron ÷ documentos pedidos | Qué documentos se pidieron: lo fija el protocolo de prueba |
| 4 | Acciones registradas en el historial | Las 30 acciones de §7 | Acciones en el historial ÷ acciones ejecutadas | El denominador: sale del guion de acciones que el evaluador hace ejecutar |
| 5 | Accesibilidad remota | `SESION_INICIADA` y `SESION_FALLIDA`, con `es_movil` | Inicios de sesión exitosos desde móvil ÷ intentos desde móvil | Los intentos que nunca llegan al servidor (sin cobertura, servicio caído): los anota el evaluador |
| 6 | Accesos correctos según rol | `ACCESO_DENEGADO` y las acciones permitidas, cada una con el rol de quien actuó; el informe de aislamiento entre empresas (`npm run informe:aislamiento`) | Decisiones que coinciden con la matriz de §6 ÷ casos evaluados | Qué debía ocurrir en cada caso: lo dice la matriz, no el sistema |
| 7 | Tiempo de respuesta | Tabla `tiempos_respuesta`: duración en el servidor y la percibida en el navegador | Mediana y percentil 95 del listado de documentos | — |

Sobre el indicador 4: por diseño (RN16) debería dar 100 %. Medirlo no es redundante: comprueba que la
garantía se cumple en uso real, y se compara con la preprueba, donde registrar depende de las personas.
