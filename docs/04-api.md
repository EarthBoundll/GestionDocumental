# 04 · API REST

## 1. Convenciones

- **Base:** `https://<servicio>.onrender.com/api/v1` en producción y `http://localhost:4000/api/v1`
  en desarrollo.
- **Formato:** JSON en UTF-8, salvo la subida de documentos (`multipart/form-data`) y la exportación
  del historial (`text/csv`).
- **Nombres:** rutas en español, en plural y en minúsculas (`/tiempos-respuesta`); campos JSON en
  `camelCase` (`fechaDocumento`). La base usa `snake_case` y el repositorio traduce.
- **Autenticación:** `Authorization: Bearer <token>` en todas las rutas salvo `/salud`, `/auth/login`
  y las dos de recuperación de contraseña. No hay registro público.
- **Empresa:** nunca se envía; la API usa la de la identidad de la sesión, y un `empresaId` en la URL
  o en el cuerpo se ignora. Un recurso de otra empresa responde 404, igual que uno inexistente, para no
  revelar que existe.
- **Dos puertas:** las rutas de empresa (documentos, categorías, usuarios, solicitudes, notificaciones,
  historial, tiempos) solo admiten a Administradores y Usuarios; las de `/plataforma`, solo al Master.
  Al otro lado, 403 registrado.
- **Fechas:** la fecha de un documento va como `AAAA-MM-DD`; los instantes, en ISO 8601 y UTC
  (`2026-10-02T14:35:16Z`). La interfaz los muestra en hora de Lima.
- **Paginación:** `?pagina=1&porPagina=20`, con un máximo de 100 por página. Respuesta:

  ```json
  { "datos": [], "paginacion": { "pagina": 1, "porPagina": 20, "total": 57 } }
  ```

- **Token:** JWT HS256 con `sub` (id del usuario), `jti` (id de la sesión), `empresa_id` (nulo para el
  Master), `rol`, `iat` y `exp`. La API los contrasta con la base en cada petición: manda el rol de la
  base, y si la empresa no coincide el token se rechaza (D4).

## 2. Errores

Todas las respuestas de error tienen la misma forma:

```json
{
  "error": {
    "codigo": "VALIDACION",
    "mensaje": "Revisa los datos del documento",
    "detalles": [{ "campo": "fechaDocumento", "mensaje": "Usa el formato AAAA-MM-DD" }]
  }
}
```

| HTTP | Código | Cuándo |
|---|---|---|
| 400 | `VALIDACION` | Entrada inválida; `detalles` dice qué campo y por qué |
| 401 | `NO_AUTENTICADO` | Falta el token, es inválido, caducó o su sesión fue revocada |
| 401 | `CREDENCIALES_INVALIDAS` | Correo o contraseña incorrectos, con el mismo mensaje en ambos casos |
| 429 | `CUENTA_BLOQUEADA` | Cinco contraseñas incorrectas para ese correo en 15 minutos, exista o no la cuenta (RN27); se registra `SESION_FALLIDA` con motivo `CUENTA_BLOQUEADA` |
| 403 | `SIN_PERMISO` | El rol o la propiedad no lo permiten; se registra `ACCESO_DENEGADO` |
| 400 | `ENLACE_INVALIDO` | El enlace del correo (recuperación, invitación o verificación) no existe, ya se usó, caducó, es de otro propósito o se envió a un correo que ya no es el de la cuenta |
| 403 | `CORREO_SIN_VERIFICAR` | Inicio de sesión con la contraseña correcta de una cuenta que no confirmó su correo; se le envía el enlace si no se le envió hace poco (RN36) |
| 409 | `YA_VERIFICADO` | Se pide reenviar el enlace a una cuenta que ya confirmó su correo |
| 429 | `ENVIO_LIMITADO` | Reenvío antes de 2 minutos del anterior, o el sexto en 24 horas, al mismo correo (RN38); el mensaje dice cuánto esperar |
| 502 | `CORREO_NO_ENVIADO` | El servicio de correo no aceptó el reenvío: se puede volver a intentar |
| 403 | `USUARIO_INACTIVO` | Inicio de sesión de un usuario desactivado, con la contraseña correcta. 409 al reenviarle el enlace |
| 403 | `EMPRESA_INACTIVA` | Inicio de sesión en una empresa desactivada, con la contraseña correcta. 409 al reenviar el enlace a uno de sus administradores |
| 404 | `NO_ENCONTRADO` | No existe, o es de otra empresa: indistinguibles a propósito |
| 409 | `EMAIL_EN_USO` | Ya hay un usuario con ese correo |
| 409 | `RUC_EN_USO` | Ya hay una empresa con ese RUC |
| 409 | `CATEGORIA_DUPLICADA` | Ya hay una categoría con ese nombre en la empresa |
| 409 | `CATEGORIA_INACTIVA` | Se asigna a un documento una categoría desactivada |
| 409 | `OPERACION_SOBRE_SI_MISMO` | Un administrador intenta cambiar su propio rol o desactivarse (RN03) |
| 409 | `SOLICITUD_PENDIENTE` | El documento ya tiene una solicitud pendiente |
| 409 | `SIN_REVISOR` | El solicitante es el único administrador activo (RN13) |
| 409 | `SOLICITUD_RESUELTA` | Otro administrador la resolvió antes |
| 409 | `DOCUMENTO_EN_REVISION` | Se intenta eliminar un documento con una solicitud pendiente (RN11) |
| 413 | `ARCHIVO_DEMASIADO_GRANDE` | El archivo supera los 10 MB |
| 413 | `CUERPO_DEMASIADO_GRANDE` | Un cuerpo JSON supera los 100 kB |
| 415 | `TIPO_NO_PERMITIDO` | El tipo de archivo no está en la lista blanca |
| 429 | `DEMASIADOS_INTENTOS` | Desde la misma IP: diez inicios de sesión fallidos en 15 minutos, diez peticiones de recuperación en una hora o diez confirmaciones, activaciones o verificaciones fallidas en 15 minutos (RN20) |
| 500 | `ERROR_INTERNO` | Cualquier otro fallo; en producción, sin detalles técnicos |
| 503 | `SERVICIO_NO_DISPONIBLE` | `/salud`, cuando la base no responde |

