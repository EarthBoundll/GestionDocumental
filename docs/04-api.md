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
| 403 | `SIN_PERMISO` | El rol o la propiedad no lo permiten; se registra `ACCESO_DENEGADO` |
| 400 | `ENLACE_INVALIDO` | El enlace de recuperación no existe, ya se usó o caducó |
| 403 | `USUARIO_INACTIVO` | Inicio de sesión de un usuario desactivado, con la contraseña correcta |
| 403 | `EMPRESA_INACTIVA` | Inicio de sesión en una empresa desactivada, con la contraseña correcta |
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
| 429 | `DEMASIADOS_INTENTOS` | Desde la misma IP: diez inicios de sesión fallidos en 15 minutos, diez peticiones de recuperación en una hora o diez confirmaciones fallidas en 15 minutos (RN20) |
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
| POST | `/auth/login` | Público | `email`, `clave` | 200 `{ token, expiraEn, usuario, empresa }`; `empresa` es nula para el Master | `SESION_INICIADA` o `SESION_FALLIDA` |
| POST | `/auth/logout` | Sesión | — | 204 | `SESION_CERRADA` |
| GET | `/auth/yo` | Sesión | — | 200 `{ usuario, empresa }` | — |
| PUT | `/auth/clave` | Sesión | `claveActual`, `claveNueva` | 204; cierra las demás sesiones. 400 si la actual no coincide o, para el Master, si la nueva no cumple sus reglas (RN23) | `CLAVE_CAMBIADA` |
| POST | `/auth/recuperacion` | Público | `email` | 202 `{ mensaje }`, siempre el mismo exista o no el correo; si existe, envía el enlace | `RECUPERACION_SOLICITADA` |
| POST | `/auth/recuperacion/confirmar` | Público | `token`, `claveNueva` | 204; cierra todas las sesiones. 400 `ENLACE_INVALIDO` | `CLAVE_RESTABLECIDA` |

### Plataforma (solo el Master)

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| GET | `/plataforma/metricas` | Master | — | 200 `{ empresas, empresasActivas, usuarios, usuariosActivos, documentos, almacenamientoBytes, ultimoAcceso }` | — |
| GET | `/plataforma/empresas` | Master | — | 200 `{ datos }`: cada empresa con sus `metricas` (solo cifras) | — |
| POST | `/plataforma/empresas` | Master | `empresa { nombre, ruc? }`, `administrador { nombre, email, dni?, clave }` | 201 `{ empresa, administrador }`; crea también las categorías iniciales | `EMPRESA_CREADA`, `USUARIO_CREADO` |
| GET | `/plataforma/empresas/:id` | Master | — | 200 con la empresa, sus `metricas` y sus `administradores` | — |
| PATCH | `/plataforma/empresas/:id` | Master | `nombre?`, `ruc?` | 200 con la empresa | `EMPRESA_EDITADA` |
| PATCH | `/plataforma/empresas/:id/estado` | Master | `activa` | 200 con la empresa; desactivarla cierra las sesiones de todos sus usuarios | `EMPRESA_DESACTIVADA` o `EMPRESA_REACTIVADA` |
| POST | `/plataforma/empresas/:id/administradores` | Master | `nombre`, `email`, `dni?`, `clave` | 201 con el administrador | `USUARIO_CREADO` |
| PATCH | `/plataforma/administradores/:id` | Master | `nombre?`, `email?`, `dni?`, `clave?` | 200; restablecer la clave cierra sus sesiones. 404 si no es un administrador | `USUARIO_EDITADO` |
| PATCH | `/plataforma/administradores/:id/estado` | Master | `activo` | 200; desactivar revoca sus sesiones | `USUARIO_DESACTIVADO` o `USUARIO_REACTIVADO` |

Lo que el Master hace con una empresa queda en el historial de esa empresa, con el rol `master`.

### Usuarios

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| GET | `/usuarios` | Admin | `?q`, `rol`, `activo` y paginación | 200 paginado | — |
| POST | `/usuarios` | Admin | `nombre`, `email`, `dni?`, `clave`, `rol` (`administrador` o `usuario`; nunca `master`) | 201 con el usuario | `USUARIO_CREADO` |
| PATCH | `/usuarios/:id` | Admin | `nombre?`, `dni?`, `rol?`, `clave?` | 200 con el usuario; restablecer la clave cierra sus sesiones | `USUARIO_EDITADO` |
| PATCH | `/usuarios/:id/estado` | Admin | `activo` | 200 con el usuario; desactivar revoca sus sesiones | `USUARIO_DESACTIVADO` o `USUARIO_REACTIVADO` |

### Categorías

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| GET | `/categorias` | Empresa | `?incluirInactivas`, solo para administradores (a los demás, 403) | 200 `{ datos }`: la lista completa, sin paginar, cada una con cuántos documentos vigentes la usan | — |
| POST | `/categorias` | Admin | `nombre`, `descripcion?` | 201 con la categoría | `CATEGORIA_CREADA` |
| PATCH | `/categorias/:id` | Admin | `nombre?`, `descripcion?`, `activa?` | 200 con la categoría | `CATEGORIA_EDITADA` |

