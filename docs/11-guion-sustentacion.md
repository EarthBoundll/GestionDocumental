# 11 · Guion de la sustentación (borrador)

**Estado:** borrador para revisar con el asesor. Los resultados de la evaluación se completan después de la
posprueba; aquí van marcados **[Por completar]**.

Diez minutos de exposición con demostración en vivo, y después las preguntas del jurado. La demostración
sigue el mismo orden que los casos `@demo` de las pruebas funcionales, así que el plan B (§4) muestra lo
mismo aunque falle Internet.

## 1. Preparación

| Cuándo | Qué |
|---|---|
| Una semana antes | Supabase no está pausado; *Respaldos* muestra uno de cada noche (docs/07 §9) y el último pasa `npm run respaldo -- ensayar` |
| Dos días antes | Empresa de demostración creada por el Master, por ejemplo «Taller Demostración (ficticio)», con su administradora y una usuaria. Sus 40 documentos ficticios: `npm run documentos-de-prueba -- lote --subir` (D34). Una categoría restringida, una solicitud aprobada y otra pendiente. Una segunda empresa con un documento, para la prueba de aislamiento |
| El día anterior | Se ensaya el guion con cronómetro, dos veces, y se graba la pantalla de uno de los ensayos. Se ejecuta `npm run pruebas:demo` en la laptop del plan B |
| Dos minutos antes | Abrir `/api/v1/salud` (R1). Iniciar sesión: la usuaria en el celular, la administradora en la PC, la otra empresa en una ventana privada. El celular se proyecta con su cable o con la herramienta del aula |

## 2. Minuto a minuto

| Tiempo | Qué se dice | Qué se muestra |
|---|---|---|
| 0:00–1:00 | **El problema.** En el taller los documentos viven en papel, carpetas y chats: buscar uno toma minutos y nadie sabe quién lo movió. Lo que midió la preprueba: **[Por completar]** | Una diapositiva con los tiempos y la tasa de recuperación de la preprueba |
| 1:00–2:30 | **La solución.** Un sistema web en la nube, multiempresa, con costo cero: Vercel, Render y Supabase. Cada empresa ve solo lo suyo porque lo decide la propia base de datos (RLS), no solo el código | El diagrama de docs/02 §1. Una línea por decisión: D6, D17, D9, D13 |
| 2:30–3:15 | **Buscar y recuperar (indicadores 2, 3 y 5).** La usuaria, desde su celular, busca «remision», sin tilde ni mayúscula, y abre la vista previa de una guía | El celular proyectado: el listado filtrado y la ficha con su vista previa |
| 3:15–4:00 | **Organizar (indicador 1).** Sube una guía con su categoría y fecha; aparece en el listado | La subida desde el celular |
| 4:00–4:45 | **Aprobar.** Pide la aprobación; la administradora la aprueba en la PC y la campana avisa a ambas | La PC y el celular, uno junto al otro |
| 4:45–5:45 | **Trazabilidad (indicador 4).** Cada paso quedó en el historial, con quién, cuándo y desde qué dispositivo. La ficha cuenta la vida del documento. La hoja imprimible es el anexo firmado de cada sesión | *Historial*, la actividad de la ficha e *Imprimir* |
| 5:45–6:45 | **Aislamiento (indicador 6).** Desde la otra empresa se pega el enlace de un documento del taller: no existe para ella. Se intentó lo mismo contra cada operación: 62 de 62 respuestas correctas | La ventana privada con el 404, y el informe de docs/evidencias |
| 6:45–7:30 | **El tablero (indicador 7).** El administrador ve los siete indicadores en vivo, con el tiempo de respuesta de cada listado | *Tablero* |
| 7:30–9:00 | **Resultados.** Preprueba frente a posprueba de cada indicador, con su prueba estadística (Wilcoxon o t de Student, según la normalidad): **[Por completar]**. Calidad del software: 365 pruebas del backend y 95 del frontend, 60 ejecuciones funcionales en escritorio y celular, y la prueba de carga con 50.000 documentos, que encontró un cuello de botella y lo corrigió (de 1,9 s a 14 ms) | Una diapositiva de resultados y otra de evidencias |
| 9:00–10:00 | **Conclusiones y trabajo futuro.** Qué objetivos se cumplieron y qué queda fuera a propósito: etiquetas, OCR, firma digital y aprobación en varios niveles | La última diapositiva |