## 3. Endpoints

**Quién:** *Público*, sin sesión · *Sesión*, cualquiera con sesión · *Empresa*, Administrador o Usuario ·
*Admin*, Administrador de Empresa · *Propietario*, quien subió el documento · *Master*, el Administrador Master. **Historial:** la acción que registra
([Análisis §7](01-analisis.md)).

### Sistema

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| GET | `/salud` | Público | — | 200 `{ estado: "ok" }`; 503 si la base no responde | — |

### Autenticación

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| POST | `/auth/login` | Público | `email`, `clave` | 200 `{ token, expiraEn, usuario, empresa }`: el usuario con su `tema`, y la empresa con su `marca` (nombre comercial, colores y enlaces firmados del logo y del fondo); `empresa` es nula para el Master | `SESION_INICIADA` o `SESION_FALLIDA` |
| POST | `/auth/logout` | Sesión | — | 204 | `SESION_CERRADA` |
| GET | `/auth/yo` | Sesión | — | 200 `{ usuario, empresa }`, como el inicio de sesión | — |
| PUT | `/auth/preferencias` | Sesión | `tema`: `sistema`, `claro` u `oscuro` | 200 `{ tema }`; vale en todos sus dispositivos (RN32) | — (no es una acción sobre datos) |
| PUT | `/auth/clave` | Sesión | `claveActual`, `claveNueva` | 204; cierra las demás sesiones. 400 si la actual no coincide o, para el Master, si la nueva no cumple sus reglas (RN23) | `CLAVE_CAMBIADA` |
| POST | `/auth/recuperacion` | Público | `email` | 202 `{ mensaje }`, siempre el mismo exista o no el correo; si existe, envía el enlace, y a una cuenta que aún no aceptó su invitación, la invitación otra vez | `RECUPERACION_SOLICITADA` (y `INVITACION_ENVIADA`) |
| POST | `/auth/recuperacion/confirmar` | Público | `token`, `claveNueva` | 204; cierra todas las sesiones y verifica el correo. 400 `ENLACE_INVALIDO` | `CLAVE_RESTABLECIDA` |
| POST | `/auth/activacion` | Público | `token` (de la invitación), `claveNueva` | 200 `{ email }`; define la primera contraseña y verifica el correo (RN35). 400 `ENLACE_INVALIDO` | `CORREO_VERIFICADO` |
| POST | `/auth/verificacion` | Público | `token` (del enlace de verificación) | 200 `{ email }`; la contraseña no cambia (RN36). 400 `ENLACE_INVALIDO` | `CORREO_VERIFICADO` |

