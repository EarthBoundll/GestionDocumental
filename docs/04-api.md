# 04 · API REST

## 1. Convenciones

- **Base:** `https://<servicio>.onrender.com/api/v1` en producción y `http://localhost:4000/api/v1`
  en desarrollo.
- **Formato:** JSON en UTF-8, salvo la subida de documentos (`multipart/form-data`) y la exportación
  del historial (`text/csv`).
- **Nombres:** rutas en español, en plural y en minúsculas (`/tiempos-respuesta`); campos JSON en
  `camelCase` (`fechaDocumento`). La base usa `snake_case` y el repositorio traduce.
- **Autenticación:** `Authorization: Bearer <token>` en todas las rutas salvo `/salud`,
  `/auth/registro` y `/auth/login`.
- **Organización:** nunca se envía; la API usa la de la sesión. Un recurso de otra organización
  responde 404, igual que uno inexistente, para no revelar que existe.
- **Fechas:** la fecha de un documento va como `AAAA-MM-DD`; los instantes, en ISO 8601 y UTC
  (`2026-10-02T14:35:16Z`). La interfaz los muestra en hora de Lima.
- **Paginación:** `?pagina=1&porPagina=20`, con un máximo de 100 por página. Respuesta:

  ```json
  { "datos": [], "paginacion": { "pagina": 1, "porPagina": 20, "total": 57 } }
  ```

- **Token:** JWT HS256 con `sub` (id del usuario), `jti` (id de la sesión), `iat` y `exp`. No lleva
  rol ni organización: se leen de la base en cada petición (D4).

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
| 403 | `USUARIO_INACTIVO` | Inicio de sesión de un usuario desactivado, con la contraseña correcta |
| 403 | `REGISTRO_CERRADO` | El registro público está cerrado por configuración (RN21) |
| 404 | `NO_ENCONTRADO` | No existe, o es de otra organización: indistinguibles a propósito |
| 409 | `EMAIL_EN_USO` | Ya hay un usuario con ese correo |
| 409 | `CATEGORIA_DUPLICADA` | Ya hay una categoría con ese nombre en la organización |
| 409 | `CATEGORIA_INACTIVA` | Se asigna a un documento una categoría desactivada |
| 409 | `OPERACION_SOBRE_SI_MISMO` | Un administrador intenta cambiar su propio rol o desactivarse (RN03) |
| 409 | `SOLICITUD_PENDIENTE` | El documento ya tiene una solicitud pendiente |
| 409 | `SIN_REVISOR` | El solicitante es el único administrador activo (RN13) |
| 409 | `SOLICITUD_RESUELTA` | Otro administrador la resolvió antes |
| 409 | `DOCUMENTO_EN_REVISION` | Se intenta eliminar un documento con una solicitud pendiente (RN11) |
| 413 | `ARCHIVO_DEMASIADO_GRANDE` | El archivo supera los 10 MB |
| 413 | `CUERPO_DEMASIADO_GRANDE` | Un cuerpo JSON supera los 100 kB |
| 415 | `TIPO_NO_PERMITIDO` | El tipo de archivo no está en la lista blanca |
| 429 | `DEMASIADOS_INTENTOS` | Diez inicios de sesión fallidos en 15 minutos, o diez registros en una hora, desde la misma IP (RN20) |
| 500 | `ERROR_INTERNO` | Cualquier otro fallo; en producción, sin detalles técnicos |
| 503 | `SERVICIO_NO_DISPONIBLE` | `/salud`, cuando la base no responde |

## 3. Endpoints

**Quién:** *Público*, sin sesión · *Sesión*, cualquier usuario con sesión · *Admin*, administrador ·
*Propietario*, quien subió el documento. **Historial:** la acción que registra
([Análisis §7](01-analisis.md)).

### Sistema

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| GET | `/salud` | Público | — | 200 `{ estado: "ok" }`; 503 si la base no responde | — |