## 3. Preguntas probables del jurado

Respuestas de una o dos frases; el detalle está en la decisión que se cita.

| Pregunta | Respuesta corta |
|---|---|
| ¿Qué impide que una empresa vea a otra? | Tres capas: la consulta filtra, la base aplica RLS con la empresa de la sesión y las claves foráneas compuestas impiden mezclar filas. La empresa sale de la sesión, nunca de lo que envía el navegador (D17, D6) |
| ¿Y si un programador olvida un `WHERE`? | La base no le da filas ajenas: RLS. Una prueba exige política de aislamiento en toda tabla con `empresa_id` (D17) |
| ¿El Master puede leer los documentos? | No: tiene su propio acceso, que ve empresas y cifras, nunca contenido. Su auditoría solo ve lo de la plataforma (D18, D24) |
| ¿Escala? | Con 50.000 documentos el listado tarda 14 ms y la búsqueda 0,3 s en el servidor. La prueba encontró que la RLS evaluaba una función por fila y se corrigió (D31) |
| ¿Por qué en la nube y no en un servidor del taller? | Acceso desde el celular y desde cualquier lugar (indicador 5), sin equipo ni mantenimiento para una MYPE, y costo cero en capa gratuita (D11, D13) |
| ¿Qué pasa si se pierde la base? | Respaldo nocturno en un bucket privado, 30 días, con la restauración probada en una base vacía; un comando la ensaya en una base desechable antes de cada hito (D25, D35) |
| ¿Cómo saben que el sistema no cambió durante la evaluación? | Una etiqueta de versión en git, ninguna fusión ni despliegue hasta la última posprueba, y un respaldo del estado inicial con su restauración ensayada (D35) |
| ¿Por qué JWT si se puede robar? | Viaja en la cabecera, caduca y se comprueba contra la base en cada petición: cerrar sesión o desactivar a alguien vale al instante (D4, D5) |
| ¿Cómo se mide que el historial registre todo? | El evaluador ejecuta un guion de acciones y se cuentan en el historial (indicador 4). Por diseño cada acción se registra en la misma transacción (D7) |
| ¿Qué hacen con los datos personales? | Consentimiento que nombra la transferencia a EE. UU. (Ley 29733), datos mínimos, documentos sin datos de terceros, y al cierre un procedimiento probado que borra todo, también de los respaldos (D33) |
| ¿Por qué no IA, OCR o firma digital? | Están fuera del alcance a propósito: no los pide ningún indicador. Quedan como trabajo futuro |
| ¿Qué pasa si suben un ejecutable con extensión .pdf? | Se rechaza: el servidor exige que la extensión y los primeros bytes coincidan (RN09) |
| ¿Cuáles son las limitaciones? | Una muestra pequeña y un solo caso de validación; Render gratuito, que puede tardar en despertar (mitigado con el monitor); la búsqueda por nombre no usa su índice con RLS (medido, 0,3 s); aprobación de un solo nivel |

## 4. Si algo falla en vivo

| Falla | Qué hacer |
|---|---|
| La API tarda en responder | Ya se abrió `/salud` antes (R1); si aun así tarda, se explica mientras despierta: es la capa gratuita |
| Sin Internet en el aula | `npm run pruebas:demo` en la laptop: los mismos pasos en un navegador visible, contra el sistema local (D16) |
| El celular no se proyecta | La PC con el navegador en modo celular (360 px): es lo mismo que prueban las ejecuciones `@movil` |
| Todo lo anterior | Un vídeo de la pantalla grabado durante el ensayo del día anterior, con este mismo guion |