### Plataforma (solo el Master)

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| GET | `/plataforma/metricas` | Master | — | 200 `{ empresas, empresasActivas, usuarios, usuariosActivos, documentos, almacenamientoBytes, ultimoAcceso }` | — |
| GET | `/plataforma/empresas` | Master | — | 200 `{ datos }`: cada empresa con sus `metricas` (solo cifras) | — |
| POST | `/plataforma/empresas` | Master | `empresa { nombre, ruc? }`, `administrador { nombre, email, dni? }`, sin contraseña | 201 `{ empresa, administrador }`, el administrador con `estado: pendiente` e `invitacionEnviada`; crea también las categorías iniciales y le envía su invitación (RN35) | `EMPRESA_CREADA`, `USUARIO_CREADO`, `INVITACION_ENVIADA` |
| GET | `/plataforma/empresas/:id` | Master | — | 200 con la empresa, sus `metricas`, sus `administradores` y su `marca` | — |
| PATCH | `/plataforma/empresas/:id` | Master | `nombre?`, `ruc?` | 200 con la empresa | `EMPRESA_EDITADA` |
| PATCH | `/plataforma/empresas/:id/estado` | Master | `activa` | 200 con la empresa; desactivarla cierra las sesiones de todos sus usuarios | `EMPRESA_DESACTIVADA` o `EMPRESA_REACTIVADA` |
| POST | `/plataforma/empresas/:id/administradores` | Master | `nombre`, `email`, `dni?`, sin contraseña | 201 con el administrador, `estado: pendiente` e `invitacionEnviada` | `USUARIO_CREADO`, `INVITACION_ENVIADA` |
| PATCH | `/plataforma/administradores/:id` | Master | `nombre?`, `email?`, `dni?`, `clave?` | 200; restablecer la clave cierra sus sesiones; cambiar el correo las cierra, lo deja sin verificar, le envía el enlace y avisa al anterior (RN36). 404 si no es un administrador | `USUARIO_EDITADO` (y `VERIFICACION_ENVIADA`) |
| POST | `/plataforma/administradores/:id/invitacion` | Master | — | 200 `{ enviado: true }`: la invitación, o el enlace de verificación si ya tiene contraseña. 409 `YA_VERIFICADO`, `USUARIO_INACTIVO` o `EMPRESA_INACTIVA`; 429 `ENVIO_LIMITADO` | `INVITACION_ENVIADA` o `VERIFICACION_ENVIADA` |
| PATCH | `/plataforma/administradores/:id/estado` | Master | `activo` | 200; desactivar revoca sus sesiones | `USUARIO_DESACTIVADO` o `USUARIO_REACTIVADO` |
| PATCH | `/plataforma/empresas/:id/identidad` | Master | Como `PATCH /empresa/identidad` | 200 con la `marca` | `EMPRESA_EDITADA` |
| PUT | `/plataforma/empresas/:id/identidad/logo` | Master | Como `PUT /empresa/identidad/logo` | 200 con la `marca` | `EMPRESA_EDITADA` |
| DELETE | `/plataforma/empresas/:id/identidad/logo` | Master | — | 200 con la `marca` | `EMPRESA_EDITADA` |
| PUT | `/plataforma/empresas/:id/identidad/fondo` | Master | Como `PUT /empresa/identidad/fondo` | 200 con la `marca` | `EMPRESA_EDITADA` |
| DELETE | `/plataforma/empresas/:id/identidad/fondo` | Master | — | 200 con la `marca` | `EMPRESA_EDITADA` |

| GET | `/plataforma/historial` | Master | `?empresaId`, `accion`, `desde`, `hasta` y paginación | 200 paginado: sus propias acciones —también sobre cada empresa, con `empresa { id, nombre }`— y los asientos sin empresa; nunca la actividad de las personas de una empresa (D24) | — |
| GET | `/plataforma/respaldos` | Master | — | 200 `{ datos: [{ nombre, bytes, creadoEn }], diasDeRetencion }` | — |
| POST | `/plataforma/respaldos` | Master | — | 201 `{ nombre, bytes, filas }`. No hay ruta para descargarlo ni restaurarlo (D25) | `RESPALDO_GENERADO` |

Lo que el Master hace con una empresa queda en el historial de esa empresa, con el rol `master`.

### Usuarios

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| GET | `/usuarios` | Admin | `?q`, `rol`, `activo` y paginación | 200 paginado; cada usuario con su `estado`: `pendiente`, `sin_verificar` o `verificado` (RN37) | — |
| POST | `/usuarios` | Admin | `nombre`, `email`, `dni?`, `rol` (`administrador` o `usuario`; nunca `master`), sin contraseña | 201 con el usuario, `estado: pendiente` e `invitacionEnviada`; si el correo no salió, la cuenta queda creada y se reenvía (RN35) | `USUARIO_CREADO`, `INVITACION_ENVIADA` |
| PATCH | `/usuarios/:id` | Admin | `nombre?`, `dni?`, `rol?`, `clave?` | 200 con el usuario; restablecer la clave cierra sus sesiones | `USUARIO_EDITADO` |
| PATCH | `/usuarios/:id/estado` | Admin | `activo` | 200 con el usuario; desactivar revoca sus sesiones | `USUARIO_DESACTIVADO` o `USUARIO_REACTIVADO` |
| POST | `/usuarios/:id/invitacion` | Admin | — | 200 `{ enviado: true }`: la invitación, o el enlace de verificación si ya tiene contraseña. 409 `YA_VERIFICADO` o `USUARIO_INACTIVO`; 429 `ENVIO_LIMITADO`; 404 si es de otra empresa | `INVITACION_ENVIADA` o `VERIFICACION_ENVIADA` |

