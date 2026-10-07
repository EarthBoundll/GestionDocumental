# Informe de pruebas funcionales

Generado el 7 de octubre de 2026, 12:07 p. m. (hora de Lima) por `npm run pruebas:funcionales` en `frontend/`.

Cada caso recorre un requisito de [01 · Análisis §3](../01-analisis.md) en un navegador Chromium real, como lo haría
una persona: escribe en los formularios, pulsa los botones y comprueba lo que aparece en pantalla. Del otro lado está el
sistema completo: la API con un PostgreSQL 17 propio y vacío al empezar, y la compilación de producción del frontend.
Los casos marcados para el celular se repiten en una pantalla de 360 px (indicador 5). Los datos de partida de cada caso
(su empresa, sus usuarios) se crean por la API, y cada caso usa una empresa propia.

**Resultado: 49 de 49 ejecuciones superadas (37 casos).**

Los 34 requisitos funcionales tienen al menos un caso.

| Requisito | Caso | Escritorio (1280 px) | Celular (360 px) |
|---|---|---|---|
| RF01 | El Master da de alta una empresa con su primer administrador, que entra y encuentra cinco categorías | Superado (1.7 s) | — |
| RF02 | Iniciar sesión con correo y contraseña; si fallan, el mismo mensaje exista o no la cuenta | Superado (1.8 s) | Superado (1.9 s) |
| RF02 | Tras entrar, el menú lleva a cada pantalla sin que nada se salga del ancho de la pantalla | Superado (1.1 s) | Superado (1.2 s) |
| RF03 | Cerrar sesión la revoca en el servidor: el token anterior ya no sirve | Superado (1.1 s) | — |
| RF04 | Cambiar la propia contraseña: hace falta la actual, y la nueva sirve para entrar | Superado (2.1 s) | — |
| RF05, RF19 | Cada acción queda en el historial con su autor, y se filtra por persona y acción | Superado (2.3 s) | — |
| RF05, RF19 | Cada rol entra solo a lo suyo: lo demás responde «sin permiso» y queda en el historial | Superado (3.3 s) | — |
| RF06 | El administrador crea, renombra y desactiva categorías; una inactiva no se ofrece al subir | Superado (1.6 s) | — |
| RF07 | Subir un documento con nombre, categoría, fecha y descripción; el servidor rechaza lo que no es lo que dice ser | Superado (1.7 s) | Superado (2.3 s) |
| RF08 | Quien subió un documento lo edita, y otro usuario no puede editar ni eliminar lo ajeno | Superado (2.4 s) | — |
| RF09 | Eliminar un documento lo saca de las búsquedas, y el administrador puede eliminar lo de otros | Superado (1.6 s) | — |
| RF09, RF26 | Lo eliminado va a la papelera; el administrador lo restaura o lo elimina para siempre | Superado (3.0 s) | — |
| RF10, RF11 | Una empresa no encuentra, no abre y no descarga los documentos de otra, ni con el enlace | Superado (1.7 s) | Superado (1.6 s) |
| RF10 | Buscar por nombre sin importar tildes ni mayúsculas, y filtrar por categoría y fechas | Superado (1.8 s) | Superado (2.0 s) |
| RF11 | Ver un documento en el navegador y descargarlo con su nombre original | Superado (1.4 s) | Superado (1.6 s) |
| RF12 | El tiempo de respuesta del listado se mide en el servidor y en el navegador | Superado (1.2 s) | — |
| RF13 | El administrador crea usuarios, les cambia el nombre y el rol, y restablece su contraseña | Superado (2.4 s) | — |
| RF14 | Desactivar a un usuario le impide entrar y conserva sus documentos; reactivarlo se lo devuelve | Superado (2.8 s) | — |
| RF15, RF17 | La usuaria pide aprobar su documento y los administradores reciben el aviso | Superado (2.4 s) | — |
| RF16 | El administrador rechaza con motivo obligatorio y, tras una nueva solicitud, aprueba | Superado (3.7 s) | — |
| RF16 | Nadie aprueba lo suyo: el administrador que pide aprobación no ve los botones; otro administrador sí | Superado (2.0 s) | — |
| RF17, RF18 | La solicitante recibe la decisión, la consulta en sus solicitudes y marca los avisos como leídos | Superado (2.7 s) | — |
| RF20 | El historial se exporta a CSV con tildes legibles en Excel y su fecha en el nombre | Superado (1.2 s) | — |
| RF21 | Recuperar la contraseña con un enlace de un solo uso que llega por correo | Superado (2.0 s) | — |
| RF22 | El Master edita una empresa y al desactivarla nadie de ella puede entrar hasta que la reactiva | Superado (2.4 s) | — |
| RF23 | El Master añade, edita y desactiva a los administradores de una empresa | Superado (1.7 s) | — |
| RF24 | El Master ve las cifras de cada empresa, pero nunca sus documentos | Superado (1.5 s) | — |
| RF25 | Una categoría restringida y sus documentos solo los ven los administradores y las personas autorizadas | Superado (3.0 s) | — |
| RF25 | Quitar el acceso a alguien surte efecto en su siguiente consulta | Superado (2.3 s) | — |
| RF27 | El Master audita lo que hizo la plataforma, sin ver la actividad dentro de las empresas | Superado (1.3 s) | — |
| RF28 | El tablero muestra el estado de la empresa y lo que registra cada indicador de la tesis | Superado (1.5 s) | Superado (1.6 s) |
| RF29 | El Master genera un respaldo de la base y lo ve en la lista, sin poder descargarlo | Superado (1.0 s) | — |
| RF30 | La ficha cuenta la vida del documento; el administrador ve además quién lo vio | Superado (2.6 s) | Superado (2.4 s) |
| RF31 | El administrador da a su empresa nombre comercial, color y logo, y su gente lo ve | Superado (3.6 s) | Superado (3.6 s) |
| RF32 | Cada persona elige claro u oscuro y la elección la sigue a otro dispositivo | Superado (2.3 s) | Superado (2.6 s) |
| RF33 | La imagen o el PDF se ven dentro de la ficha, y verlos queda en su actividad | Superado (3.4 s) | Superado (3.3 s) |
| RF34 | Una versión nueva no pisa la anterior, y restaurar una crea otra sin borrar nada | Superado (1.8 s) | Superado (1.9 s) |

## Cobertura por requisito

| Requisito | Casos |
|---|---|
| RF01 | 1 |
| RF02 | 2 |
| RF03 | 1 |
| RF04 | 1 |
| RF05 | 2 |
| RF06 | 1 |
| RF07 | 1 |
| RF08 | 1 |
| RF09 | 2 |
| RF10 | 2 |
| RF11 | 2 |
| RF12 | 1 |
| RF13 | 1 |
| RF14 | 1 |
| RF15 | 1 |
| RF16 | 2 |
| RF17 | 2 |
| RF18 | 1 |
| RF19 | 2 |
| RF20 | 1 |
| RF21 | 1 |
| RF22 | 1 |
| RF23 | 1 |
| RF24 | 1 |
| RF25 | 2 |
| RF26 | 1 |
| RF27 | 1 |
| RF28 | 1 |
| RF29 | 1 |
| RF30 | 1 |
| RF31 | 1 |
| RF32 | 1 |
| RF33 | 1 |
| RF34 | 1 |
