# 06 · Diagnóstico de migración a la v2

Estado: **ejecutado.** Las decisiones A–G se aprobaron el 2 de octubre de 2026 y el plan de la §6 está
hecho; el resultado, al final (§9). Lo que sigue es el diagnóstico tal como se presentó.

## Resumen

La v1 se construyó ya **multiempresa por columna compartida**, que es exactamente lo que la v2 decide.
En la Fase 0 se adoptó «la organización como entidad» (D6): todas las tablas de negocio llevan
`organizacion_id`, la API la toma de la sesión y nunca de la petición, y la base impide con claves
foráneas compuestas que un documento apunte a la categoría o al usuario de otra empresa. Hay pruebas
que lo comprueban en documentos, categorías, usuarios e historial.

Por eso la migración **no es una reconstrucción**. Son cuatro cosas, de distinto peso:

1. **Un cambio de nombre** —`organizacion` pasa a ser `empresa`— amplio pero mecánico: 533 apariciones
   en 28 archivos del backend y 17 en el frontend.
2. **Un tercer rol que rompe una suposición del modelo.** Hoy todo usuario pertenece a una empresa. El
   Administrador Master no, y eso toca restricciones de la base, el historial, la autenticación y el
   frontend.
3. **Una capa transversal de aislamiento** que hoy no existe. El filtro por empresa está repetido a mano
   en una veintena de funciones. No falla ninguna, pero la v2 exige que no dependa de acordarse.
4. **Funciones nuevas:** gestión de empresas por el Master, recuperación de contraseña por correo y el
   DNI como dato del perfil.

## 1. Tablas

| Tabla hoy | ¿Tiene la columna de empresa? | Qué necesita en la v2 |
|---|---|---|
| `organizaciones` | Es la tabla de empresas | Renombrarla a `empresas` y añadir `activa`: el Master activa y desactiva |
| `usuarios` | Sí, obligatoria | Pasa a `empresa_id`, **nula solo para el Master**, con una restricción: rol `master` si y solo si no tiene empresa. Nuevo rol `master`, columna `dni` opcional y un índice único parcial que impida un segundo Master desde la base |
| `sesiones` | No (por el usuario) | Nada. Es infraestructura de autenticación, no dato de negocio, y las sesiones del Master no tienen empresa |
| `categorias` | Sí | Solo el cambio de nombre |
| `documentos` | Sí, con claves compuestas | Solo el cambio de nombre |
| `solicitudes` | Sí, con claves compuestas | Solo el cambio de nombre |
| `notificaciones` | **No**: solo por el usuario | **Añadir `empresa_id`** con claves compuestas. Hoy nada en la base impide notificar a alguien de otra empresa sobre una solicitud ajena; solo lo evita el código |
| `historial` | Sí, nula en intentos de acceso anónimos | Mantener la columna nula. **Rediseñar su clave compuesta**: cuando el Master actúa sobre una empresa (la desactiva, crea su administrador), el asiento debe llevar esa empresa, y la clave «el usuario pertenece a esa empresa» lo rechazaría. La excepción del Master tiene que ser explícita (ver §5) |
| `tiempos_respuesta` | **No**: solo por el usuario | **Añadir `empresa_id`**: filtrado uniforme, y las métricas del Master por empresa salen sin unir tablas |
| *(nueva)* `recuperaciones_clave` | — | Token de un solo uso (solo su hash), vigencia de 60 min y fecha de uso. Infraestructura de autenticación: sin empresa, porque el Master también recupera |

El catálogo de acciones del historial crece de 22 a unas 28: altas, cambios y activación de empresas,
solicitud de recuperación y contraseña restablecida. `ORGANIZACION_REGISTRADA` desaparece si se
elimina el registro público (decisión B).

## 2. Endpoints

Hoy hay 29 rutas: las 28 del diseño, más el diagnóstico de red de `/salud/red`. Con almacenamiento en
disco se añade la ruta de archivos firmados.