### Categorías

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| GET | `/categorias` | Empresa | `?incluirInactivas`, solo para administradores (a los demás, 403) | 200 `{ datos }`: las que quien pregunta puede ver, sin paginar, cada una con `restringida`, `usuariosAutorizados` (llena solo para administradores) y cuántos documentos vigentes la usan | — |
| POST | `/categorias` | Admin | `nombre`, `descripcion?`, `restringida?`, `usuariosAutorizados?` (ids de personas de la empresa) | 201 con la categoría. 400 si alguien no es de la empresa | `CATEGORIA_CREADA` |
| PATCH | `/categorias/:id` | Admin | `nombre?`, `descripcion?`, `activa?`, `restringida?`, `usuariosAutorizados?` (la lista completa) | 200 con la categoría; abrirla borra sus accesos | `CATEGORIA_EDITADA`, con los accesos dados y quitados |

### Documentos

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| GET | `/documentos` | Empresa | `?q`, `categoriaId`, `tipo` (`pdf`, `imagen`, `word` o `excel`), `estado` (`sin_solicitud`, `pendiente`, `aprobada` o `rechazada`, el de la última solicitud), `subidoPor`, `desde`, `hasta`, `fechaDe` (`documento`, por defecto, o `subida`), `orden` (`relevancia`, `recientes`, `fecha` o `nombre`; sin él, relevancia si hay texto) y paginación | 200 paginado, más `aproximada` (true si no hubo exactos y estos se parecen) y `tiempoRespuestaId`; con texto, cada documento dice su `coincidencia` (RN39, D42) | `BUSQUEDA_REALIZADA`, si hay algún filtro |
| GET | `/documentos/sugerencias` | Empresa | `?q`, desde 2 caracteres | 200 `{ datos }`: hasta 5 `{ id, nombre, categoria, coincidencia }`, con la misma consulta y RLS que la búsqueda (RN40) | — (no se registra, D36) |
| POST | `/documentos/busquedas` | Empresa | `q`, `documentoId` | 204: quien eligió una sugerencia. 404 si el documento no es visible para quien la elige | `BUSQUEDA_REALIZADA` con `origen: sugerencia` y el documento |
| GET | `/documentos/exportar` | Admin | Los filtros del listado, sin página ni orden | 200 `text/csv` con BOM (RF35): id, nombre, categoría, fecha, descripción, quién lo subió y cuándo (Lima), tipo, peso, versión vigente, estado de su última solicitud y la versión que revisó; por categoría y fecha. 400 si pasa de 50.000: se pide filtrar | `LISTADO_EXPORTADO` |
| POST | `/documentos` | Empresa | Multipart: `archivo`, `nombre`, `categoriaId`, `fechaDocumento`, `descripcion?` | 201 con el documento | `DOCUMENTO_SUBIDO` |
| GET | `/documentos/:id` | Empresa | — | 200 con el documento, su `ultimaSolicitud` y sus `permisos` | — |
| PATCH | `/documentos/:id` | Propietario o admin | `nombre?`, `categoriaId?`, `fechaDocumento?`, `descripcion?` | 200 con el documento | `DOCUMENTO_EDITADO` |
| DELETE | `/documentos/:id` | Propietario o admin | — | 204 | `DOCUMENTO_ELIMINADO` |
| GET | `/documentos/:id/archivo` | Empresa | `?modo=ver` o `?modo=descargar`; `?version=` para una anterior (RF34) | 200 `{ url, expiraEn }`; 404 si la versión no existe | `DOCUMENTO_VISUALIZADO` o `DOCUMENTO_DESCARGADO`, con el número de versión |
| GET | `/documentos/:id/versiones` | Empresa; solo de un documento que ve | — | 200 `{ datos }`: cada versión con `numero`, `archivo`, `subidaPor`, `comentario`, `restauradaDe`, `creadaEn` y `vigente`, la más reciente primero (RF34) | — |
| POST | `/documentos/:id/versiones` | Propietario o Admin | `multipart/form-data`: `archivo`, `comentario?` (hasta 500) | 201 con el documento, ya con la versión nueva vigente. 409 `DOCUMENTO_EN_REVISION` con una solicitud pendiente | `VERSION_SUBIDA` |
| POST | `/documentos/:id/versiones/:numero/restauracion` | Propietario o Admin | — | 201 con el documento: la versión elegida, copiada como la siguiente. 409 `VERSION_VIGENTE` si ya es la vigente, `DOCUMENTO_EN_REVISION` con una pendiente; 404 si no existe | `VERSION_RESTAURADA` |
| GET | `/documentos/:id/actividad` | Empresa; solo de un documento que ve | Paginación | 200 paginado, lo más reciente primero: los asientos del documento y de sus solicitudes, con `usuario { id, nombre }` (sin correo). Quien puede consultar el historial recibe además vistas, descargas y accesos denegados (RF30, D27). 404 si no lo ve | — |
| GET | `/documentos/papelera` | Admin | Paginación | 200 paginado, más `diasEnPapelera`: cada documento con `eliminadoPor`, `eliminadoEn` y `purgaEn` | — |
| POST | `/documentos/papelera/:id/restauracion` | Admin | — | 200 con el documento, tal como estaba | `DOCUMENTO_RESTAURADO` |
| DELETE | `/documentos/papelera/:id` | Admin | — | 204; borra el archivo y deja la fila como constancia. 404 si no está en la papelera | `DOCUMENTO_PURGADO` |

