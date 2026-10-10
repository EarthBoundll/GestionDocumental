# 13 · Informe final: verificación del correo y buscador avanzado

Fase 5 del pedido de octubre de 2026, escrita el 10 de octubre de 2026. Las dos mejoras están en producción:

| Mejora | PR | Migración | En producción |
|---|---|---|---|
| Verificación del correo | [PR 17](https://github.com/EarthBoundll/GestionDocumental/pull/17) | 013 | 00:55 UTC del 10 de octubre |
| Buscador avanzado | [PR 18](https://github.com/EarthBoundll/GestionDocumental/pull/18) | 014 | 03:04 UTC del 10 de octubre |

La comparación sobre la IA está en [12 · Búsqueda e IA](12-busqueda-e-ia.md).

Este informe no afirma que el sistema sea completamente seguro ni que esté listo para un uso comercial. Dice qué se
probó, cómo y con qué resultado, y qué falta probar (§7 y §8).

## 1. Qué se hizo

### Verificación obligatoria del correo (D41, RF37, RF38, RN35–RN38)

- **Alta sin contraseña.** Quien crea una cuenta ya no le pone contraseña: el Master crea administradores y el
  administrador crea a su gente. La cuenta nace *pendiente* y a la persona le llega una invitación válida 72 horas.
  Al abrirla elige su contraseña, que nadie más conoce, y con eso prueba que el buzón es suyo.
- **Sin correo verificado no hay sesión**, para ningún rol. La sesión se comprueba en la base en cada petición.
- **Cuentas anteriores a la migración 013.** Las que ya tenían contraseña reciben un enlace para confirmar el
  correo cuando entran con la contraseña correcta. Con una contraseña equivocada, la respuesta es la de siempre.
- **Recuperar la contraseña** también verifica el correo. A una cuenta pendiente, le reenvía la invitación.
- **Estado de cada cuenta.** El administrador y el Master ven «Pendiente de activar», «Verificado» o «Desactivado»,
  y pueden reenviar la invitación con freno: una cada 2 minutos y 5 al día por buzón.
- **Nadie marca un correo como verificado.** La base no deja escribir esa columna a la aplicación.
- **Correos temporales.** Se rechazan unos 50 dominios conocidos, como complemento; lo que prueba el buzón es la
  invitación.

### Buscador avanzado (D42, RF10, RN39, RN40)

- **Palabras en cualquier orden.** Busca en el nombre, el archivo, la descripción y la categoría.
- **Tolera variaciones:** ignora mayúsculas, tildes y espacios de más, reconoce fragmentos («contra», «0245») y
  entiende la raíz en español («facturas proveedores» encuentra «Factura de proveedor - octubre»).
- **Errores de escritura.** Una segunda pasada busca parecidos, solo si no hubo coincidencias exactas, y los marca
  como tales. Los números nunca se aproximan.
- **Relevancia explicable.** Cada resultado dice dónde coincidió.
- **Filtros nuevos:** tipo, estado de aprobación, quién lo subió y fecha del documento o de subida, con atajos.
  - Se combinan con la categoría y el texto.
  - Se ven como etiquetas que se quitan una a una, y hay un botón «Limpiar filtros».
- **Sugerencias mientras se escribe.**
  - Aparecen tras 300 ms y desde dos letras, con la misma consulta y la misma RLS que la búsqueda.
  - Se recorren con el teclado.
  - No se registran; elegir una sí queda registrado.
- **La búsqueda sigue ocurriendo al confirmarla (D36):** cada búsqueda es una acción del historial.

### Lo que no se hizo, a propósito

- **IA y búsqueda en el contenido de los archivos.** La comparación y la recomendación están en el documento 12
  (§11).
- **Registro público.** Sigue sin existir (decisión B de la v2), así que el flujo del pedido en que «el usuario
  inicia el registro» no aplica: toda cuenta la crea el Master o el administrador de su empresa.
- **Autenticación con Google u otra red social.** El sistema no la tiene, así que no había nada que adaptar.
- **Comprobar el buzón con un servicio externo.** Se descartó en D41: manda los correos a un tercero y cuesta.
- **Una excepción del Master en producción.** No existe ningún atajo que salte la verificación (§5).

## 2. Archivos modificados

El PR 17 cambió 66 archivos y el PR 18, 41. La lista exacta sale de `git show --stat 8d199b7` y `git show --stat
457ad83`. Lo principal, por capa:

| Capa | Verificación (D41) | Buscador (D42) |
|---|---|---|
| Base de datos | `migraciones/013_verificacion_de_correo.sql` | `migraciones/014_busqueda_documental.sql` |
| API | Módulo `auth`: `enlaces.ts` (nuevo), servicio, repositorio, correos, esquemas y rutas. Módulos `usuarios` y `plataforma`: reenvío y estado de cada cuenta. `compartido/correos-desechables.ts` (nuevo) | Módulo `documentos`: `busqueda.ts` (nuevo), repositorio, servicio, esquemas, controlador y rutas. `compartido/tipos-de-archivo.ts`, y `respaldos/respaldo.ts`, que excluye las columnas generadas |
| Frontend | `paginas/auth/ActivarCuenta`, `VerificarCorreo` y `DefinirClave` (nuevas). `admin/Usuarios`, `plataforma/NuevaEmpresa` y `DetalleEmpresa`. `componentes/Insignia` | `paginas/documentos/BuscadorDeDocumentos` (nueva) y `ListaDocumentos`. `utilidades/busqueda.ts` (nueva) |
| Pruebas | `verificacion.test.ts` (nueva, 23 pruebas), `Invitacion.test.tsx` y `Usuarios.test.tsx` (nuevas). Ampliadas: aislamiento, recuperación, usuarios, plataforma y las funcionales | `busqueda.test.ts` (nueva, 18 pruebas) y `Busqueda.test.tsx` (nueva, 10). Ampliadas: carga, aislamiento, esquema, documentos y las funcionales |
| Documentación | D41, RF37–RF38, RN35–RN38, endpoints, despliegue (§8.1), protocolo y consentimiento | D42, RF10, RN39–RN40, modelo de datos, endpoints, guion de la sustentación |

El PR 3 (este) añade solo documentación:

- [12 · Búsqueda e IA](12-busqueda-e-ia.md) y este informe;
- D43 en `docs/02` y en el `CLAUDE.md`;
- la respuesta sobre la IA en el guion (`docs/11`);
- el índice de `docs/README.md`;
- en el `README.md`, qué ejecuta la integración continua, que estaba descrito de más;
- los comentarios del correo en `backend/.env.example`.

## 3. Decisiones técnicas

Cada decisión, con lo descartado, está en [02 · Arquitectura §7](02-arquitectura.md).

- **D41 · La cuenta nace sin contraseña y se activa con la invitación.**
  - Los tres enlaces comparten tabla con la recuperación (D19): invitación, confirmación del correo y recuperación.
  - Cada uno guarda su propósito y el buzón al que salió.
  - El freno de reenvíos se cuenta en la base.
  - El Master lo verifica el script de inicialización.
  - *Se descartaron:* una contraseña inicial puesta por otro, un código de seis dígitos, Supabase Auth, un
    interruptor para saltar la verificación en desarrollo y una API de validación de correos.
- **D42 · Búsqueda por palabras con PostgreSQL.**
  - Tres columnas generadas: el texto normalizado y un `tsvector` en español.
  - Una pasada por parecido, solo si no hay resultados exactos.
  - Se quitó el índice de trigramas: con la RLS no se usaba, y lo comprobé con `EXPLAIN`.
  - *Se descartaron:* un motor externo, buscar mientras se escribe y un vocabulario para corregir errores.
- **D43 · La búsqueda sigue sin IA y sin leer los archivos.** Lo decidirán las búsquedas fallidas de la
  evaluación, con una consulta ya probada.

## 4. Medidas de seguridad

### Las cuentas

| Riesgo | Medida | Prueba (`verificacion.test.ts`, salvo indicación) |
|---|---|---|
| Una cuenta sin verificar usa el sistema | Sin correo verificado no hay sesión, y se comprueba en la base en cada petición | 3, 13 |
| El administrador marca un correo como verificado | Los roles de la aplicación no pueden escribir `email_verificado_en`, y un trigger la anula si el correo cambia | 12 (la base y la API) |
| Un enlace verifica otra cuenta, o sirve dos veces o tarde | Huella SHA-256, gasto atómico, 72 horas, propósito y buzón de destino | 5, 6, «un enlace de invitación no sirve para restablecer otra cuenta», «un enlace enviado al correo anterior no verifica el nuevo» |
| El token queda en algún registro | Viaja en el fragmento `#` de la URL, que el navegador no envía al servidor, y la base solo guarda su huella | 4 |
| Inundar un buzón con reenvíos | 2 minutos entre reenvíos y 5 al día por buzón, contados en la base | 8 |
| Averiguar si un correo tiene cuenta | La misma respuesta al iniciar sesión y al recuperar; un correo de otra empresa se rechaza sin decir de cuál | 3, 7, 9 |
| Ganar privilegios con lo que manda el cliente | La API ignora el rol, la empresa o la verificación que lleguen en la petición; el rol y la empresa salen de la sesión en la base | 12 |
| Adivinar contraseñas | Bloqueo tras 5 fallos en 15 minutos por cuenta (RN27) y límite por IP | `auditoria-y-bloqueo.test.ts`; aceptar la invitación pone el bloqueo a cero |
| Correos duplicados | `unique (email)` desde la migración 001, con el correo en minúsculas y sin espacios. En producción: 4 cuentas, ninguna duplicada ni con mayúsculas | 7 |
| Correos temporales | Lista de unos 50 dominios conocidos, sin consultar a nadie. No los detecta todos, y no lo pretende | «rechaza dominios de correos temporales conocidos» |
| Una cuenta desactivada sigue activándose | No acepta su invitación ni recibe otra | 10 |

### El buscador (§5.6 del pedido)

| Exigencia | Cómo se cumple | Prueba |
|---|---|---|
| No cambiar de empresa manipulando parámetros | La empresa sale del token y de la sesión en la base; el `empresaId` que mande el cliente se ignora, y la RLS filtra | `busqueda.test.ts` 11; informe de aislamiento |
| Ningún documento de otra empresa | La RLS, también en las sugerencias, en la pasada por parecido y al elegir una sugerencia | [Aislamiento](evidencias/aislamiento-entre-empresas.md): 71 de 71 |
| Las sugerencias no descubren documentos restringidos | Usan la misma consulta y la misma RLS que la búsqueda (D22) | `busqueda.test.ts` 10 |
| Lo eliminado no aparece | La papelera queda fuera de la búsqueda y de las sugerencias | `busqueda.test.ts` 9 |
| Sin inyección | Las palabras llegan sin signos y como parámetros: no hay comodines ni operadores que escapar | `busqueda.test.ts` 12 |
| Filtros validados en el servidor | Esquemas en la API: tipos, estados, fechas y uuid | «los filtros se validan en el servidor» |

Sobre «quién lo subió»:

- La pantalla solo le ofrece al usuario «Solo los que subí yo», porque la lista de sus colegas (`GET /usuarios`)
  es del administrador.
- La API acepta cualquier persona en ese filtro. No es una fuga: el listado ya muestra quién subió cada documento
  que esa persona puede ver, así que filtrar por ese dato no le muestra nada nuevo.

## 5. La cuenta Master

- **Crearla.**
  - Se hace una sola vez, con `npm run crear-master` en `backend/`, que lee `MASTER_EMAIL`, `MASTER_PASSWORD`,
    `MASTER_NOMBRE` y `MASTER_DNI` del `.env` ([07 · Despliegue §6](07-despliegue.md)).
  - La contraseña necesita 12 caracteres o más, sin el DNI, sin el correo y sin ser solo números.
  - Si la cuenta ya existe, el script no hace nada. No hay registro de un Master desde la interfaz.
- **Verificarla.**
  - El script la crea ya verificada: la crea quien controla la base y el entorno, que es más de lo que probaría un
    enlace.
  - El Master de producción existía antes de la 013, y la migración lo dejó verificado. Lo comprobé en
    producción.
- **Administrarla.**
  - Cambia su contraseña en *Mi cuenta* y la recupera por correo, como cualquiera.
  - Sus acciones quedan en la auditoría de la plataforma (D24).
- **Probar con ella sin abrir un atajo.**
  - El Master de pruebas solo existe en bases desechables:
    - `npm run local` lo crea en un PostgreSQL propio, con los `MASTER_*` del `.env` de cada máquina;
    - las pruebas funcionales lo crean con valores ficticios en su propia base desechable, dentro de una carpeta
      temporal.
  - Esos valores no sirven en ningún otro lugar: en producción ese correo no existe.
  - No hay variable que desactive la verificación, ni credenciales compartidas. La prueba 13 comprueba que en
    producción rige igual.

## 6. Cómo funciona el correo y cómo se configura

Los correos se envían por la API HTTPS de Brevo (D19): 300 al día gratis y sin dominio propio. Render bloquea
SMTP.

1. **Crear la cuenta y el remitente.** En Brevo:
   - crea la cuenta gratuita;
   - en *Senders*, añade el correo remitente y verifícalo con el enlace que te llega;
   - en *SMTP & API → API Keys*, genera una clave.
2. **Configurar Render.** Pon las variables de la API:

   | Variable | Valor |
   |---|---|
   | `CORREO` | `brevo` (ya en `render.yaml`) |
   | `BREVO_CLAVE_API` | La clave del paso anterior |
   | `CORREO_REMITENTE` | El correo verificado |
   | `CORREO_REMITENTE_NOMBRE` | Opcional |
   | `URL_FRONTEND` | La dirección del frontend, sin barra final; los enlaces de los correos apuntan ahí |

3. **En desarrollo, nada de eso hace falta.** Con `CORREO=archivo`, cada correo se guarda en una carpeta
   (`backend/.local/correos` con `npm run local`), y las pruebas activan las cuentas leyendo de ahí.

Ninguna clave va en el código ni en el repositorio: viven en Render y en el `.env` de cada máquina. El detalle
completo está en [07 · Despliegue §2–3](07-despliegue.md).

## 7. Pruebas ejecutadas y resultados

### Las suites

Todas corrieron antes de fusionar el PR 18, y su resultado se verificó. La integración continua repitió en GitHub
tres de ellas sobre `main`, en verde con los dos commits:

- el backend, que incluye la batería de aislamiento;
- el frontend;
- las funcionales.

| Prueba | Resultado | Dónde |
|---|---|---|
| Backend (PostgreSQL 17 real) | 406 pasan, más 1 omitida: la de carga, que corre aparte | `backend/tests` |
| Frontend | 121 pasan | `frontend/src/**/*.test.tsx` |
| Funcionales en un navegador real, con la compilación de producción | 66 de 66 ejecuciones en 46 casos, en escritorio y en el celular a 360 px | [Pruebas funcionales](evidencias/pruebas-funcionales.md) |
| Aislamiento entre empresas | 71 de 71 intentos de A contra B correctos | [Aislamiento](evidencias/aislamiento-entre-empresas.md) |
| Carga con 50.000 documentos | 23 de 23 escenarios dentro de su umbral | [Prueba de carga](evidencias/prueba-de-carga.md) |

### Los casos que pidió el pedido

Verificación del correo (§8 del pedido):

| Caso | Prueba |
|---|---|
| 1–2 · correo válido y cuenta pendiente | `verificacion.test.ts` «1 y 2» |
| 3 · sin acceso antes de verificar | `verificacion.test.ts` «3» (dos pruebas) |
| 4 · verificación exitosa | `verificacion.test.ts` «4» |
| 5 · enlace caducado | `verificacion.test.ts` «5» |
| 6 · enlace reutilizado | `verificacion.test.ts` «6» |
| 7 · correo duplicado | `verificacion.test.ts` «7» |
| 8 · reenvío con freno | `verificacion.test.ts` «8» |
| 9 · recuperación de contraseña | `verificacion.test.ts` «9» (dos pruebas) |
| 10 · cuenta desactivada | `verificacion.test.ts` «10» |
| 11 · el Master | `verificacion.test.ts` «11» |
| 12 · sin privilegios elevados | `verificacion.test.ts` «12» (la base y la API) |
| 13 · producción | `verificacion.test.ts` «13» |
| La invitación en un navegador | `e2e/plataforma.spec.ts` y `e2e/administracion.spec.ts` |

Buscador (§8 del pedido):

| Caso | Prueba |
|---|---|
| 1–12 | `busqueda.test.ts`, numeradas igual |
| 13 · rendimiento | `tests/carga/carga.test.ts` |
| 14 · celular | `e2e/documentos.spec.ts`, caso RF10 `@movil` |

### Hallazgos que corrigieron las pruebas

- **Un número inexistente devolvía 86 documentos.** Buscar un número que no existe traía documentos con números
  vecinos. Ahora los números nunca se aproximan.
- **La pasada por parecido superaba 1 s.** Ahora compara solo con el nombre: unos 500 ms.
- **Las consultas del conteo y del CSV fallaban.** PostgreSQL no podía tipar unos parámetros de la relevancia que no
  usaban.
- **Un reenvío de invitación frenaba al correo nuevo.** El freno contaba los envíos al correo anterior de la misma
  cuenta. Ahora se cuenta por buzón.
- **Un enlace del correo anterior podía verificar el nuevo.** Ahora un enlace solo vale mientras su buzón siga
  siendo el correo de la cuenta.

### Comprobado en producción tras desplegar

- **Base de datos:**
  - las migraciones 013 y 014 constan en `esquema_migraciones`;
  - las tres columnas generadas existen y los 4 documentos tienen su texto de búsqueda;
  - el índice de trigramas ya no está.
- **Cuentas:** el Master está verificado. El administrador y la usuaria de la empresa de prueba están pendientes,
  como se esperaba: confirmarán su correo al entrar.
- **Servicios:** el monitor de `/salud` responde 200. Vercel publicó el frontend del mismo commit.
- **Respaldo:** el nocturno de las 08:00 UTC del 10 de octubre ya se hizo con el código nuevo.

### Lo que no está probado

- **El recorrido por personas en producción.** Faltan dos puntos de la prueba de humo
  ([07 · Despliegue §8](07-despliegue.md)): la invitación llegando a un buzón real y la búsqueda desde el celular.
- **El rendimiento en producción.** Se midió en local con 50.000 documentos. Render gratuito tiene 0,1 CPU, así que
  en producción todo será más lento, en especial la pasada por parecido. Lo medirá el indicador 7 en la evaluación.
- **La entrega de las invitaciones.** No se midió cuántas llegan a la bandeja de entrada y cuántas a *Spam*.

## 8. Riesgos pendientes

| Riesgo | Qué hacer |
|---|---|
| Las invitaciones caen en *Spam*: se envían sin dominio propio | En la capacitación, pedir que revisen *Spam*. Crear las cuentas días antes y comprobar que se activaron (`docs/09`) |
| Una persona de la evaluación no puede abrir su correo durante la capacitación | Ya está en el protocolo y el consentimiento: cada participante usa un correo que pueda abrir |
| La pasada por parecido se acerca a 1 s en Render | Medirlo en la prueba de humo. Si pasa del umbral, subir el mínimo de letras o el umbral de similitud, que es un cambio de dos números con sus pruebas |
| La búsqueda no usa índices con la RLS, así que el tiempo crece con los documentos | Con 50.000 documentos sigue bajo 1 s. Una MYPE de la evaluación tendrá cientos |
| La lista de correos temporales envejece | Es un complemento: lo que protege es la invitación. Se suma un dominio con su prueba |
| El límite por IP vive en la memoria de la API | Con una sola instancia, como en Render gratuito, alcanza. El bloqueo por cuenta está en la base |
| Las migraciones no tienen versión hacia atrás | Para volver atrás se despliega el código anterior, que no lee las columnas nuevas; las columnas pueden quedarse. Un respaldo solo se restaura con el código con que se hizo (§7.1 del despliegue) |
| Las cuentas anteriores a la 013 deben confirmar su correo | En producción, el administrador y la usuaria de la empresa de prueba. Les llega el enlace al entrar con su contraseña |

## 9. Cómo ejecutar las pruebas

Requisitos: Node 24. No hace falta instalar PostgreSQL, porque las pruebas levantan el suyo, desechable. Deben
ejecutarse como un usuario normal, no como `root`: PostgreSQL no arranca como administrador.

| Dónde | Comando | Qué prueba |
|---|---|---|
| `backend/` | `npm test` | Las 406 pruebas del backend, entre ellas `verificacion.test.ts` y `busqueda.test.ts` |
| `backend/` | `npx vitest run tests/integracion/busqueda.test.ts` | Una sola suite, aquí la del buscador |
| `backend/` | `npm run informe:aislamiento` | La batería de A contra B, que reescribe su informe en `docs/evidencias/` |
| `backend/` | `npm run informe:carga` | Los 50.000 documentos, en unos dos minutos, que reescribe su informe |
| `frontend/` | `npm test` | Las 121 pruebas de pantallas |
| `frontend/` | `npm run pruebas:funcionales` | Las funcionales en Chromium contra el sistema completo. La primera vez: `npx playwright install chromium` |

GitHub Actions ejecuta tres cosas en cada push a `main` y en cada pull request:

- las pruebas del backend, que incluyen la batería de aislamiento;
- las del frontend;
- las funcionales.

La prueba de carga y los informes se ejecutan a mano.

## 10. Lo que sigue

- Terminar la prueba de humo en producción: la invitación a un buzón real, y buscar y descargar desde el celular.
- Revisar con el asesor la regla de decisión sobre la IA ([12 §5](12-busqueda-e-ia.md)) y si la capacitación sugiere
  anotar el RUC o el cliente en la descripción.
- Al cerrar la evaluación, ejecutar la consulta de búsquedas fallidas y clasificar sus causas.

## 11. Recomendación final sobre la IA

**No incorporar IA durante la tesis.**

- **Lo que ya cubre la búsqueda actual:**
  - todo lo que pidió el pedido, salvo encontrar por sinónimos y por el contenido del archivo;
  - con 50.000 documentos y bajo 1 s;
  - con costo 0;
  - sin mandar datos a nadie nuevo.
- **Lo que costaría la búsqueda semántica:** un tercero, una transferencia internacional nueva que el consentimiento
  no cubre, y un costo o un modelo que no cabe en Render gratuito.
- **La falta de evidencia:** todavía no hay ningún dato de que las búsquedas reales fallen por las razones que ella
  resuelve.

**La decisión se toma después, con datos.** El sistema ya registra cada búsqueda, y la consulta de
[12 §5](12-busqueda-e-ia.md) dirá cuántas fallaron y por qué. Si lo justifican, el primer paso es una prueba de
concepto aislada de la búsqueda en el contenido de PDF y DOCX, sin OCR: no manda nada a terceros y ataca la falla
más probable en una MYPE, buscar por el RUC o por el cliente. La búsqueda semántica, solo si después siguen fallando
búsquedas por el sentido, y siempre filtrada por empresa y permisos antes de mostrar nada.
