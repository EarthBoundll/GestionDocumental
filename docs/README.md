# Diseño del sistema

Sistema web de gestión documental para micro y pequeñas empresas de Lima — tesis UPN, 2026.

| Fase | Estado |
|---|---|
| 0 · Análisis y arquitectura | Aprobada el 2 de octubre de 2026 |
| 1 · Base del backend | Terminada: proyecto, conexión, migraciones, errores y entorno ([`backend/`](../backend/README.md)) |
| 2 · Autenticación y roles | Terminada: inicio y cierre de sesión, cambio de contraseña, permisos por rol e historial |
| 3 · Documentos | Terminada: categorías, subida, búsqueda sin tildes, ficha con permisos, edición, eliminación lógica, enlaces firmados y tiempos de respuesta |
| 4 · Aprobación y usuarios | Terminada: flujo de aprobación con notificaciones, gestión de usuarios, consulta y exportación del historial |
| v2 · Multiempresa | Migración terminada en backend y frontend ([06 · Migración](06-migracion-v2.md)): empresas aisladas con RLS, Administrador Master, recuperación de contraseña por correo y batería de aislamiento con su informe |

| Documento | Qué contiene |
|---|---|
| [01 · Análisis](01-analisis.md) | Problema, actores (tres roles), requisitos, reglas de negocio, matriz de permisos, acciones auditables y de dónde sale cada indicador |
| [02 · Arquitectura](02-arquitectura.md) | Diagrama, capas, la capa de acceso a datos, flujos críticos, despliegue, seguridad, decisiones técnicas, riesgos y encaje con Cloud Computing |
| [03 · Modelo de datos](03-modelo-datos.md) | Diagrama entidad-relación, diccionario de datos, restricciones, RLS e índices |
| [04 · API](04-api.md) | Convenciones, formato de errores, los 38 endpoints y qué pantalla usa cada uno |
| [05 · Estructura](05-estructura.md) | Carpetas de backend y frontend, dependencias y variables de entorno |
| [06 · Migración a v2](06-migracion-v2.md) | El diagnóstico de la v1 frente a la v2, las decisiones A–G y el plan que se siguió |
| [Evidencias](evidencias/aislamiento-entre-empresas.md) | Informe de aislamiento entre empresas, generado por `npm run informe:aislamiento` (indicador 6) |

## La arquitectura en un párrafo

Una SPA en React (Vercel) habla con una API REST en Express (Render). La API es la única que toca
la base de datos PostgreSQL y el almacenamiento de archivos, ambos en Supabase y en la misma región
que ella. Varias empresas comparten la plataforma: cada petición trabaja con el acceso a datos de la
empresa de quien la hace, y la base, con RLS, no devuelve filas de otra aunque una consulta lo
olvidara. Toda acción auditable se registra en el historial dentro de la misma transacción que la
ejecuta: si no se puede registrar, no se ejecuta. Los archivos se descargan directamente de Supabase,
con un enlace firmado de 5 minutos que la API entrega solo después de autorizar y registrar.

## Decisiones asumidas

Al aprobar la Fase 0 quedaron adoptadas: la empresa como entidad (D6 en
[Arquitectura](02-arquitectura.md)), TypeScript en backend y frontend (E2 en
[Estructura](05-estructura.md)) y desplegar desde la Fase 1 en lugar de esperar a la 7, porque los
fallos más probables de esta arquitectura —la conexión entre Render y Supabase, CORS, la API dormida—
solo aparecen al desplegar. Con la v2 se aprobaron las decisiones A–G de
[06 · Migración](06-migracion-v2.md), que en la arquitectura son D6 y D17–D20.

## Pendiente de decidir o de hacer

1. **Cuentas.** Render, Supabase y Brevo, para el primer despliegue (`render.yaml` ya está listo), y un
   monitor externo gratuito (UptimeRobot o cron-job.org) que llame a `/salud` cada 10 minutos (D13).
   En Brevo hay que verificar el remitente. Las cuentas las crea el responsable del proyecto, no el
   asistente.
2. **Base de desarrollo.** O un segundo proyecto de Supabase (el plan gratuito admite dos activos), o
   `npm run local`, que levanta todo en la máquina sin instalar nada.
3. **Crear el Master** en la base de producción con `npm run crear-master`, una sola vez, con sus datos
   en el `.env` local de quien lo ejecuta.
4. **Una o varias MYPEs en la evaluación.** No cambia el diseño, pero sí cómo se preparan los datos.
