# Diseño del sistema

Sistema web de gestión documental para micro y pequeñas empresas de Lima — tesis UPN, 2026.

| Fase | Estado |
|---|---|
| 0 · Análisis y arquitectura | Aprobada el 2 de octubre de 2026 |
| 1 · Base del backend | Terminada: proyecto, conexión, migraciones, errores y entorno ([`backend/`](../backend/README.md)) |
| 2 · Autenticación y roles | Terminada: inicio y cierre de sesión, cambio de contraseña, permisos por rol e historial |
| 3 · Documentos | Terminada: categorías, subida, búsqueda sin tildes, ficha con permisos, edición, eliminación lógica, enlaces firmados y tiempos de respuesta |
| 4 · Aprobación y usuarios | Terminada: flujo de aprobación con notificaciones, gestión de usuarios, consulta y exportación del historial |
| 5–6 · Frontend | Marco, componentes y pantallas de los tres roles, construidos sin verificarlos en un navegador (se verificaron en la 7) |
| v2 · Multiempresa | Migración terminada en backend y frontend ([06 · Migración](06-migracion-v2.md)): empresas aisladas con RLS, Administrador Master, recuperación de contraseña por correo y batería de aislamiento con su informe |
| 7 · Pantallas conectadas a la API | Terminada el 3 de octubre de 2026: cada pantalla recorrida en un navegador con los tres roles, también con la compilación de producción y la CSP de Vercel. Se corrigieron diez fallos; el más grave solo aparecía en producción (las primeras peticiones al recargar salían sin token) |
| 8 · Responsive, pruebas y despliegue | Terminada: las pantallas sin desbordes a 360 y 768 px; [pruebas funcionales](evidencias/pruebas-funcionales.md) en un navegador real; desplegado el 3 de octubre de 2026 ([07 · Despliegue](07-despliegue.md)) |
| A · Mejoras de la auditoría técnica | Terminada el 4 de octubre de 2026: categorías restringidas (RF25), papelera con purga a 30 días (RF26), auditoría del Master (RF27), tablero con los indicadores (RF28), respaldo nocturno con restauración probada (RF29), bloqueo por cuenta (RN27), modo demostración de las pruebas e integración continua (D22–D26). 288 pruebas del backend, 42 del frontend y 39 de 39 ejecuciones funcionales |
| B · Ganancias rápidas de la segunda auditoría | Terminada el 4 de octubre de 2026: actividad de cada documento en su ficha (RF30, D27), tablero con flujo de aprobación y actividad reciente, último respaldo y espacio frente al GB gratuito en la portada del Master, ruta de navegación en la ficha, ayudas en el tablero y la auditoría, y una prueba que exige RLS en toda tabla con `empresa_id`. 298 pruebas del backend, 48 del frontend y 41 de 41 ejecuciones funcionales |

Las fases 1 a 6 siguen la numeración del plan de la v1; la 7 y la 8, la del `CLAUDE.md` v2, que es la vigente.

| Documento | Qué contiene |
|---|---|
| [01 · Análisis](01-analisis.md) | Problema, actores (tres roles), requisitos, reglas de negocio, matriz de permisos, acciones auditables y de dónde sale cada indicador |
| [02 · Arquitectura](02-arquitectura.md) | Diagrama, capas, la capa de acceso a datos, flujos críticos, despliegue, seguridad, decisiones técnicas, riesgos y encaje con Cloud Computing |
| [03 · Modelo de datos](03-modelo-datos.md) | Diagrama entidad-relación, diccionario de datos, restricciones, RLS e índices |
| [04 · API](04-api.md) | Convenciones, formato de errores, los 46 endpoints y qué pantalla usa cada uno |
| [05 · Estructura](05-estructura.md) | Carpetas de backend y frontend, dependencias y variables de entorno |
| [06 · Migración a v2](06-migracion-v2.md) | El diagnóstico de la v1 frente a la v2, las decisiones A–G y el plan que se siguió |
| [07 · Despliegue](07-despliegue.md) | Supabase, Brevo, Render y Vercel paso a paso, la creación del Master, el monitor y las tareas programadas, cómo restaurar un respaldo, la comprobación, la integración continua y qué hacer durante la evaluación |
| [08 · Indicadores](08-indicadores.md) | Las consultas que sacan del sistema cada uno de los siete indicadores al cerrar una sesión de evaluación |
| [09 · Protocolo de evaluación](09-protocolo-evaluacion.md) | Borrador para el asesor: diseño, participantes, materiales, sesiones, la tarea de cada indicador con su inicio y su fin, sesgos, ficha de observación y análisis |
| [10 · Consentimiento informado](10-consentimiento-informado.md) | La hoja que firma cada participante, con la transferencia de datos a EE. UU., y la autorización de la empresa |
| [Evidencias: aislamiento](evidencias/aislamiento-entre-empresas.md) | Informe de aislamiento entre empresas, generado por `npm run informe:aislamiento` (indicador 6) |
| [Evidencias: pruebas funcionales](evidencias/pruebas-funcionales.md) | Cada requisito funcional probado en un navegador real, en escritorio y celular, generado por `npm run pruebas:funcionales` |

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

1. **Los datos de la evaluación:** cuántas MYPEs, cuántos participantes, las fechas y si habrá un periodo
   de uso antes de la posprueba. Es lo marcado **[Por definir]** en [09 · Protocolo](09-protocolo-evaluacion.md).
2. **Revisar el protocolo y el consentimiento con el asesor**, y probarlos en el piloto con una persona
   fuera de la muestra.
3. **El procedimiento de cierre del estudio:** eliminar los datos de la empresa evaluada en la fecha que
   promete el consentimiento. El historial es inmutable para la aplicación (RN17), así que hace falta un
   procedimiento manual del dueño de la base, escrito y probado antes de la preprueba.
4. **La prueba de humo con personas** de [07 · Despliegue §8](07-despliegue.md): subir desde un celular y
   recibir el correo de recuperación. Va en el congelamiento, antes de la capacitación.