En una categoría restringida (RN29), para quien no tiene acceso sus documentos no existen: no salen en
el listado ni en la búsqueda, su ficha y su archivo responden 404, y subir a ella responde 400 «la
categoría no existe». Lo decide la base (D22).

### Solicitudes de aprobación

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| POST | `/documentos/:id/solicitudes` | Propietario | `comentario?` | 201 con la solicitud; notifica a los administradores | `SOLICITUD_CREADA` |
| GET | `/solicitudes` | Empresa | `?estado` y paginación | 200 paginado: el administrador ve todas; el usuario, las suyas | — |
| POST | `/solicitudes/:id/resolucion` | Admin que no sea el solicitante | `decision` (`aprobada` o `rechazada`), `comentario` (obligatorio si rechaza) | 200 con la solicitud; notifica al solicitante. 403 registrado si es la propia; 409 si ya estaba resuelta | `SOLICITUD_APROBADA` o `SOLICITUD_RECHAZADA` |

### Notificaciones

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| GET | `/notificaciones` | Empresa | `?soloNoLeidas` y paginación | 200 paginado, más el total `noLeidas` | — |
| PATCH | `/notificaciones/:id/leida` | Destinatario | — | 204 | — |
| PATCH | `/notificaciones/leidas` | Empresa | — | 204; marca todas como leídas | — |

### Historial

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| GET | `/historial` | Admin | `?usuarioId`, `accion`, `entidadTipo`, `entidadId`, `desde`, `hasta` y paginación | 200 paginado | — |
| GET | `/historial/impresion` | Admin | Los mismos filtros | 200 `{ datos, total }`: todas las acciones filtradas, como en el listado, para la hoja imprimible (RF36). 400 si pasan de 2.000: se pide acotar | `HISTORIAL_EXPORTADO` con `formato: impresion` |
| GET | `/historial/exportar` | Admin | Los mismos filtros | 200 `text/csv` en UTF-8 con BOM (Excel lo abre con tildes): id, fecha y hora de Lima, fecha UTC, acción, usuario (las del Master, «Administración de la plataforma»), correo, rol, entidad, móvil, user-agent y detalle en JSON. Las fechas del filtro son días de Lima | `HISTORIAL_EXPORTADO` |

### Tablero

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| GET | `/tablero` | Admin | `?desde`, `hasta` (días de Lima; por defecto, los últimos 30; como mucho 366) | 200 `{ periodo, resumen, indicadores, aprobacion, actividad, recientes }`: el estado de la empresa, lo que registra cada uno de los siete indicadores en el periodo, las solicitudes del periodo y cómo se resolvieron, las acciones por día y las 8 últimas acciones | — |

### Identidad de la empresa

