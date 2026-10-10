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
| B · Acceso y salida | Terminada el 9 de octubre de 2026: iniciar sesión, recuperar y restablecer la contraseña con un marco dividido, la imagen y el mensaje a la izquierda y el formulario a la derecha (en el celular, una franja arriba), con movimiento solo CSS que respeta «reducir movimiento»; cerrar sesión pide confirmación, se despide y el inicio de sesión lo confirma (D37). 80 pruebas del frontend y 56 de 56 ejecuciones funcionales |
| B · Contacto, términos y privacidad | Terminada el 9 de octubre de 2026: el acceso ofrece «Solicita una cuenta» (un correo ya redactado y WhatsApp opcional, configurables en Vercel) y enlaza `/terminos` y `/privacidad`, que se leen con o sin sesión y describen solo lo que el sistema hace, alineados con la Ley 29733 y el consentimiento, también al pie del menú con la sesión iniciada (D38). 84 pruebas del frontend y 58 de 58 ejecuciones funcionales |
| B · Fondo por empresa | Terminada el 9 de octubre de 2026: un color de fondo que tiñe las pantallas en claro y en oscuro sin perder legibilidad (solo cuenta su tono) y una imagen detrás en la computadora, comprimida en el navegador, que el celular no descarga y que nunca queda bajo el texto; medirlo llevó a oscurecer un punto el texto secundario (RF31, D39, migración 012). 365 pruebas del backend, 95 del frontend, 60 de 60 ejecuciones funcionales y 62 de 62 intentos de aislamiento |
| B · Movimiento y acceso | Terminada el 9 de octubre de 2026: el acceso con un titular cuya palabra rota, halos de color, tarjetas de vidrio que flotan y un ojo para ver la contraseña; dentro, pantallas que entran, listas escalonadas, esqueletos con brillo, botones que se hunden y diálogos que emergen. Solo CSS sobre `transform` y `opacity`, 4,1 KB comprimidos, y nada se mueve con «reducir movimiento» (D40). 98 pruebas del frontend y 62 de 62 ejecuciones funcionales |
| C · Verificación del correo | Terminada el 10 de octubre de 2026: la cuenta nace sin contraseña y su dueño la activa con la invitación que le llega (72 h, un solo uso), eligiendo su contraseña; sin el correo verificado no hay sesión, y nadie lo marca a mano: la base no deja escribir esa columna a la aplicación. Reenvío con freno por buzón, estado de cada cuenta a la vista del administrador y del Master, y rechazo de correos temporales conocidos (RF37, RF38, RN35–RN38, D41, migración 013). 388 pruebas del backend, 110 del frontend, 64 de 64 ejecuciones funcionales y 66 de 66 intentos de aislamiento |
| C · Buscador avanzado | Terminada el 10 de octubre de 2026: palabras en cualquier orden en el nombre, el archivo, la descripción o la categoría, por su raíz en español y con tolerancia a errores de escritura (nunca con números); relevancia explicable que cada resultado muestra; filtros por tipo, aprobación, quién lo subió y fecha del documento o de subida, con atajos y etiquetas que se quitan; sugerencias mientras se escribe que no se registran hasta elegir una. Todo en PostgreSQL con columnas generadas, sin motor externo; con 50.000 documentos la búsqueda bajó de 282 a 98 ms, y la medición encontró y corrigió dos fallos (RF10, RN39, RN40, D42, migración 014). 406 pruebas del backend, 121 del frontend, 66 de 66 ejecuciones funcionales, 71 de 71 intentos de aislamiento y 23 de 23 escenarios de carga |
| C · La IA en la búsqueda e informe final | Terminada el 10 de octubre de 2026, sin código: la búsqueda actual comparada con la semántica con embeddings y con la del contenido de PDF y DOCX en nueve criterios ([12 · Búsqueda e IA](12-busqueda-e-ia.md)). La búsqueda sigue sin IA, y lo decidirán las búsquedas fallidas de la evaluación, que el sistema ya registra, con una consulta probada (D43). El [informe final](13-informe-verificacion-y-busqueda.md) reúne los archivos, las decisiones, la seguridad, las pruebas con sus resultados, los riesgos, el correo y la cuenta Master |
| C · Prueba aislada de la IA | Terminada el 10 de octubre de 2026, fuera del sistema (`experimentos/busqueda-semantica/`): con `multilingual-e5-small` dentro del proceso, la semántica encontró 12 de 13 búsquedas con otra palabra donde la actual no encuentra ninguna, y la del contenido sin IA, 8 de 8 por lo que dice el documento; pero la semántica siempre devuelve algo, sin umbral que lo filtre, y suma 340-370 MB a una API con 512 MB. La IA sigue fuera del sistema hasta la evaluación ([12 §6](12-busqueda-e-ia.md), D43) |