### Documentos

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| GET | `/documentos` | Empresa | `?q`, `categoriaId`, `desde`, `hasta`, `orden` (`recientes`, `fecha` o `nombre`) y paginación | 200 paginado, más `tiempoRespuestaId` | `BUSQUEDA_REALIZADA`, si hay algún filtro |
| POST | `/documentos` | Empresa | Multipart: `archivo`, `nombre`, `categoriaId`, `fechaDocumento`, `descripcion?` | 201 con el documento | `DOCUMENTO_SUBIDO` |
| GET | `/documentos/:id` | Empresa | — | 200 con el documento, su `ultimaSolicitud` y sus `permisos` | — |
| PATCH | `/documentos/:id` | Propietario o admin | `nombre?`, `categoriaId?`, `fechaDocumento?`, `descripcion?` | 200 con el documento | `DOCUMENTO_EDITADO` |
| DELETE | `/documentos/:id` | Propietario o admin | — | 204 | `DOCUMENTO_ELIMINADO` |
| GET | `/documentos/:id/archivo` | Empresa | `?modo=ver` o `?modo=descargar` | 200 `{ url, expiraEn }` | `DOCUMENTO_VISUALIZADO` o `DOCUMENTO_DESCARGADO` |

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
| GET | `/historial/exportar` | Admin | Los mismos filtros | 200 `text/csv` en UTF-8 con BOM (Excel lo abre con tildes): id, fecha y hora de Lima, fecha UTC, acción, usuario (las del Master, «Administración de la plataforma»), correo, rol, entidad, móvil, user-agent y detalle en JSON. Las fechas del filtro son días de Lima | `HISTORIAL_EXPORTADO` |

### Tiempos de respuesta

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| PATCH | `/tiempos-respuesta/:id` | Empresa; solo el suyo, y una vez | `duracionClienteMs` | 204 | — |

En total, 38 endpoints: los 28 de la v1 menos el registro público, más dos de recuperación y nueve de la plataforma.

## 4. Respuestas de ejemplo

**Inicio de sesión** (`POST /auth/login`):

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
  "expiraEn": "2026-10-02T22:35:16Z",
  "usuario": { "id": "8f3c…", "nombre": "Ana Torres", "email": "ana@ejemplo.pe", "rol": "usuario", "dni": null },
  "empresa": { "id": "1b7e…", "nombre": "Distribuidora Ejemplo SAC" }
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
- **El enlace de recuperación** llega como `/restablecer-clave#<token>`. La página lee el fragmento,
  lo quita de la barra de direcciones y lo envía en el cuerpo de `/auth/recuperacion/confirmar`.
- **El Master** no tiene empresa: su menú es la plataforma y su marco no consulta notificaciones, que
  le responderían 403.
- **403:** se muestra «sin permiso». La API ya lo registró.

## 6. Qué pantalla usa cada endpoint

Comprobación de que el catálogo está completo: cada pantalla tiene lo que necesita, y cada endpoint
lo usa alguien.

| Pantalla | Ruta | Quién | Endpoints |
|---|---|---|---|
| Iniciar sesión | `/login` | Visitante | `POST /auth/login` |
| Recuperar la contraseña | `/recuperar-clave` | Visitante | `POST /auth/recuperacion` |
| Definir una contraseña nueva | `/restablecer-clave` | Quien abre el enlace | `POST /auth/recuperacion/confirmar` |
| Marco común: barras lateral y superior | — | Todos; las notificaciones, solo Administrador y Usuario | `GET /auth/yo`, `GET /notificaciones`, `POST /auth/logout` |
| Plataforma: cifras y empresas | `/plataforma` | Master | `GET /plataforma/metricas`, `GET /plataforma/empresas` |
| Nueva empresa | `/plataforma/empresas/nueva` | Master | `POST /plataforma/empresas` |
| Ficha de una empresa | `/plataforma/empresas/:id` | Master | `GET /plataforma/empresas/:id`, `PATCH /plataforma/empresas/:id`, `PATCH /plataforma/empresas/:id/estado`, `POST /plataforma/empresas/:id/administradores`, `PATCH /plataforma/administradores/:id`, `PATCH /plataforma/administradores/:id/estado` |
| Documentos: listado y búsqueda | `/documentos` | Administrador y Usuario | `GET /documentos`, `GET /categorias`, `PATCH /tiempos-respuesta/:id` |
| Subir documento | `/documentos/nuevo` | Administrador y Usuario | `GET /categorias`, `POST /documentos` |
| Detalle de documento | `/documentos/:id` | Administrador y Usuario; las acciones, según `permisos` | `GET /documentos/:id`, `GET /documentos/:id/archivo`, `PATCH /documentos/:id`, `DELETE /documentos/:id`, `POST /documentos/:id/solicitudes`, `POST /solicitudes/:id/resolucion`, `GET /categorias` |
| Solicitudes | `/solicitudes` | Administrador y Usuario; el administrador ve la bandeja de toda su empresa | `GET /solicitudes` |
| Notificaciones | `/notificaciones` | Administrador y Usuario | `GET /notificaciones`, `PATCH /notificaciones/:id/leida`, `PATCH /notificaciones/leidas` |
| Mi cuenta | `/cuenta` | Todos | `GET /auth/yo`, `PUT /auth/clave` |
| Usuarios | `/admin/usuarios` | Administrador; para los demás, 403 registrado | `GET /usuarios`, `POST /usuarios`, `PATCH /usuarios/:id`, `PATCH /usuarios/:id/estado` |
| Categorías | `/admin/categorias` | Administrador | `GET /categorias?incluirInactivas=true`, `POST /categorias`, `PATCH /categorias/:id` |
| Historial | `/admin/historial` | Administrador | `GET /historial`, `GET /historial/exportar`, `GET /usuarios` (para el filtro) |
| — | — | Monitor externo | `GET /salud` |

Desde una solicitud o una notificación se llega al detalle del documento, que muestra la solicitud y,
a quien pueda, los botones para aprobar o rechazar. Por eso no hay pantalla ni endpoint de detalle de
solicitud.