La de la empresa de la sesión (RF31, D28, D39): la empresa sale de la sesión, nunca de la petición. `marca` es
`{ nombreComercial, colorPrimario, colorFondo, logoUrl, fondoUrl }`; cada campo es nulo si la empresa no lo
eligió, y `logoUrl` y `fondoUrl` son enlaces firmados que duran lo que la sesión.

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| GET | `/empresa/identidad` | Empresa | — | 200 con la `marca` | — |
| PATCH | `/empresa/identidad` | Admin | `nombreComercial?` (2 a 60 caracteres), `colorPrimario?`, `colorFondo?` (`#rrggbb`); vacío lo quita; al menos uno | 200 con la `marca`. 400 si el color principal no da 4,5:1 con el texto blanco; el de fondo no se valida, solo cuenta su tono | `EMPRESA_EDITADA` con el antes y el después |
| PUT | `/empresa/identidad/logo` | Admin | `multipart/form-data` con `archivo`: PNG o JPG, por su contenido | 200 con la `marca`; reemplaza al anterior y lo borra. 415 si no es PNG ni JPG, 413 si supera 256 KB | `EMPRESA_EDITADA` (`logo` y el nombre del archivo) |
| DELETE | `/empresa/identidad/logo` | Admin | — | 200 con la `marca` | `EMPRESA_EDITADA` |
| PUT | `/empresa/identidad/fondo` | Admin | `multipart/form-data` con `archivo`: WebP o JPG, por su contenido; el navegador ya lo redujo y comprimió | 200 con la `marca`; reemplaza al anterior y lo borra. 415 si no es WebP ni JPG, 413 si supera 512 KB | `EMPRESA_EDITADA` (`fondo` y el nombre del archivo) |
| DELETE | `/empresa/identidad/fondo` | Admin | — | 200 con la `marca` | `EMPRESA_EDITADA` |

### Tiempos de respuesta

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| PATCH | `/tiempos-respuesta/:id` | Empresa; solo el suyo, y una vez | `duracionClienteMs` | 204 | — |

En total: los 28 de la v1 menos el registro público, más dos de recuperación y nueve de la
plataforma, los siete que añadió la auditoría (papelera, tablero, auditoría y respaldos del Master) y, de la
segunda, la actividad de un documento, las preferencias de cada persona, once de identidad (seis de la
empresa y cinco del Master, cuatro de ellos del fondo), tres de versiones y dos de evidencia (el listado documental y el historial para
imprimir); los cuatro de la verificación del correo (activar, verificar y reenviar, desde la empresa y desde la
plataforma) y los dos del buscador (sugerencias y sugerencia elegida). Son 69.

## 4. Respuestas de ejemplo

**Inicio de sesión** (`POST /auth/login`):

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
  "expiraEn": "2026-10-02T22:35:16Z",
  "usuario": { "id": "8f3c…", "nombre": "Ana Torres", "email": "ana@ejemplo.pe", "rol": "usuario", "dni": null, "tema": "sistema" },
  "empresa": {
    "id": "1b7e…",
    "nombre": "Distribuidora Ejemplo SAC",
    "marca": {
      "nombreComercial": "Distribuidora Ejemplo", "colorPrimario": "#1d4ed8", "colorFondo": "#c8a165",
      "logoUrl": "https://…supabase.co/storage/v1/object/sign/documentos/1b7e…/…png?token=…", "fondoUrl": null
    }
  }
}
```

**Una empresa vista por el Master** (`GET /plataforma/empresas`, cada elemento de `datos`): cifras, nunca
contenido.

```json
{
  "id": "1b7e…",
  "nombre": "Distribuidora Ejemplo SAC",
  "ruc": "20123456789",
  "activa": true,
  "creadoEn": "2026-10-01T15:00:00Z",
  "metricas": { "usuarios": 5, "usuariosActivos": 5, "documentos": 42, "almacenamientoBytes": 18874368, "ultimoAcceso": "2026-10-02T14:35:16Z" }
}
```

**Detalle de un documento** (`GET /documentos/:id`). En este caso `eliminar` es falso porque tiene una
solicitud pendiente (RN11):

```json
{
  "id": "c41d…",
  "nombre": "Contrato de alquiler del local",
  "descripcion": null,
  "fechaDocumento": "2026-09-15",
  "categoria": { "id": "a9e2…", "nombre": "Contratos" },
  "subidoPor": { "id": "8f3c…", "nombre": "Ana Torres" },
  "archivo": { "nombreOriginal": "contrato-local.pdf", "tipoMime": "application/pdf", "pesoBytes": 482133 },
  "creadoEn": "2026-10-02T14:35:16Z",
  "ultimaSolicitud": {
    "id": "5d0a…",
    "estado": "pendiente",
    "creadaEn": "2026-10-02T15:02:40Z",
    "comentarioSolicitud": "Para la firma del gerente",
    "comentarioResolucion": null
  },
  "permisos": { "editar": true, "eliminar": false, "solicitarAprobacion": false, "resolverSolicitud": false }
}
```

**Listado** (`GET /documentos`):

```json
{
  "datos": [
    {
      "id": "c41d…",
      "nombre": "Contrato de alquiler del local",
      "fechaDocumento": "2026-09-15",
      "categoria": { "id": "a9e2…", "nombre": "Contratos" },
      "subidoPor": { "id": "8f3c…", "nombre": "Ana Torres" },
      "archivo": { "tipoMime": "application/pdf", "pesoBytes": 482133 },
      "creadoEn": "2026-10-02T14:35:16Z"
    }
  ],
  "paginacion": { "pagina": 1, "porPagina": 20, "total": 1 },
  "tiempoRespuestaId": "e7b2…"
}
```

## 5. Notas para el frontend

- **Abrir un archivo en el iPhone.** Safari bloquea `window.open` si ocurre después de esperar una
  respuesta. La pestaña se abre vacía en el mismo clic, y se le asigna el enlace cuando llega.
- **Medir el listado.** El navegador cuenta desde justo antes de pedir `/documentos` hasta que el
  resultado está en pantalla, y lo envía a `/tiempos-respuesta/{tiempoRespuestaId}`. Si ese envío
  falla, se pierde esa medición y nada más: nunca bloquea la interfaz.
- **401 en cualquier petición:** la sesión ya no vale; se borra el token y se vuelve a `/login`.
- **Los enlaces del correo** llegan como `/restablecer-clave#<token>`, `/activar-cuenta#<token>` o
  `/verificar-correo#<token>`. La página lee el fragmento, lo quita de la barra de direcciones y lo envía en el
  cuerpo de su endpoint. La verificación se confirma con un botón y no al abrir la página: hay filtros de correo
  que abren los enlaces para revisarlos.
