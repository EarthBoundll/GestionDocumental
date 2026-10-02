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

**La solución:** un repositorio documental en la nube, separado por organización, con categorías
propias, búsqueda, acceso desde cualquier dispositivo, permisos por rol, aprobación de un nivel y un
historial que registra cada acción. Lo que queda fuera del alcance está en el `CLAUDE.md`.

## 2. Actores

| Actor | Qué hace |
|---|---|
| Visitante | Registra una organización o inicia sesión |
| Usuario | Sube, clasifica, busca, ve y descarga documentos; pide la aprobación de los suyos |
| Administrador | Lo mismo que el usuario, y además gestiona usuarios y categorías, resuelve solicitudes y consulta el historial |

El investigador no es un rol del sistema: obtiene los datos exportando el historial con la cuenta de
administrador de cada organización evaluada, y con consultas de solo lectura a la base.

## 3. Requisitos funcionales

La columna «Fase» indica cuándo se construye en la API; las pantallas llegan en la Fase 6.

| ID | Requisito | Quién | Fase |
|---|---|---|---|
| RF01 | Registrar una organización junto con su primer administrador | Visitante | 2 |
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

## 4. Requisitos no funcionales

| ID | Atributo | Requisito | Cómo se cumple |
|---|---|---|---|
| RNF01 | Accesibilidad | Usable desde un celular (desde 360 px de ancho) sin instalar nada | SPA responsive; sin cookies de terceros (D5) |
| RNF02 | Seguridad | Contraseñas nunca en claro, sesiones revocables, toda entrada validada en el backend | [Arquitectura §6](02-arquitectura.md) |
| RNF03 | Aislamiento | Nadie lee ni modifica datos de otra organización | La API y las claves foráneas compuestas (M2) |
| RNF04 | Trazabilidad | Ninguna acción auditable sin registro, e historial inalterable | Misma transacción (D7) y trigger (M4) |
| RNF05 | Rendimiento | Listado de documentos en menos de 1 s, percibido por el usuario, con la API activa | API y base en la misma región (D11), paginación e índices |
| RNF06 | Disponibilidad | La API no se duerme durante la evaluación | Monitor externo (D13) |
| RNF07 | Costo | Cero: solo capas gratuitas | Ninguna tarjeta registrada: al superar un límite, el servicio se restringe en vez de cobrar |
| RNF08 | Portabilidad | Cambiar de proveedor no toca la lógica de negocio | PostgreSQL estándar; almacenamiento detrás de una interfaz |
| RNF09 | Mantenibilidad | Código tipado, modular y con pruebas de reglas y permisos | TypeScript y módulos por funcionalidad (E2, E3) |
| RNF10 | Privacidad | Guardar el mínimo de datos personales (Ley 29733) | Sin IP en el historial (M9) |

## 5. Reglas de negocio

**Organización y usuarios**

- **RN01** Todo dato pertenece a una organización, y cada usuario solo ve y modifica los de la suya.
  La API toma la organización de la sesión, nunca de lo que envía el navegador.
- **RN02** El correo es único en todo el sistema y se guarda en minúsculas: así el inicio de sesión
  no necesita elegir organización.
- **RN03** Un administrador no puede cambiar su propio rol ni desactivarse. Consecuencia: la
  organización nunca se queda sin administrador activo, porque quitar a uno exige que actúe otro.
- **RN04** Desactivar a un usuario revoca sus sesiones al instante y le impide volver a entrar. Sus
  documentos y su historial se conservan.
- **RN05** Un cambio de rol vale desde la petición siguiente: el rol se lee de la base de datos en
  cada petición, no del token.
- **RN06** Cambiar la propia contraseña cierra las demás sesiones del usuario. Si es un administrador
  quien la restablece, se cierran todas: la anterior ya no es de fiar.
- **RN07** Al registrar una organización se crean cinco categorías iniciales, que el administrador
  puede renombrar o desactivar: Facturas y boletas, Contratos, Cotizaciones, Recursos humanos y Otros.
- **RN08** El nombre de una categoría es único en su organización, sin distinguir mayúsculas. Las
  categorías no se borran, se desactivan: una inactiva no se ofrece para documentos nuevos, y los que
  ya la tienen la conservan.

**Documentos**

- **RN09** Se admiten PDF, JPG, PNG, DOC, DOCX, XLS y XLSX de hasta 10 MB. El nombre con el que se
  guarda el archivo lo genera el servidor.
- **RN10** Solo quien subió un documento, o un administrador, puede editarlo o eliminarlo. La
  eliminación es lógica: el documento deja de aparecer en las búsquedas, pero el registro y el
  archivo se conservan.
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
  internet con la misma IP y cinco personas entrando a la vez no deben bloquearse entre sí. El registro
  de organizaciones admite diez por hora y por IP.
- **RN21** El registro público de organizaciones se puede cerrar por configuración, por ejemplo
  durante la evaluación.

## 6. Matriz de permisos

El visitante solo puede registrar una organización e iniciar sesión.

| Acción | Usuario | Administrador |
|---|:-:|:-:|
| Listar, buscar, ver y descargar documentos de su organización | ✔ | ✔ |
| Subir documentos | ✔ | ✔ |
| Editar o eliminar un documento | solo los suyos | todos |
| Solicitar aprobación | de los suyos | de los suyos |
| Consultar solicitudes | las suyas | todas |
| Aprobar o rechazar | ✘ | todas menos las suyas |
| Consultar sus notificaciones | ✔ | ✔ |
| Ver las categorías activas | ✔ | ✔ |
| Ver las inactivas, crear y editar categorías | ✘ | ✔ |
| Gestionar usuarios | ✘ | ✔ |
| Consultar y exportar el historial | ✘ | ✔ |
| Cambiar su contraseña y cerrar sesión | ✔ | ✔ |

