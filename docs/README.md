# Diseño del sistema

Sistema web de gestión documental para micro y pequeñas empresas de Lima — tesis UPN, 2026.

| Fase | Estado |
|---|---|
| 0 · Análisis y arquitectura | Aprobada el 2 de octubre de 2026 |
| 1 · Base del backend | Terminada: proyecto, conexión, migraciones, errores y entorno ([`backend/`](../backend/README.md)) |
| 2 · Autenticación y roles | Terminada: registro, inicio y cierre de sesión, cambio de contraseña, permisos por rol e historial |
| 3 · Documentos | Terminada: categorías, subida, búsqueda sin tildes, ficha con permisos, edición, eliminación lógica, enlaces firmados y tiempos de respuesta |
| 4 · Aprobación y usuarios | Terminada: flujo de aprobación con notificaciones, gestión de usuarios, consulta y exportación del historial |

| Documento | Qué contiene |
|---|---|
| [01 · Análisis](01-analisis.md) | Problema, actores, requisitos, reglas de negocio, matriz de permisos, acciones auditables y de dónde sale cada indicador |
| [02 · Arquitectura](02-arquitectura.md) | Diagrama, capas, flujos críticos, despliegue, seguridad, decisiones técnicas, riesgos y encaje con Cloud Computing |
| [03 · Modelo de datos](03-modelo-datos.md) | Diagrama entidad-relación, diccionario de datos, restricciones e índices |
| [04 · API](04-api.md) | Convenciones, formato de errores, los 28 endpoints y qué pantalla usa cada uno |
| [05 · Estructura](05-estructura.md) | Carpetas de backend y frontend, dependencias y variables de entorno |

## La arquitectura en un párrafo

Una SPA en React (Vercel) habla con una API REST en Express (Render). La API es la única que toca
la base de datos PostgreSQL y el almacenamiento de archivos, ambos en Supabase y en la misma región
que ella. Toda acción auditable se registra en el historial dentro de la misma transacción que la
ejecuta: si no se puede registrar, no se ejecuta. Los archivos se descargan directamente de Supabase,
con un enlace firmado de 5 minutos que la API entrega solo después de autorizar y registrar.

## Decisiones de la Fase 0 ya asumidas

Al aprobar la Fase 0 quedaron adoptadas: la organización como entidad (D6 en
[Arquitectura](02-arquitectura.md)), TypeScript en backend y frontend (E2 en
[Estructura](05-estructura.md)) y desplegar desde la Fase 1 en lugar de esperar a la 7, porque los
fallos más probables de esta arquitectura —la conexión entre Render y Supabase, CORS, la API dormida—
solo aparecen al desplegar.

## Pendiente de decidir o de hacer

1. **Cuentas.** Render y Supabase, para el primer despliegue (`render.yaml` ya está listo), y un
   monitor externo gratuito (UptimeRobot o cron-job.org) que llame a `/salud` cada 10 minutos (D13).
   Las cuentas las crea el responsable del proyecto, no el asistente.
2. **Base de desarrollo.** O un segundo proyecto de Supabase (el plan gratuito admite dos activos), o
   el PostgreSQL 18 que ya está instalado en la máquina de desarrollo.
3. **Una o varias MYPEs en la evaluación.** No cambia el diseño, pero sí cómo se preparan los datos.
