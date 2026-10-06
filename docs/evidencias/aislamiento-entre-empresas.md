# Informe de aislamiento entre empresas

Generado el 5/10/2026, 11:17:59 a. m. (hora de Lima) por `npm run informe:aislamiento`,
a partir de la batería `tests/integracion/aislamiento.test.ts`, contra un PostgreSQL 17 real con las migraciones del proyecto.

La empresa B tiene un documento con su archivo, una categoría, usuarios, una solicitud pendiente, una notificación y una
medición de tiempo de respuesta. Desde la empresa A se intenta leer, modificar y descargar cada cosa por su id, encontrarla
en listados y búsquedas, y colarse enviando el `empresaId` de B o falsificando el token.

**Resultado: 50 de 50 intentos con la respuesta correcta (100.0 %).**

| # | Quién | Intento | Petición | Esperado | Obtenido | Correcto |
|---|---|---|---|---|---|---|
| 1 | administrador de A | ver la ficha de un documento | `GET /api/v1/documentos/:id` | 404 | 404 | Sí |
| 2 | administrador de A | ver el archivo de un documento | `GET /api/v1/documentos/:id/archivo` | 404 | 404 | Sí |
| 3 | administrador de A | descargar el archivo de un documento | `GET /api/v1/documentos/:id/archivo?modo=descargar` | 404 | 404 | Sí |
| 4 | administrador de A | ver la actividad de un documento | `GET /api/v1/documentos/:id/actividad` | 404 | 404 | Sí |
| 5 | administrador de A | editar un documento | `PATCH /api/v1/documentos/:id` | 404 | 404 | Sí |
| 6 | administrador de A | eliminar un documento | `DELETE /api/v1/documentos/:id` | 404 | 404 | Sí |
| 7 | administrador de A | pedir la aprobación de un documento | `POST /api/v1/documentos/:id/solicitudes` | 404 | 404 | Sí |
| 8 | administrador de A | marcar como leída una notificación | `PATCH /api/v1/notificaciones/:id/leida` | 404 | 404 | Sí |
| 9 | administrador de A | completar una medición de tiempo de respuesta | `PATCH /api/v1/tiempos-respuesta/:id` | 404 | 404 | Sí |
| 10 | administrador de A | ver la ficha de B en la plataforma | `GET /api/v1/plataforma/empresas/:id` | 403 | 403 | Sí |
| 11 | administrador de A | cambiar la identidad de B por la ruta del Master | `PATCH /api/v1/plataforma/empresas/:id/identidad` | 403 | 403 | Sí |
| 12 | administrador de A | quitar el logo de B por la ruta del Master | `DELETE /api/v1/plataforma/empresas/:id/identidad/logo` | 403 | 403 | Sí |
| 13 | administrador de A | editar una categoría | `PATCH /api/v1/categorias/:id` | 404 | 404 | Sí |
| 14 | administrador de A | editar un usuario | `PATCH /api/v1/usuarios/:id` | 404 | 404 | Sí |
| 15 | administrador de A | desactivar un usuario | `PATCH /api/v1/usuarios/:id/estado` | 404 | 404 | Sí |
| 16 | administrador de A | restablecer la contraseña de un administrador | `PATCH /api/v1/usuarios/:id` | 404 | 404 | Sí |
| 17 | administrador de A | resolver una solicitud de aprobación | `POST /api/v1/solicitudes/:id/resolucion` | 404 | 404 | Sí |
| 18 | usuario de A | ver la ficha de un documento | `GET /api/v1/documentos/:id` | 404 | 404 | Sí |
| 19 | usuario de A | ver el archivo de un documento | `GET /api/v1/documentos/:id/archivo` | 404 | 404 | Sí |
| 20 | usuario de A | descargar el archivo de un documento | `GET /api/v1/documentos/:id/archivo?modo=descargar` | 404 | 404 | Sí |
| 21 | usuario de A | ver la actividad de un documento | `GET /api/v1/documentos/:id/actividad` | 404 | 404 | Sí |
| 22 | usuario de A | editar un documento | `PATCH /api/v1/documentos/:id` | 404 | 404 | Sí |
| 23 | usuario de A | eliminar un documento | `DELETE /api/v1/documentos/:id` | 404 | 404 | Sí |
| 24 | usuario de A | pedir la aprobación de un documento | `POST /api/v1/documentos/:id/solicitudes` | 404 | 404 | Sí |
| 25 | usuario de A | marcar como leída una notificación | `PATCH /api/v1/notificaciones/:id/leida` | 404 | 404 | Sí |
| 26 | usuario de A | completar una medición de tiempo de respuesta | `PATCH /api/v1/tiempos-respuesta/:id` | 404 | 404 | Sí |
| 27 | usuario de A | ver la ficha de B en la plataforma | `GET /api/v1/plataforma/empresas/:id` | 403 | 403 | Sí |
| 28 | usuario de A | cambiar la identidad de B por la ruta del Master | `PATCH /api/v1/plataforma/empresas/:id/identidad` | 403 | 403 | Sí |
| 29 | usuario de A | quitar el logo de B por la ruta del Master | `DELETE /api/v1/plataforma/empresas/:id/identidad/logo` | 403 | 403 | Sí |
| 30 | usuario de A | editar una categoría | `PATCH /api/v1/categorias/:id` | 403 | 403 | Sí |
| 31 | usuario de A | editar un usuario | `PATCH /api/v1/usuarios/:id` | 403 | 403 | Sí |
| 32 | usuario de A | desactivar un usuario | `PATCH /api/v1/usuarios/:id/estado` | 403 | 403 | Sí |
| 33 | usuario de A | restablecer la contraseña de un administrador | `PATCH /api/v1/usuarios/:id` | 403 | 403 | Sí |
| 34 | usuario de A | resolver una solicitud de aprobación | `POST /api/v1/solicitudes/:id/resolucion` | 403 | 403 | Sí |
| 35 | administrador de A | listar documentos | `GET /api/v1/documentos` | 200 sin datos de B | 200 | Sí |
| 36 | administrador de A | buscar documentos por el nombre exacto de uno de B | `GET /api/v1/documentos` | 200 sin datos de B | 200 | Sí |
| 37 | administrador de A | buscar documentos por una categoría de B | `GET /api/v1/documentos` | 200 sin datos de B | 200 | Sí |
| 38 | administrador de A | listar categorías, también las inactivas | `GET /api/v1/categorias` | 200 sin datos de B | 200 | Sí |
| 39 | administrador de A | listar usuarios | `GET /api/v1/usuarios` | 200 sin datos de B | 200 | Sí |
| 40 | administrador de A | listar solicitudes | `GET /api/v1/solicitudes` | 200 sin datos de B | 200 | Sí |
| 41 | administrador de A | listar notificaciones | `GET /api/v1/notificaciones` | 200 sin datos de B | 200 | Sí |
| 42 | administrador de A | consultar el historial de un usuario de B | `GET /api/v1/historial` | 200 sin datos de B | 200 | Sí |
| 43 | administrador de A | consultar el historial de un documento de B | `GET /api/v1/historial` | 200 sin datos de B | 200 | Sí |
| 44 | administrador de A | exportar el historial en CSV | `GET /api/v1/historial/exportar` | 200, solo asientos de A | 200 | Sí |
| 45 | administrador de A | crear y listar enviando el empresaId de B | `POST /api/v1/categorias, /usuarios, /documentos` | todo queda en A | 201 | Sí |
| 46 | administrador de A | usar un token firmado con la empresa de B | `GET /api/v1/documentos/:id` | 401 | 401 | Sí |
| 47 | Administrador Master | leer documentos de una empresa | `GET /api/v1/documentos/:id` | 403 | 403 | Sí |
| 48 | Administrador Master | leer documentos de una empresa | `GET /api/v1/documentos/:id/archivo` | 403 | 403 | Sí |
| 49 | Administrador Master | leer documentos de una empresa | `GET /api/v1/documentos/:id/actividad` | 403 | 403 | Sí |
| 50 | Administrador Master | leer documentos de una empresa | `GET /api/v1/documentos` | 403 | 403 | Sí |

Un recurso de otra empresa responde 404, igual que uno inexistente: un 403 confirmaría que existe. Las rutas de
administración responden 403 a un usuario sin ese permiso antes de mirar ningún recurso.
