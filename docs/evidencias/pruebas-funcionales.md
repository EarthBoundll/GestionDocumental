# Informe de pruebas funcionales

Generado el 9 de octubre de 2026, 7:32 p. m. (hora de Lima) por `npm run pruebas:funcionales` en `frontend/`.

Cada caso recorre un requisito de [01 · Análisis §3](../01-analisis.md) en un navegador Chromium real, como lo haría
una persona: escribe en los formularios, pulsa los botones y comprueba lo que aparece en pantalla. Del otro lado está el
sistema completo: la API con un PostgreSQL 17 propio y vacío al empezar, y la compilación de producción del frontend.
Los casos marcados para el celular se repiten en una pantalla de 360 px (indicador 5). Los datos de partida de cada caso
(su empresa, sus usuarios) se crean por la API, y cada caso usa una empresa propia.

**Resultado: 64 de 64 ejecuciones superadas (45 casos).**

Los 38 requisitos funcionales tienen al menos un caso.

| Requisito | Caso | Escritorio (1280 px) | Celular (360 px) |
|---|---|---|---|
| D40 | El acceso se mueve sin pesar: se detiene con «reducir movimiento» y la contraseña se puede ver | Superado (3.4 s) | Superado (3.4 s) |
| RF01, RF37 | El Master da de alta una empresa con su primer administrador, que activa su cuenta con su correo, entra y encuentra cinco categorías | Superado (5.0 s) | — |
| RF02 | Iniciar sesión con correo y contraseña; si fallan, el mismo mensaje exista o no la cuenta | Superado (2.4 s) | Superado (2.0 s) |
| RF02 | Tras entrar, el menú lleva a cada pantalla sin que nada se salga del ancho de la pantalla | Superado (1.3 s) | Superado (1.5 s) |
| RF03 | Cerrar sesión pide confirmación y la revoca en el servidor: el token anterior ya no sirve | Superado (3.3 s) | Superado (3.2 s) |
| RF04 | Cambiar la propia contraseña: hace falta la actual, y la nueva sirve para entrar | Superado (3.8 s) | — |
| RF05, RF19 | Cada acción queda en el historial con su autor, y se filtra por persona y acción | Superado (3.9 s) | — |
| RF05, RF19 | Cada rol entra solo a lo suyo: lo demás responde «sin permiso» y queda en el historial | Superado (5.1 s) | — |
| RF06 | El administrador crea, renombra y desactiva categorías; una inactiva no se ofrece al subir | Superado (3.2 s) | — |
| RF07 | Subir un documento con nombre, categoría, fecha y descripción; el servidor rechaza lo que no es lo que dice ser | Superado (2.7 s) | Superado (3.0 s) |
| RF07 | En el celular, un papel se sube con «Tomar foto», que abre la cámara | Superado (1.5 s) | Superado (2.0 s) |
| RF08 | Quien subió un documento lo edita, y otro usuario no puede editar ni eliminar lo ajeno | Superado (4.8 s) | — |
| RF09 | Eliminar un documento lo saca de las búsquedas, y el administrador puede eliminar lo de otros | Superado (2.9 s) | — |
| RF09, RF26 | Lo eliminado va a la papelera; el administrador lo restaura o lo elimina para siempre | Superado (5.9 s) | — |
| RF10, RF11 | Una empresa no encuentra, no abre y no descarga los documentos de otra, ni con el enlace | Superado (2.1 s) | Superado (2.1 s) |
| RF10 | Buscar por nombre sin importar tildes ni mayúsculas, y filtrar por categoría y fechas | Superado (2.3 s) | Superado (2.4 s) |
| RF10 | En el celular el nombre se lee entero, y al buscar se cierra el teclado con el resultado a la vista | Superado (2.4 s) | Superado (2.5 s) |
| RF11 | Ver un documento en el navegador y descargarlo con su nombre original | Superado (1.8 s) | Superado (2.9 s) |
| RF12 | El tiempo de respuesta del listado se mide en el servidor y en el navegador | Superado (1.7 s) | — |
| RF13, RF37, RF38 | El administrador invita a una persona y ve que está pendiente; reenviar enseguida se frena; ella activa su cuenta con su correo; él le cambia el nombre y el rol, y restablece su contraseña | Superado (10.2 s) | — |
| RF14 | Desactivar a un usuario le impide entrar y conserva sus documentos; reactivarlo se lo devuelve | Superado (3.7 s) | — |
| RF15, RF17 | La usuaria pide aprobar su documento y los administradores reciben el aviso | Superado (3.2 s) | — |
| RF16 | El administrador rechaza con motivo obligatorio y, tras una nueva solicitud, aprueba | Superado (10.9 s) | — |
| RF16 | Nadie aprueba lo suyo: el administrador que pide aprobación no ve los botones; otro administrador sí | Superado (4.0 s) | — |
| RF17, RF18 | La solicitante recibe la decisión, la consulta en sus solicitudes y marca los avisos como leídos | Superado (6.9 s) | — |
| RF20 | El historial se exporta a CSV con tildes legibles en Excel y su fecha en el nombre | Superado (1.4 s) | — |
| RF21 | Recuperar la contraseña con un enlace de un solo uso que llega por correo | Superado (2.6 s) | — |
| RF22 | El Master edita una empresa y al desactivarla nadie de ella puede entrar hasta que la reactiva | Superado (7.4 s) | — |
| RF23, RF38 | El Master añade a un administrador, que queda pendiente de activar, lo edita y lo desactiva | Superado (6.7 s) | — |
| RF24 | El Master ve las cifras de cada empresa, pero nunca sus documentos | Superado (2.4 s) | — |
| RF25 | Una categoría restringida y sus documentos solo los ven los administradores y las personas autorizadas | Superado (4.5 s) | — |
| RF25 | Quitar el acceso a alguien surte efecto en su siguiente consulta | Superado (5.4 s) | — |
| RF27 | El Master audita lo que hizo la plataforma, sin ver la actividad dentro de las empresas | Superado (1.6 s) | — |
| RF28 | El tablero muestra el estado de la empresa y lo que registra cada indicador de la tesis | Superado (3.5 s) | Superado (1.9 s) |
| RF29 | El Master genera un respaldo de la base y lo ve en la lista, sin poder descargarlo | Superado (2.8 s) | — |
| RF30 | La ficha cuenta la vida del documento; el administrador ve además quién lo vio | Superado (5.1 s) | Superado (5.2 s) |
| RF31 | El administrador da a su empresa nombre comercial, color y logo, y su gente lo ve | Superado (6.8 s) | Superado (6.8 s) |
| RF31 | El fondo de la empresa: su tono en claro y en oscuro, y una imagen detrás solo en la computadora | Superado (18.7 s) | Superado (19.6 s) |
| RF32 | Cada persona elige claro u oscuro y la elección la sigue a otro dispositivo | Superado (3.5 s) | Superado (4.5 s) |
| RF33 | La imagen o el PDF se ven dentro de la ficha, y verlos queda en su actividad | Superado (6.6 s) | Superado (6.7 s) |
| RF34 | Una versión nueva no pisa la anterior, y restaurar una crea otra sin borrar nada | Superado (3.3 s) | Superado (2.6 s) |
| RF35 | El administrador exporta el inventario documental en CSV, con lo filtrado en la pantalla | Superado (2.4 s) | — |
| RF36 | El historial filtrado se imprime entero, sin menús y en claro aunque la persona use el modo oscuro | Superado (5.1 s) | — |
| RF37 | Una cuenta invitada no entra hasta abrir su invitación; la abre en el celular, elige su contraseña y entra | Superado (4.6 s) | Superado (4.9 s) |
| RNF10 | Desde el inicio de sesión, sin cuenta: pedir una cuenta por correo y leer los términos y la privacidad | Superado (1.1 s) | Superado (1.3 s) |

## Cobertura por requisito

| Requisito | Casos |
|---|---|
| RF01 | 1 |
| RF02 | 2 |
| RF03 | 1 |
| RF04 | 1 |
| RF05 | 2 |
| RF06 | 1 |
| RF07 | 2 |
| RF08 | 1 |
| RF09 | 2 |
| RF10 | 3 |
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
| RF31 | 2 |
| RF32 | 1 |
| RF33 | 1 |
| RF34 | 1 |
| RF35 | 1 |
| RF36 | 1 |
| RF37 | 3 |
| RF38 | 2 |
