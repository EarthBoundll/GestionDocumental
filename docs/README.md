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
| B · Identidad visual y modo oscuro | Terminada el 5 de octubre de 2026: nombre comercial, color y logo por empresa, que cambian su administrador y el Master (RF31), y tema claro, oscuro o del dispositivo guardado en la cuenta de cada persona (RF32), sobre variables de CSS y con el contraste validado (D28, migración 008). 319 pruebas del backend, 61 del frontend y 45 de 45 ejecuciones funcionales |
| B · Vista previa del archivo | Terminada el 7 de octubre de 2026: el PDF o la imagen dentro de la ficha, con el enlace de «Ver» y el visor del navegador, registrada como vista (RF33, D29). 65 pruebas del frontend y 47 de 47 ejecuciones funcionales |
| B · Versionado simplificado | Terminada el 7 de octubre de 2026: subir una versión nueva sin perder las anteriores, verlas y descargarlas, y restaurar una como la siguiente; la aprobación es de una versión y la purga borra todas (RF34, D30, migración 009). 327 pruebas del backend, 70 del frontend, 49 de 49 ejecuciones funcionales y 58 de 58 intentos de aislamiento |
| B · Evidencia para el capítulo 3 | Terminada el 7 de octubre de 2026: listado documental en CSV (RF35), historial para imprimir o guardar como PDF con espacio para firmas (RF36) y prueba de carga con 50.000 documentos, que encontró la política por fila y la corrigió (D31, D32, migración 010). La prueba de backend ya no da verde con pruebas en rojo. 340 pruebas del backend, 74 del frontend, 51 de 51 ejecuciones funcionales y 60 de 60 intentos de aislamiento |
| B · Preparación de la evaluación y la sustentación | Terminada el 8 de octubre de 2026: el cierre del estudio escrito y probado —simulacro, borrado de filas, archivos y respaldos de una empresa, y una constancia sin datos personales (D33, migración 011)—, 40 documentos ficticios reproducibles que se cargan por la API (D34) y el guion de la sustentación. 355 pruebas del backend |
| B · Revisión y congelamiento | Terminada el 9 de octubre de 2026: una revisión de lo anterior corrigió que una versión nueva y una solicitud de aprobación a la vez pudieran cruzarse, la vista previa que seguía mostrando el archivo anterior y el generador de documentos de prueba; además, el procedimiento del congelamiento con el ensayo de restauración de un respaldo en una base desechable (D35). 360 pruebas del backend, 75 del frontend y 51 de 51 ejecuciones funcionales |
| B · Uso en el celular | Terminada el 9 de octubre de 2026, tras recorrer el sistema con los 40 documentos ficticios a 360 px: en el listado, los nombres en hasta tres líneas en vez de cortados; orden y fechas plegados tras «Más filtros»; al buscar en una pantalla táctil se cierra el teclado y quedan los resultados a la vista, y «Tomar foto» abre la cámara para subir un papel (D36). 79 pruebas del frontend y 55 de 55 ejecuciones funcionales |

Las fases 1 a 6 siguen la numeración del plan de la v1; la 7 y la 8, la del `CLAUDE.md` v2, que es la vigente.

| Documento | Qué contiene |
|---|---|
| [01 · Análisis](01-analisis.md) | Problema, actores (tres roles), requisitos, reglas de negocio, matriz de permisos, acciones auditables y de dónde sale cada indicador |
| [02 · Arquitectura](02-arquitectura.md) | Diagrama, capas, la capa de acceso a datos, flujos críticos, despliegue, seguridad, decisiones técnicas, riesgos y encaje con Cloud Computing |
| [03 · Modelo de datos](03-modelo-datos.md) | Diagrama entidad-relación, diccionario de datos, restricciones, RLS e índices |
| [04 · API](04-api.md) | Convenciones, formato de errores, los 59 endpoints y qué pantalla usa cada uno |
| [05 · Estructura](05-estructura.md) | Carpetas de backend y frontend, dependencias y variables de entorno |
| [06 · Migración a v2](06-migracion-v2.md) | El diagnóstico de la v1 frente a la v2, las decisiones A–G y el plan que se siguió |
| [07 · Despliegue](07-despliegue.md) | Supabase, Brevo, Render y Vercel paso a paso, la creación del Master, el monitor y las tareas programadas, cómo restaurar un respaldo, la comprobación, la integración continua y qué hacer durante la evaluación |
| [08 · Indicadores](08-indicadores.md) | Las consultas que sacan del sistema cada uno de los siete indicadores al cerrar una sesión de evaluación |
| [09 · Protocolo de evaluación](09-protocolo-evaluacion.md) | Borrador para el asesor: diseño, participantes, materiales, sesiones, la tarea de cada indicador con su inicio y su fin, sesgos, ficha de observación y análisis |
| [10 · Consentimiento informado](10-consentimiento-informado.md) | La hoja que firma cada participante, con la transferencia de datos a EE. UU., y la autorización de la empresa |
| [11 · Guion de la sustentación](11-guion-sustentacion.md) | Borrador: diez minutos minuto a minuto con la demostración en vivo, las preguntas probables del jurado y qué hacer si algo falla |
| [Evidencias: aislamiento](evidencias/aislamiento-entre-empresas.md) | Informe de aislamiento entre empresas, generado por `npm run informe:aislamiento` (indicador 6) |
| [Evidencias: pruebas funcionales](evidencias/pruebas-funcionales.md) | Cada requisito funcional probado en un navegador real, en escritorio y celular, generado por `npm run pruebas:funcionales` |
| [Evidencias: prueba de carga](evidencias/prueba-de-carga.md) | El listado y la búsqueda con 50.000 documentos, antes y después de la migración 010, generado por `npm run informe:carga` (indicador 7) |

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
3. **La fecha del cierre del estudio**, con el asesor. El procedimiento ya está escrito y probado
   ([09 · Protocolo](09-protocolo-evaluacion.md) §10, D33).
4. **La prueba de humo con personas** de [07 · Despliegue §8](07-despliegue.md): subir desde un celular y
   recibir el correo de recuperación. Va antes del congelamiento ([07 §9.1](07-despliegue.md)), que cierra
   la preparación: etiqueta, respaldo y su ensayo.