Las fases 1 a 6 siguen la numeración del plan de la v1; la 7 y la 8, la del `CLAUDE.md` v2, que es la vigente.

| Documento | Qué contiene |
|---|---|
| [01 · Análisis](01-analisis.md) | Problema, actores (tres roles), requisitos, reglas de negocio, matriz de permisos, acciones auditables y de dónde sale cada indicador |
| [02 · Arquitectura](02-arquitectura.md) | Diagrama, capas, la capa de acceso a datos, flujos críticos, despliegue, seguridad, decisiones técnicas, riesgos y encaje con Cloud Computing |
| [03 · Modelo de datos](03-modelo-datos.md) | Diagrama entidad-relación, diccionario de datos, restricciones, RLS e índices |
| [04 · API](04-api.md) | Convenciones, formato de errores, los 69 endpoints y qué pantalla usa cada uno |
| [05 · Estructura](05-estructura.md) | Carpetas de backend y frontend, dependencias y variables de entorno |
| [06 · Migración a v2](06-migracion-v2.md) | El diagnóstico de la v1 frente a la v2, las decisiones A–G y el plan que se siguió |
| [07 · Despliegue](07-despliegue.md) | Supabase, Brevo, Render y Vercel paso a paso, la creación del Master, el monitor y las tareas programadas, cómo restaurar un respaldo, la comprobación, la integración continua y qué hacer durante la evaluación |
| [08 · Indicadores](08-indicadores.md) | Las consultas que sacan del sistema cada uno de los siete indicadores al cerrar una sesión de evaluación |
| [09 · Protocolo de evaluación](09-protocolo-evaluacion.md) | Borrador para el asesor: diseño, participantes, materiales, sesiones, la tarea de cada indicador con su inicio y su fin, sesgos, ficha de observación y análisis |
| [10 · Consentimiento informado](10-consentimiento-informado.md) | La hoja que firma cada participante, con la transferencia de datos a EE. UU., y la autorización de la empresa |
| [11 · Guion de la sustentación](11-guion-sustentacion.md) | Borrador: diez minutos minuto a minuto con la demostración en vivo, las preguntas probables del jurado y qué hacer si algo falla |
| [12 · Búsqueda e IA](12-busqueda-e-ia.md) | La búsqueda actual frente a la semántica con embeddings y a la del contenido de PDF y DOCX: qué resuelve cada una, costo, rendimiento, privacidad, precisión y mantenimiento, la recomendación y la consulta de búsquedas fallidas con la que se decidirá tras la evaluación |
| [13 · Informe de verificación y búsqueda](13-informe-verificacion-y-busqueda.md) | El cierre del pedido de octubre: qué se hizo, archivos, decisiones, medidas de seguridad, la cuenta Master, el correo, las pruebas con sus resultados reales, lo que no está probado y los riesgos |
| [Evidencias: aislamiento](evidencias/aislamiento-entre-empresas.md) | Informe de aislamiento entre empresas, generado por `npm run informe:aislamiento` (indicador 6) |
| [Evidencias: pruebas funcionales](evidencias/pruebas-funcionales.md) | Cada requisito funcional probado en un navegador real, en escritorio y celular, generado por `npm run pruebas:funcionales` |
| [Evidencias: búsqueda semántica](evidencias/busqueda-semantica.md) | La prueba aislada de la IA en la búsqueda: la actual, la del contenido y la semántica con 52 documentos ficticios y 43 búsquedas, con la memoria y el tiempo del modelo; generado por `npm run medir` en `experimentos/busqueda-semantica/` (D43) |
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
4. **Terminar la prueba de humo con personas** de [07 · Despliegue §8](07-despliegue.md). El 9 de octubre se
   hicieron el alta de la empresa, la subida con la cámara, la recuperación de la contraseña por correo y una
   aprobación; faltan buscar y descargar desde el celular, las versiones, las exportaciones y la hoja para
   imprimir. Va antes del congelamiento ([07 §9.1](07-despliegue.md)), que cierra la preparación: etiqueta,
   respaldo y su ensayo.
5. **Después de la evaluación, decidir sobre la IA en la búsqueda** con el asesor: la consulta de búsquedas fallidas y la
   regla de [12 · Búsqueda e IA §5](12-busqueda-e-ia.md) (D43).