### Autenticación

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| POST | `/auth/registro` | Público | `organizacion { nombre, ruc? }`, `administrador { nombre, email, clave }` | 201 `{ token, expiraEn, usuario, organizacion }` | `ORGANIZACION_REGISTRADA`, `SESION_INICIADA` |
| POST | `/auth/login` | Público | `email`, `clave` | 200 `{ token, expiraEn, usuario, organizacion }` | `SESION_INICIADA` o `SESION_FALLIDA` |
| POST | `/auth/logout` | Sesión | — | 204 | `SESION_CERRADA` |
| GET | `/auth/yo` | Sesión | — | 200 `{ usuario, organizacion }` | — |
| PUT | `/auth/clave` | Sesión | `claveActual`, `claveNueva` | 204; cierra las demás sesiones. 400 si la actual no coincide | `CLAVE_CAMBIADA` |

### Usuarios

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| GET | `/usuarios` | Admin | `?q`, `rol`, `activo` y paginación | 200 paginado | — |
| POST | `/usuarios` | Admin | `nombre`, `email`, `clave`, `rol` | 201 con el usuario | `USUARIO_CREADO` |
| PATCH | `/usuarios/:id` | Admin | `nombre?`, `rol?`, `clave?` | 200 con el usuario; restablecer la clave cierra sus sesiones | `USUARIO_EDITADO` |
| PATCH | `/usuarios/:id/estado` | Admin | `activo` | 200 con el usuario; desactivar revoca sus sesiones | `USUARIO_DESACTIVADO` o `USUARIO_REACTIVADO` |

### Categorías

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| GET | `/categorias` | Sesión | `?incluirInactivas`, solo para administradores (a los demás, 403) | 200 `{ datos }`: la lista completa, sin paginar, cada una con cuántos documentos vigentes la usan | — |
| POST | `/categorias` | Admin | `nombre`, `descripcion?` | 201 con la categoría | `CATEGORIA_CREADA` |
| PATCH | `/categorias/:id` | Admin | `nombre?`, `descripcion?`, `activa?` | 200 con la categoría | `CATEGORIA_EDITADA` |

### Documentos

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| GET | `/documentos` | Sesión | `?q`, `categoriaId`, `desde`, `hasta`, `orden` (`recientes`, `fecha` o `nombre`) y paginación | 200 paginado, más `tiempoRespuestaId` | `BUSQUEDA_REALIZADA`, si hay algún filtro |
| POST | `/documentos` | Sesión | Multipart: `archivo`, `nombre`, `categoriaId`, `fechaDocumento`, `descripcion?` | 201 con el documento | `DOCUMENTO_SUBIDO` |
| GET | `/documentos/:id` | Sesión | — | 200 con el documento, su `ultimaSolicitud` y sus `permisos` | — |
| PATCH | `/documentos/:id` | Propietario o admin | `nombre?`, `categoriaId?`, `fechaDocumento?`, `descripcion?` | 200 con el documento | `DOCUMENTO_EDITADO` |
| DELETE | `/documentos/:id` | Propietario o admin | — | 204 | `DOCUMENTO_ELIMINADO` |
| GET | `/documentos/:id/archivo` | Sesión | `?modo=ver` o `?modo=descargar` | 200 `{ url, expiraEn }` | `DOCUMENTO_VISUALIZADO` o `DOCUMENTO_DESCARGADO` |

### Solicitudes de aprobación

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| POST | `/documentos/:id/solicitudes` | Propietario | `comentario?` | 201 con la solicitud; notifica a los administradores | `SOLICITUD_CREADA` |
| GET | `/solicitudes` | Sesión | `?estado` y paginación | 200 paginado: el administrador ve todas; el usuario, las suyas | — |
| POST | `/solicitudes/:id/resolucion` | Admin que no sea el solicitante | `decision` (`aprobada` o `rechazada`), `comentario` (obligatorio si rechaza) | 200 con la solicitud; notifica al solicitante. 403 registrado si es la propia; 409 si ya estaba resuelta | `SOLICITUD_APROBADA` o `SOLICITUD_RECHAZADA` |