| Grupo | Rutas | Cómo se aíslan hoy | ¿Filtrarían datos de otra empresa? |
|---|---|---|---|
| Públicas | `/salud`, `/auth/registro`, `/auth/login` | No leen datos de empresa (el login busca un correo, que es único en todo el sistema) | No |
| De la propia sesión | `/auth/yo`, `/auth/clave`, `/auth/logout`, `/notificaciones` (3), `/tiempos-respuesta/:id` | Todas filtran por el usuario autenticado, que pertenece a una sola empresa | No |
| De la empresa | `/documentos` (6), `/categorias` (3), `/solicitudes` (3), `/usuarios` (4), `/historial` (2) | Cada consulta filtra por la empresa de la sesión; los recursos ajenos responden 404 | No |
| Archivos firmados | `/archivos/...` (solo en desarrollo) y las URL firmadas de Supabase | El enlace es una capacidad: solo se entrega tras comprobar la empresa, y caduca a los 5 minutos | No, pero un enlace filtrado sirve a cualquiera durante esos 5 minutos. Es el mismo modelo que Supabase |

**Ninguno devolvería datos de otra empresa hoy.** Revisé una a una las 40 funciones de los repositorios.
Las que no filtran por empresa son, a propósito, el inicio de sesión por correo y las que actúan sobre
ids que salen de la propia sesión. Pero hay tres debilidades reales que la v2 tiene razón en señalar:

- El filtro se repite a mano en unas 20 funciones. Un endpoint nuevo que lo olvide fugaría datos, y solo
  lo detectaría una prueba que alguien se acuerde de escribir.
- Notificaciones y tiempos de respuesta se aíslan solo de forma transitiva, a través del usuario.
- El Master, que no tiene empresa, llamaría hoy a los endpoints de empresa con una empresa nula. Debe
  recibir un 403 explícito, no un listado vacío ni un error de la base.

Endpoints nuevos de la v2: `POST /auth/recuperacion` y `POST /auth/recuperacion/confirmar`; y bajo
`/plataforma` (solo el Master), las empresas (listar, crear, editar, activar y desactivar), sus
administradores y unas métricas simples (conteos y almacenamiento por empresa).

## 3. Autenticación hoy

- JWT HS256 firmado con `jose`, válido 8 horas. **El token solo lleva `sub` (usuario), `jti` (sesión),
  `iat` y `exp`.** No lleva rol ni empresa.
- En cada petición, la firma descarta los tokens manipulados o caducados. Después, **una sola
  consulta** comprueba que la sesión siga abierta y el usuario activo, y trae el rol y la empresa
  **vigentes** (D4).
- Contraseñas con bcrypt, coste 10 (la v2 pide 10 o más). Mismo mensaje y mismo tiempo de respuesta
  para un correo inexistente que para una contraseña errónea. Límite de intentos fallidos por IP.
- Cerrar sesión la revoca. Desactivar a un usuario o restablecerle la contraseña cierra todas sus
  sesiones. Cambiar la propia cierra las demás.

**Esto choca con una «decisión ya tomada» de la v2.** La v2 dice «JWT sin estado: el token transporta
el `empresa_id` y el rol». Lo recomiendo **solo a medias**:

- **Sí:** que el token lleve `empresa_id` y `rol`. Sirve al frontend y a la trazabilidad, y cumple el
  paso 4 de la migración.
- **No:** que la API confíe en el token sin consultar la sesión. Con un token sin estado, **desactivar
  una empresa —una función nueva del Master— o a un usuario no surtiría efecto hasta que caducara su
  token**, hasta 8 horas después. Eso es un acceso incorrecto para el indicador 6, que la v2 amplía
  justo al aislamiento. El argumento de que «Render puede reiniciarse» no aplica: las sesiones viven
  en PostgreSQL, no en la memoria del servidor.

La API seguiría tomando la empresa de la identidad autenticada y nunca de la petición, que es lo que
la v2 exige.

## 4. El frontend con un tercer rol

Hoy el rol aparece en 7 archivos (29 usos): el tipo `Rol`, la sesión (`esAdministrador`), la
navegación, el marco, Usuarios, Mi cuenta y Solicitudes. Las pantallas no bloquean por rol en el
navegador: la API decide y registra los 403 (D8).

Qué cambia:

- **Modelo de sesión:** `Rol` suma `master`, y la empresa pasa a ser nula para él.
- **Navegación por rol:** el Master no tiene empresa, así que no ve documentos, categorías ni
  solicitudes. Entra a un área propia `/plataforma`. Los otros dos roles quedan casi igual: el actual
  «administrador» es el Administrador de Empresa.