Esta matriz es la referencia del indicador 6: cada caso de prueba toma de aquí su resultado
esperado, fijado antes de evaluar.

## 7. Acciones auditables

Definen qué cuenta como «acción» en el indicador 4. Cada registro guarda además quién actuó, con qué
rol, en qué organización, cuándo, con qué navegador y si era un móvil.

| Acción | Se registra cuando… | Entidad | Detalle |
|---|---|---|---|
| `ORGANIZACION_REGISTRADA` | se crea una organización con su administrador | organización | — |
| `SESION_INICIADA` | un inicio de sesión tiene éxito, también justo después de registrarse | sesión | — |
| `SESION_FALLIDA` | un inicio de sesión falla | — | correo intentado y motivo |
| `SESION_CERRADA` | el usuario cierra sesión | sesión | — |
| `CLAVE_CAMBIADA` | el usuario cambia su contraseña | usuario | sesiones cerradas |
| `USUARIO_CREADO` | un administrador crea un usuario | usuario | nombre, correo y rol |
| `USUARIO_EDITADO` | un administrador cambia nombre, rol o contraseña | usuario | antes → después; de la contraseña, solo que se restableció |
| `USUARIO_DESACTIVADO` · `USUARIO_REACTIVADO` | un administrador cambia el estado de un usuario | usuario | sesiones revocadas |
| `CATEGORIA_CREADA` · `CATEGORIA_EDITADA` | un administrador crea o cambia una categoría | categoría | antes → después |
| `DOCUMENTO_SUBIDO` | se sube un documento | documento | nombre, categoría, tipo y peso |
| `DOCUMENTO_EDITADO` | se cambian sus datos | documento | antes → después |
| `DOCUMENTO_ELIMINADO` | se elimina | documento | — |
| `DOCUMENTO_VISUALIZADO` · `DOCUMENTO_DESCARGADO` | la API entrega un enlace para verlo o descargarlo | documento | — |
| `BUSQUEDA_REALIZADA` | se listan documentos con al menos un filtro | — | filtros y número de resultados |
| `SOLICITUD_CREADA` | se pide aprobar un documento | solicitud | documento y comentario |
| `SOLICITUD_APROBADA` · `SOLICITUD_RECHAZADA` | un administrador la resuelve | solicitud | comentario |
| `ACCESO_DENEGADO` | la API responde 403 a un usuario con sesión | la del recurso, si la hay | lo que se exigía (un permiso de la §6, o ser el propietario, o no ser el solicitante) y la ruta u operación |
| `HISTORIAL_EXPORTADO` | un administrador exporta el historial | — | filtros y filas exportadas |

Son 22 acciones. **No se registra, a propósito:** abrir el listado sin filtros (es navegar, no
buscar; su tiempo de respuesta sí se mide), ver la ficha de un documento (no entrega el archivo),
leer notificaciones (no cambia nada), las peticiones con datos inválidos (400) o sin sesión (401)
—no hubo acción, o no hay autor— y las frenadas por el límite de intentos (429).

## 8. De dónde sale cada indicador

| # | Indicador | Lo que registra el sistema | Cálculo | Lo que el sistema no puede saber |
|---|---|---|---|---|
| 1 | Tiempo de organización y categorización | `DOCUMENTO_SUBIDO` y `DOCUMENTO_EDITADO`, con su instante | Tiempo entre la primera y la última acción de la tarea, por usuario | Cuándo empezó la tarea: la persona lee la consigna antes de tocar nada. El cronómetro sigue siendo la fuente principal; el sistema lo corrobora |
| 2 | Tiempo de búsqueda | Cada consulta del listado, con o sin filtros (usuario e instante en `tiempos_respuesta`; los filtros, en `BUSQUEDA_REALIZADA`), y la obtención del documento (`DOCUMENTO_VISUALIZADO` o `DOCUMENTO_DESCARGADO`) | Tiempo entre la primera consulta del listado y la obtención del documento pedido. Cuenta también a quien lo encuentra recorriendo el listado sin filtrar | Lo mismo que en el 1 |
| 3 | Tasa de recuperación | `DOCUMENTO_VISUALIZADO` y `DOCUMENTO_DESCARGADO` | Documentos pedidos que se obtuvieron ÷ documentos pedidos | Qué documentos se pidieron: lo fija el protocolo de prueba |
| 4 | Acciones registradas en el historial | Las 22 acciones de §7 | Acciones en el historial ÷ acciones ejecutadas | El denominador: sale del guion de acciones que el evaluador hace ejecutar |
| 5 | Accesibilidad remota | `SESION_INICIADA` y `SESION_FALLIDA`, con `es_movil` | Inicios de sesión exitosos desde móvil ÷ intentos desde móvil | Los intentos que nunca llegan al servidor (sin cobertura, servicio caído): los anota el evaluador |
| 6 | Accesos correctos según rol | `ACCESO_DENEGADO` y las acciones permitidas, cada una con el rol de quien actuó | Decisiones que coinciden con la matriz de §6 ÷ casos evaluados | Qué debía ocurrir en cada caso: lo dice la matriz, no el sistema |
| 7 | Tiempo de respuesta | Tabla `tiempos_respuesta`: duración en el servidor y la percibida en el navegador | Mediana y percentil 95 del listado de documentos | — |

Sobre el indicador 4: por diseño (RN16) debería dar 100 %. Medirlo no es redundante: comprueba que la
garantía se cumple en uso real, y se compara con la preprueba, donde registrar depende de las personas.