### Notificaciones

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| GET | `/notificaciones` | Sesión | `?soloNoLeidas` y paginación | 200 paginado, más el total `noLeidas` | — |
| PATCH | `/notificaciones/:id/leida` | Destinatario | — | 204 | — |
| PATCH | `/notificaciones/leidas` | Sesión | — | 204; marca todas como leídas | — |

### Historial

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| GET | `/historial` | Admin | `?usuarioId`, `accion`, `entidadTipo`, `entidadId`, `desde`, `hasta` y paginación | 200 paginado | — |
| GET | `/historial/exportar` | Admin | Los mismos filtros | 200 `text/csv` en UTF-8 con BOM (Excel lo abre con tildes): id, fecha y hora de Lima, fecha UTC, acción, usuario, correo, rol, entidad, móvil, user-agent y detalle en JSON. Las fechas del filtro son días de Lima | `HISTORIAL_EXPORTADO` |

### Tiempos de respuesta

| Método | Ruta | Quién | Entrada | Respuesta | Historial |
|---|---|---|---|---|---|
| PATCH | `/tiempos-respuesta/:id` | Sesión; solo el suyo, y una vez | `duracionClienteMs` | 204 | — |

En total, 28 endpoints.

## 4. Respuestas de ejemplo

**Inicio de sesión** (`POST /auth/login`, también la respuesta del registro):

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
  "expiraEn": "2026-10-02T22:35:16Z",
  "usuario": { "id": "8f3c…", "nombre": "Ana Torres", "email": "ana@ejemplo.pe", "rol": "usuario" },
  "organizacion": { "id": "1b7e…", "nombre": "Distribuidora Ejemplo SAC" }
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
- **403:** se muestra «sin permiso». La API ya lo registró.

## 6. Qué pantalla usa cada endpoint

Comprobación de que el catálogo está completo: cada pantalla tiene lo que necesita, y cada endpoint
lo usa alguien.

| Pantalla | Ruta | Quién | Endpoints |
|---|---|---|---|
| Iniciar sesión | `/login` | Visitante | `POST /auth/login` |
| Registrar organización | `/registro` | Visitante | `POST /auth/registro` |
| Marco común: barras lateral y superior | — | Todos | `GET /auth/yo`, `GET /notificaciones`, `POST /auth/logout` |
| Documentos: listado y búsqueda | `/documentos` | Todos | `GET /documentos`, `GET /categorias`, `PATCH /tiempos-respuesta/:id` |
| Subir documento | `/documentos/nuevo` | Todos | `GET /categorias`, `POST /documentos` |
| Detalle de documento | `/documentos/:id` | Todos; las acciones, según `permisos` | `GET /documentos/:id`, `GET /documentos/:id/archivo`, `PATCH /documentos/:id`, `DELETE /documentos/:id`, `POST /documentos/:id/solicitudes`, `POST /solicitudes/:id/resolucion`, `GET /categorias` |
| Solicitudes | `/solicitudes` | Todos; el administrador ve la bandeja de toda la organización | `GET /solicitudes` |
| Notificaciones | `/notificaciones` | Todos | `GET /notificaciones`, `PATCH /notificaciones/:id/leida`, `PATCH /notificaciones/leidas` |
| Mi cuenta | `/cuenta` | Todos | `GET /auth/yo`, `PUT /auth/clave` |
| Usuarios | `/admin/usuarios` | Administrador; para los demás, 403 registrado | `GET /usuarios`, `POST /usuarios`, `PATCH /usuarios/:id`, `PATCH /usuarios/:id/estado` |
| Categorías | `/admin/categorias` | Administrador | `GET /categorias?incluirInactivas=true`, `POST /categorias`, `PATCH /categorias/:id` |
| Historial | `/admin/historial` | Administrador | `GET /historial`, `GET /historial/exportar`, `GET /usuarios` (para el filtro) |
| — | — | Monitor externo | `GET /salud` |

Desde una solicitud o una notificación se llega al detalle del documento, que muestra la solicitud y,
a quien pueda, los botones para aprobar o rechazar. Por eso no hay pantalla ni endpoint de detalle de
solicitud.