- **Pantallas nuevas (5):** empresas, ficha de empresa con sus administradores, métricas simples,
  «olvidé mi contraseña» y «restablecer contraseña».
- **Pantalla que sale:** el registro público, si se confirma la decisión B.
- **Cambio de nombre:** «organización» pasa a «empresa» en 17 textos.

Las pantallas de documentos, búsqueda, subida, ficha, solicitudes y notificaciones **no cambian**.
Es un cambio moderado: alrededor del 30 % del frontend.

## 5. Decisiones que necesito antes de empezar

| | Decisión | Recomendación |
|---|---|---|
| A | Renombrar `organizacion` a `empresa` en base, API, código y documentos | **Sí, ahora.** Es el vocabulario de la v2 y de la tesis, y cuanto más código se escriba encima, más caro sale |
| B | ¿Sigue existiendo el registro público de empresas? | **No.** Si el Master «registra empresas», el autoservicio abre una puerta que nadie supervisa. El Master crea la empresa y su primer administrador. Cambia un argumento del marco teórico: el «autoservicio bajo demanda» pasa a ser del administrador dentro de su empresa |
| C | Token con `empresa_id` y `rol`, ¿y sin estado? | Con los datos en el token, **pero conservando la comprobación de sesión** (§3) |
| D | La capa transversal de aislamiento | **Row Level Security de PostgreSQL más los filtros actuales.** La base no devuelve filas de otra empresa aunque una consulta olvide el `WHERE`: es la respuesta más sólida a «lo primero que un jurado va a intentar romper», y es el patrón SaaS que la tesis puede citar. La API usaría un rol de base sin privilegios para saltarse RLS. *Alternativa más barata (un día menos):* un repositorio base que inyecta la empresa, sin RLS; aísla igual, pero depende del código |
| E | ¿Ve el Master los documentos de las empresas? | **No.** Gestiona empresas y administradores y ve conteos; no lee contenido. Es mínimo privilegio, y la excepción queda acotada a pocas rutas explícitas bajo `/plataforma` |
| F | Correo para la recuperación de contraseña | **Autenticación propia más un servicio de correo por API.** Render gratuito bloquea los puertos SMTP. Supabase Auth obligaría a rehacer la autenticación ya probada y a perder el registro transaccional de los inicios de sesión (D7). Hay que validar qué proveedor gratuito entrega bien sin dominio propio; el plan lo prueba antes de escribir el módulo |
| G | «Configura permisos» y «documentos autorizados» | **Solo roles, como hoy:** cualquier usuario ve los documentos de su empresa. Si quieres permisos por categoría, es otro módulo (≈1,5 días) y conviene decidirlo ahora |

## 6. Plan de migración, ordenado por dependencias

Esfuerzo en días de trabajo enfocado, pruebas incluidas.

| # | Paso | Depende de | Esfuerzo | Rehacer o parchar |
|---|---|---|---|---|
| 1 | Decisiones A–G, más dos comprobaciones previas: que Supavisor acepte un rol de base propio (para RLS) y qué proveedor de correo sirve | — | 0,5 | — |
| 2 | **Esquema v2** (§1): empresas, rol master con su restricción, DNI, empresa en notificaciones y tiempos, rediseño de la clave del historial, recuperaciones, catálogo de acciones, políticas RLS | 1 | 1 | **Rehacer** la migración 001 |
| 3 | Cambio de nombre en backend, API y pruebas | 2 | 0,5 | Parchar (mecánico) |
| 4 | **Capa transversal:** un acceso a datos «con ámbito de empresa» que fija la empresa en cada transacción, más el rol de base de la API; los repositorios lo reciben en vez del pool. El acceso «de plataforma» del Master es otro objeto, explícito | 3 | 1,5–2 | **Rehacer** la forma de acceder a datos; las consultas se conservan |
| 5 | **Identidad:** rol master, empresa nula, empresa activa comprobada en cada petición, token con `empresa_id` y `rol`, guarda «requiere empresa», script de inicialización del Master con su política de contraseña (12+ caracteres, ni DNI, ni correo, ni secuencias) | 4 | 1 | **Rehacer** la resolución de identidad; parchar el resto de la autenticación |
| 6 | **Módulo de plataforma:** empresas, sus administradores, desactivar una empresa (cierra todas sus sesiones) y métricas simples | 5 | 1–1,5 | Nuevo |
| 7 | **Recuperación de contraseña:** endpoints, token de un solo uso, mismo mensaje exista o no el correo, historial, límite de intentos y envío de correo | 5 | 1–1,5 | Nuevo (+ tu cuenta del proveedor de correo) |
| 8 | **Batería de aislamiento A contra B** (paso 7 de la v2): todos los endpoints, leer, modificar y descargar, más la excepción del Master y una prueba de que RLS bloquea aunque falte el filtro. Genera un informe documentado como evidencia del indicador 6 | 6, 7 | 1 | Nuevo, ampliando las pruebas actuales |
| 9 | **Frontend** (§4) | 5–7 | 2–2,5 | Parchar las pantallas actuales; nuevas las del Master y la recuperación |
| 10 | Documentación: 01–05, decisiones nuevas, y la sección «Decisiones ya tomadas» del `CLAUDE.md` | todos | 0,5–1 | Parchar |