- **Sugerencias del buscador (D42).** Se piden tras 300 ms sin teclear y desde 2 letras, y cada tecla cancela la
  petición anterior. El campo es un *combobox*: ↓ y ↑ recorren las sugerencias, Enter abre la marcada (o busca si no hay
  ninguna) y Esc las cierra. Elegir una llama a `POST /documentos/busquedas` antes de abrir la ficha; la búsqueda completa
  sigue corriendo solo al confirmarla (D36).
- **403 `CORREO_SIN_VERIFICAR` al entrar** se muestra como un paso pendiente (aviso, no error): el mensaje dice
  si se acaba de enviar el enlace.
- **El Master** no tiene empresa: su menú es la plataforma y su marco no consulta notificaciones, que
  le responderían 403.
- **403:** se muestra «sin permiso». La API ya lo registró.
- **Tema y color.** La sesión trae el tema de la persona y la marca de su empresa. El frontend pone el
  tema en `<html data-tema>` (resolviendo «sistema» con `prefers-color-scheme` y siguiéndolo si cambia) y
  el color en la variable `--marca`, antes de pintar. Sin sesión, valen el del dispositivo y el de la
  plataforma. Mientras un administrador elige un color, toda la pantalla lo muestra; si sale sin guardar,
  vuelve el guardado.
- **El logo** se muestra sobre blanco también en el modo oscuro, y si su enlace ya no sirve vuelve el
  icono. La CSP de Vercel solo admite imágenes del propio dominio y del de Supabase.
- **El fondo (D39).** El color va en la variable `--fondo`, de la que estilos.css toma el tono para cada
  modo; como con el color principal, mientras se elige toda la pantalla lo muestra. La imagen la pide una
  regla de CSS que solo vale desde 1024 px, con el contenido en un panel opaco; en el celular no se descarga.
  Antes de subirla, el navegador la reduce a 1920 px y la comprime en WebP (o JPG).
- **Vista previa (RF33).** «Vista previa» pide `/documentos/:id/archivo?modo=ver`, como «Ver», y muestra
  el enlace en un `<img>` (PNG, JPG) o en un marco (PDF, solo si `navigator.pdfViewerEnabled`). Abrirlo
  después en otra pestaña reutiliza ese enlace: no es una segunda consulta. La CSP admite marcos solo del
  dominio de Supabase.

## 6. Qué pantalla usa cada endpoint

Comprobación de que el catálogo está completo: cada pantalla tiene lo que necesita, y cada endpoint
lo usa alguien.

| Pantalla | Ruta | Quién | Endpoints |
|---|---|---|---|
| Iniciar sesión | `/login` | Visitante | `POST /auth/login` |
| Recuperar la contraseña | `/recuperar-clave` | Visitante | `POST /auth/recuperacion` |
| Definir una contraseña nueva | `/restablecer-clave` | Quien abre el enlace | `POST /auth/recuperacion/confirmar` |
| Activar la cuenta | `/activar-cuenta` | Quien abre la invitación | `POST /auth/activacion` |
| Confirmar el correo | `/verificar-correo` | Quien abre el enlace | `POST /auth/verificacion` |
| Marco común: barras lateral y superior | — | Todos; las notificaciones, solo Administrador y Usuario | `GET /auth/yo`, `GET /notificaciones`, `POST /auth/logout` |
| Plataforma: cifras y empresas | `/plataforma` | Master | `GET /plataforma/metricas`, `GET /plataforma/empresas`, `GET /plataforma/respaldos` (el último respaldo y lo que ocupan, frente al GB gratuito) |
| Nueva empresa | `/plataforma/empresas/nueva` | Master | `POST /plataforma/empresas` |
| Ficha de una empresa | `/plataforma/empresas/:id` | Master | `GET /plataforma/empresas/:id`, `PATCH /plataforma/empresas/:id`, `PATCH /plataforma/empresas/:id/estado`, `POST /plataforma/empresas/:id/administradores`, `PATCH /plataforma/administradores/:id`, `PATCH /plataforma/administradores/:id/estado`, `POST /plataforma/administradores/:id/invitacion`, `PATCH /plataforma/empresas/:id/identidad`, `PUT` y `DELETE /plataforma/empresas/:id/identidad/logo` y `/fondo` |
| Documentos: listado y búsqueda | `/documentos` | Administrador y Usuario; exportar el listado y elegir a la persona que subió, solo el administrador | `GET /documentos`, `GET /documentos/sugerencias`, `POST /documentos/busquedas`, `GET /categorias`, `PATCH /tiempos-respuesta/:id`, `GET /documentos/exportar`, `GET /usuarios` (para «Subido por») |
| Subir documento | `/documentos/nuevo` | Administrador y Usuario | `GET /categorias`, `POST /documentos` |
| Detalle de documento | `/documentos/:id` | Administrador y Usuario; las acciones, según `permisos` | `GET /documentos/:id`, `GET /documentos/:id/actividad`, `GET /documentos/:id/versiones`, `POST /documentos/:id/versiones`, `POST /documentos/:id/versiones/:numero/restauracion`, `GET /documentos/:id/archivo`, `PATCH /documentos/:id`, `DELETE /documentos/:id`, `POST /documentos/:id/solicitudes`, `POST /solicitudes/:id/resolucion`, `GET /categorias` |
| Solicitudes | `/solicitudes` | Administrador y Usuario; el administrador ve la bandeja de toda su empresa | `GET /solicitudes` |
| Notificaciones | `/notificaciones` | Administrador y Usuario | `GET /notificaciones`, `PATCH /notificaciones/:id/leida`, `PATCH /notificaciones/leidas` |
| Mi cuenta | `/cuenta` | Todos | `GET /auth/yo`, `PUT /auth/clave`, `PUT /auth/preferencias` |
| Identidad | `/admin/identidad` | Administrador; a los demás la pantalla no se les abre | `GET /empresa/identidad`, `PATCH /empresa/identidad`, `PUT` y `DELETE /empresa/identidad/logo` y `/fondo` |
| Usuarios | `/admin/usuarios` | Administrador; para los demás, 403 registrado | `GET /usuarios`, `POST /usuarios`, `PATCH /usuarios/:id`, `PATCH /usuarios/:id/estado`, `POST /usuarios/:id/invitacion` |
| Categorías | `/admin/categorias` | Administrador | `GET /categorias?incluirInactivas=true`, `POST /categorias`, `PATCH /categorias/:id`, `GET /usuarios` (para elegir quién ve una restringida) |
| Historial | `/admin/historial` | Administrador | `GET /historial`, `GET /historial/exportar`, `GET /usuarios` (para el filtro) |
| Historial para imprimir | `/admin/historial/impresion` | Administrador | `GET /historial/impresion`, `GET /usuarios` (el nombre de la persona filtrada) |
| Tablero | `/admin/tablero` | Administrador | `GET /tablero`, `GET /historial/exportar` (el historial del periodo) |
| Papelera | `/admin/papelera` | Administrador | `GET /documentos/papelera`, `POST /documentos/papelera/:id/restauracion`, `DELETE /documentos/papelera/:id` |
| Auditoría de la plataforma | `/plataforma/auditoria` | Master | `GET /plataforma/historial`, `GET /plataforma/empresas` (para el filtro) |
| Respaldos | `/plataforma/respaldos` | Master | `GET /plataforma/respaldos`, `POST /plataforma/respaldos` |
| — | — | Monitor externo | `GET /salud` |

Desde una solicitud o una notificación se llega al detalle del documento, que muestra la solicitud y,
a quien pueda, los botones para aprobar o rechazar. Por eso no hay pantalla ni endpoint de detalle de
solicitud.