**Total: entre 9,5 y 12,5 días.** Los pasos 6 y 7 pueden ir en paralelo. Después se retoma la
verificación del frontend en el navegador, que estaba a medias, y la Fase 8.

## 7. Qué rehacer y qué parchar

**Rehacer:**

- **La migración 001.** No hay base de producción, así que es mejor un esquema v2 coherente que una 001
  con su 002 de renombres encima. El jurado leerá el esquema tal como se diseñó.
- **El acceso a datos de los repositorios.** Pasarían a recibir un acceso con ámbito de empresa en vez
  del pool. Cambian las firmas, no las consultas.
- **La resolución de identidad** (autenticar y el tipo de usuario autenticado). Asume que todo usuario
  tiene empresa, y eso ya no es cierto.
- **La clave compuesta del historial.** No puede expresar que el Master actúe sobre una empresa.
- **El flujo de alta de empresas:** del registro público a la creación por el Master.

**Parchar o conservar:**

- La lógica de negocio de documentos, búsqueda, categorías, aprobación, notificaciones, almacenamiento
  y tiempos de respuesta.
- Las pantallas actuales del frontend.
- Las 173 pruebas, adaptadas a los nombres nuevos.
- El diseño de la Fase 0, con sus documentos actualizados.

## 8. Riesgos

- **Plazo.** Son unas dos semanas antes de retomar las pantallas y el despliegue, y sigo sin saber la
  fecha de la posprueba.
- **RLS en Supabase:** hay que confirmar que Supavisor admite el rol propio de la API. Si no, se cae a la
  alternativa de D (repositorio base, un día menos) sin tocar el resto del plan.
- **Correo gratuito sin dominio:** puede acabar en la carpeta de spam. Hay que probarlo de verdad antes
  de la evaluación.

## 9. Resultado

- **Base:** `001_esquema_inicial.sql` reescrita (aún no había nada desplegado): tabla `empresas`, el
  Master sin empresa y único, `recuperaciones_clave`, `empresa_id` en notificaciones y tiempos, el autor
  del historial comprobado por trigger (M11) y RLS con dos roles propios (D17).
- **API:** capa de acceso transversal (`src/db/acceso.ts`): ningún servicio recibe el pool. Puertas de
  empresa y de plataforma; módulo `plataforma` del Master; recuperación por correo con Brevo; script
  `crear-master`. Sin registro público. 38 endpoints.
- **Frontend:** tres roles, menú y primera pantalla según el rol, área del Master (cifras, alta de
  empresas, ficha con administradores), recuperación de contraseña y DNI en los formularios.
- **Pruebas:** 247, entre ellas las baterías de RLS, de aislamiento A contra B en cada endpoint (41
  intentos, todos con la respuesta correcta; informe en [evidencias/](evidencias/aislamiento-entre-empresas.md)),
  de la plataforma, del Master y de la recuperación. Además se rompió a propósito cada pieza de
  seguridad (22 mutaciones: sin RLS y sin filtro, empresa tomada del token, puertas abiertas, enlaces
  reutilizables, contraseña del Master sin reglas…) y en todos los casos alguna prueba falló.
- **Desvíos del plan:** el rol del token no invalida la sesión si cambia, porque RN05 exige que un
  cambio de rol valga en la petición siguiente; solo la empresa debe coincidir. Y lo ajeno responde 404
  (no 403), para no confirmar que existe.
