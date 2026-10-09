# 07 · Despliegue

Estado: **desplegado el 3 de octubre de 2026**, todo en capa gratuita.

| Pieza | Dónde |
|---|---|
| Frontend | https://gestion.formatosperu.com, el subdominio propio (§4.1), y https://gestion-documental-zeta.vercel.app (proyecto `gestion-documental` en Vercel) |
| API | https://gestion-documental-api-keuj.onrender.com (servicio `gestion-documental-api` en Render, Virginia) |
| Base y archivos | Proyecto `gestion-documental` de Supabase (`dpqddwryhoatnqukahiy`, us-east-1), buckets privados `documentos` y `respaldos` |

Render tiene todas sus variables, con los proxies de confianza ajustados (§5); las migraciones, el
usuario de la API y la cuenta Master ya están en la base, y el monitor corre en Supabase (§7). La
comprobación desde fuera (§8, hecha con `pg_net` desde Supabase) dio todo en verde: la API y su base
responden, CORS admite al frontend, el frontend se sirve con su CSP, un enlace interno no da 404 y el
JavaScript publicado llama a esta API. Falta la prueba de humo con personas (§8) y, opcional, apagar la
Data API (§1, paso 2): sin ella, `anon` y `authenticated` siguen sin permisos sobre nada (002, 003).

Orden para repetirlo desde cero: Supabase → Brevo → Render → Vercel → Master → monitor → comprobación.
Ningún servicio pide tarjeta (RNF07). Calcula una hora la primera vez.

## 1. Supabase: base de datos y archivos

1. Crea el proyecto en la región **East US (North Virginia)**, la misma que Render (D11). Guarda la
   contraseña de la base en tu gestor de contraseñas.
2. **Desactiva la Data API** (*Project Settings → Data API*). La API propia es la única puerta (D14).
3. Crea el usuario de la API (D21) en el *SQL Editor*. La contraseña va ya cifrada: genérala y cífrala
   en tu máquina (por ejemplo con `psql`, `\password`, o cualquier generador de SCRAM-SHA-256) y pega
   solo el resultado, que empieza por `SCRAM-SHA-256$4096:`.

   ```sql
   create role gestion_api login createrole password '<verificador SCRAM-SHA-256>';
   grant create on database postgres to gestion_api;
   grant usage, create on schema public to gestion_api;
   grant usage on schema extensions to gestion_api with grant option;
   create extension if not exists unaccent schema extensions;
   create extension if not exists pg_trgm schema extensions;
   ```

   `DATABASE_URL` es la URI de **Connect → Session pooler** (puerto 5432, D12) con ese usuario y su
   contraseña en claro, **sin** `?sslmode` al final:
   `postgresql://gestion_api.<ref del proyecto>:<contraseña>@aws-0-us-east-1.pooler.supabase.com:5432/postgres`.
   El prefijo `aws-0` o `aws-1` depende del proyecto: copia el que muestre Connect. Con el equivocado,
   el pooler responde `tenant/user … not found`.
4. *Project Settings → Database → SSL Configuration → Download certificate* (es el mismo para todos los
   proyectos: `prod-ca-2021.crt`, «Supabase Root 2021 CA», válido hasta 2031): el contenido completo del
   archivo, con sus líneas `-----BEGIN CERTIFICATE-----`, es `DATABASE_CA`.
5. *Storage → New bucket*: nombre `documentos`, **privado** (D9). Otro, también **privado**, llamado
   `respaldos` (D25): ahí guarda la API el respaldo de cada noche.
6. *Project Settings → API Keys*: la URL del proyecto es `SUPABASE_URL`, y la clave **secreta** (no la
   pública) es `SUPABASE_CLAVE_SECRETA`.

Para desarrollar contra Supabase hace falta un segundo proyecto, «desarrollo», con los mismos pasos.
Sin él, `npm run local` levanta todo en tu máquina.

## 2. Brevo: el correo de recuperación de contraseña

1. Crea la cuenta gratuita (300 correos al día).
2. *Senders*: añade tu correo como remitente y verifícalo con el enlace que te llega. Ese correo es
   `CORREO_REMITENTE`.
3. *SMTP & API → API Keys*: genera una clave. Es `BREVO_CLAVE_API`.

## 3. Render: la API

1. Elige ya el nombre del proyecto que tendrás en Vercel (paso 4). Su dirección será
   `https://<nombre>.vercel.app`, y la API la necesita antes de que exista.
2. *New → Blueprint*, elige este repositorio. Render lee `render.yaml` y pide los valores secretos:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL`, `DATABASE_CA` | Los del paso 1 |
   | `SUPABASE_URL`, `SUPABASE_CLAVE_SECRETA` | Los del paso 1 |
   | `BREVO_CLAVE_API`, `CORREO_REMITENTE` | Los del paso 2 |
   | `CORS_ORIGEN` y `URL_FRONTEND` | `https://<nombre>.vercel.app`, sin barra final |

   `JWT_SECRETO` lo genera Render. Las variables que faltan ya tienen valor en `render.yaml`.
3. La compilación instala, compila y **aplica las migraciones**. Si una falla, el despliegue se
   detiene y no queda nada a medias: cada migración es una transacción. La migración crea dos roles
   de PostgreSQL sin contraseña (`app_empresa` y `app_plataforma`, D17); `gestion_api` tiene permiso
   para hacerlo.
4. Anota la dirección del servicio: `https://<servicio>.onrender.com`.

## 4. Vercel: el frontend

1. *Add New → Project*, importa el repositorio y en **Root Directory** elige `frontend`. Vercel
   detecta Vite; deja la compilación por defecto.
2. Variable de entorno `VITE_API_URL` = `https://<servicio>.onrender.com/api/v1`. Se lee al compilar:
   si la cambias, vuelve a desplegar.
   Opcionales (D38): `VITE_CONTACTO_EMAIL`, el correo al que las empresas piden su cuenta y las personas
   ejercen sus derechos sobre sus datos (conviene uno propio para esto, no el de la cuenta del Master), y
   `VITE_CONTACTO_WHATSAPP`, solo dígitos con el código del país (`51…`). Sin ellas, el inicio de sesión
   no ofrece «Solicita una cuenta» y los términos remiten al consentimiento.
3. El nombre del proyecto debe dar la dirección que pusiste en `CORS_ORIGEN`. Si Vercel te da otra,
   corrige `CORS_ORIGEN` y `URL_FRONTEND` en Render (*Environment*); Render se redespliega solo.

`frontend/vercel.json` reescribe cualquier ruta a `index.html` (recargar `/documentos/…` funciona) y
envía la CSP, que solo deja hablar con `*.onrender.com` y solo admite imágenes y marcos del propio
dominio y del proyecto de Supabase, de donde llegan el logo de cada empresa (D28) y la vista previa de
los documentos (D29) con su enlace firmado. Si cambias de proyecto de Supabase, cambia también ese
dominio en `img-src` y `frame-src`: si no, los logos y la vista previa no se verán aunque todo lo demás
funcione.

### 4.1 Un subdominio propio (opcional)

En este despliegue el frontend también se sirve en `gestion.formatosperu.com`, un subdominio de un
dominio que el autor ya tenía en Hostinger; el dominio principal sigue sirviendo su propio sitio. No
cuesta nada más:

1. En Vercel, *Project → Settings → Domains → Add*: `gestion.<tu dominio>`.
2. En Hostinger, *Dominios → DNS*: un registro **CNAME** con nombre `gestion` que apunta a
   `cname.vercel-dns.com`. Vercel emite el certificado HTTPS solo, en unos minutos.
3. En Render, `CORS_ORIGEN` admite los dos orígenes separados por coma
   (`https://gestion.<tu dominio>,https://<nombre>.vercel.app`), y `URL_FRONTEND` pasa a ser el
   subdominio: así el enlace del correo de recuperación lleva a la dirección que conocen las personas.

## 5. Proxies de confianza

El limitador de intentos cuenta por IP, así que la API tiene que ver la IP real de cada persona. Sigue
el paso 4 de [`backend/README.md`](../backend/README.md): abre `/api/v1/salud/red`, ajusta
`PROXIES_DE_CONFIANZA` y después pon `DIAGNOSTICO_RED=false`.

En este despliegue el valor es **3**. Una petición a Render atraviesa Cloudflare y dos proxies de Render
(`X-Forwarded-For: <cliente>, <Cloudflare>, <Render>`, y el último salto es la conexión misma). Con el
valor provisional, 1, la API veía la IP interna de Render: todas las personas habrían compartido un
mismo contador de intentos fallidos, y unos pocos errores al escribir la contraseña en una sesión de
evaluación habrían bloqueado a todo el grupo.

## 6. Crear el Master

Una sola vez, desde tu máquina, en `backend/`: pon en tu `.env` la `DATABASE_URL` y el `DATABASE_CA`
de producción y tus `MASTER_EMAIL`, `MASTER_PASSWORD`, `MASTER_NOMBRE` y `MASTER_DNI`, y ejecuta
`npm run crear-master`. La contraseña necesita 12 caracteres o más, sin tu DNI, sin tu correo (tampoco
lo que va antes de la @) y sin ser solo números. Después **quita la URL de producción de tu `.env`**:
así ningún `npm run migrar` de desarrollo toca la base de la evaluación.

En este despliegue el Master se creó desde el *SQL Editor* con lo mismo que hace el script: la fila en
`usuarios` con rol `master` y el hash bcrypt (coste 10) calculado fuera de la base, y el asiento
`USUARIO_CREADO` con `origen: script de inicialización`, ambos como `gestion_api`. Su contraseña
inicial fue temporal: se cambia en *Mi cuenta* al primer ingreso.

## 7. El monitor

Un trabajo de `pg_cron` en Supabase llama a `/api/v1/salud` cada 10 minutos (D13). Se crea una vez en
el *SQL Editor*:

```sql
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
select cron.schedule('despertar-api', '*/10 * * * *',
  $$select net.http_get(url := 'https://<servicio>.onrender.com/api/v1/salud', timeout_milliseconds := 90000)$$);
```

Las respuestas quedan unas horas en `net._http_response` (`status_code` 200 es que la API y la base
respondieron), y las ejecuciones en `cron.job_run_details`. Para pararlo:
`select cron.unschedule('despertar-api');`.

Opcional: un monitor de UptimeRobot a la misma dirección deja, además, un registro de caídas visto desde
fuera, que sirve como evidencia de disponibilidad.

### Tareas de la propia API

Al estar despierta, la API hace dos tareas programadas sin ninguna pieza más:

- **Purga de la papelera** (D23): un minuto después de arrancar y cada seis horas, borra el archivo de
  lo que lleva más de 30 días eliminado. En el historial de cada empresa queda `DOCUMENTO_PURGADO` con
  «El sistema» como autor.
- **Respaldo nocturno** (D25): a las 03:00 de Lima guarda la base comprimida en el bucket `respaldos` y
  borra los de más de 30 días. Queda `RESPALDO_GENERADO` en la auditoría del Master, que puede pedir uno
  en el momento desde *Respaldos*.

## 7.1 Restaurar un respaldo

Si la base se perdiera (o para ensayarlo antes de la sustentación), desde `backend/`, con la
`DATABASE_URL`, el `DATABASE_CA` y las claves de Supabase de **la base de destino** en tu `.env`:

```bash
npm run respaldo -- listar                       # los respaldos guardados en el bucket
npm run migrar                                   # la base de destino, vacía y migrada
npm run respaldo -- restaurar respaldo-2026-10-04T08-00-00Z.json.gz
```

`restaurar` se niega si la base ya tiene datos o si sus migraciones no son las del respaldo: no mezcla,
sustituye una base perdida. Es todo o nada. No restaura sesiones ni enlaces de recuperación: cada
persona vuelve a iniciar sesión. Los archivos de los documentos siguen en el bucket `documentos`, que no
se toca. `npm run respaldo -- descargar <nombre>` copia uno a tu máquina, y `generar` hace uno al momento.

Para comprobar un respaldo sin tocar ninguna base, `npm run respaldo -- ensayar <nombre>` lo restaura en un
PostgreSQL desechable, recién migrado con el código de tu copia, y lo borra al terminar (D35). No usa la
`DATABASE_URL` del `.env` ni instala nada; para leer del bucket, sí las claves de Supabase. Termina con «Ensayo
correcto» y las filas de cada tabla, o con el motivo por el que no se restauraría.

Un respaldo solo se restaura con las mismas migraciones con que se hizo. Por eso, después de desplegar
una versión que trae una migración nueva (la 008 añadió la identidad y el tema; la 009, las versiones; la 010,
la visibilidad por consulta y el listado documental; la 011, la constancia del cierre del estudio; la 012, el
fondo de cada empresa), pide un
respaldo en el momento desde *Respaldos*: el de la noche anterior solo se restauraría con el código
anterior.

## 8. Comprobar

Desde `backend/`:

```bash
npm run comprobar-despliegue -- https://<servicio>.onrender.com https://<nombre>.vercel.app
```

Comprueba desde fuera lo que suele fallar al desplegar: que la API y su base responden, que CORS admite
al frontend, que el diagnóstico de red está apagado, que el frontend se sirve con su CSP, que un enlace
interno no da 404 y que el JavaScript publicado llama a esta API y no a `localhost`. Si algo falla, dice
qué variable revisar. No crea datos ni inicia sesión.

Después, a mano, la prueba de humo (unos diez minutos):

- [ ] El Master entra desde la PC y da de alta la empresa del caso de validación con su administrador.
- [ ] Ese administrador entra **desde su celular**, sube un documento con la cámara o desde la galería,
      lo busca, lo ve y lo descarga.
- [ ] Desde la PC, pide recuperar su contraseña: el correo llega (revisa también *Spam*) y el enlace
      funciona una sola vez.
- [ ] Un usuario pide aprobar un documento y el administrador lo aprueba; la campana avisa a ambos.
- [ ] El historial muestra todo lo anterior y se exporta a CSV.
- [ ] Desde la PC, la *Vista previa* de un PDF y de una foto se ve dentro de la ficha; en el celular, la
      de la foto.
- [ ] Sube una versión nueva de un documento: la ficha dice «Versión 2», la 1 se descarga con su archivo
      de entonces y restaurarla crea la 3.
- [ ] El administrador exporta el listado documental desde *Documentos* y lo abre en Excel; en *Historial*
      filtra un día, pulsa *Imprimir* y lo guarda como PDF: sale sin menú, en claro y con las firmas.
- [ ] El administrador cambia el nombre comercial, el color y el logo desde *Identidad*; la usuaria, en su
      celular, los ve al volver a abrir el sistema. Cada uno elige el modo oscuro en *Mi cuenta* y lo
      encuentra igual al entrar desde el otro dispositivo.

## 9. Durante la evaluación

| Cuándo | Qué | Por qué |
|---|---|---|
| Una semana antes de cada hito | Entra a Supabase y comprueba que el proyecto no está pausado | R2 |
| Dos minutos antes de cada sesión | Abre `/api/v1/salud` | R1: si el monitor falló, la API despierta ahora y no con la primera persona |
| Al cerrar cada sesión | Exporta el historial a CSV (también desde el *Tablero*, con el periodo de la sesión) y ejecuta las consultas de [08 · Indicadores](08-indicadores.md); guarda ambos fuera de Supabase | R3: el respaldo nocturno protege la base, pero la evidencia conviene tenerla también fuera |
| Antes del piloto y de la capacitación | Carga los documentos ficticios en la empresa que corresponda: `npm run documentos-de-prueba -- lote --subir`, con `CARGA_API_URL`, `CARGA_EMAIL` y `CARGA_CLAVE` de su administrador en el `.env` | D34: nunca documentos reales fuera de la evaluación |
| Antes de la sustentación | Comprueba en *Respaldos* (Master) que hay uno de cada noche | D25 |
| Al cerrar el estudio | El procedimiento de [09 · Protocolo](09-protocolo-evaluacion.md) §10: desactivar la empresa, simulacro y `npm run cierre-del-estudio -- <id> --confirmar "<nombre>" --con-respaldos` | D33: lo promete el consentimiento |

### 9.1 El congelamiento

Desde la capacitación hasta terminar la última posprueba el sistema no cambia, para que todos los
participantes midan lo mismo ([09 · Protocolo](09-protocolo-evaluacion.md) §1, D35). Se hace al final de la
*Preparación*, con las empresas, las cuentas y el lote base ya cargados:

1. **Lo último que entra.** Todo lo que se evaluará está fusionado en `main`, la integración continua está
   en verde en su último commit y producción tiene ese commit: Render (*Events*) y Vercel (*Deployments*).
   Antes de etiquetar, se ponen al día las cifras de pruebas del [guion](11-guion-sustentacion.md) con las de
   esa ejecución: después ya no se fusiona nada.
2. **La etiqueta**, desde la raíz del repositorio:
   ```bash
   git checkout main && git pull
   git tag -a evaluacion-v1 -m "Versión congelada para la evaluación"
   git push origin evaluacion-v1
   ```
   Es la versión que se cita en la tesis.
3. **El estado inicial.** El Master pide un respaldo desde *Respaldos* y anota su nombre.
4. **El ensayo**, desde `backend/`, en la copia de la etiqueta y con las claves de Supabase en el `.env`:
   ```bash
   git checkout evaluacion-v1
   npm run respaldo -- ensayar <nombre del respaldo>
   ```
   Tiene que terminar con «Ensayo correcto». Su salida se guarda junto con las actas de las sesiones.
5. **Se anota** en el registro de cambios del protocolo (§11) la fecha, la etiqueta, el commit y el respaldo.

**Mientras dure:** ninguna fusión en `main` (Vercel publica cada commit de `main` en producción por sí
solo) y ningún despliegue en Render. Lo que se quiera mejorar se trabaja en una rama y se fusiona al
terminar la última posprueba. Si un fallo impide una sesión, se corrige, se anota en §11 del protocolo con
su fecha y se decide con el asesor si las sesiones anteriores siguen valiendo; la etiqueta nueva es
`evaluacion-v2`, con su propio respaldo y su propio ensayo.

## 10. Integración continua

`.github/workflows/pruebas.yml` ejecuta en GitHub Actions, en cada push a `main` y en cada pull request,
las pruebas del backend, las del frontend con su compilación y las funcionales con Playwright (D26). El
informe por requisito y el HTML de Playwright quedan como artefacto de la ejecución durante 30 días. No
despliega nada: Render y Vercel lo hacen solos desde `main`. En un repositorio privado del plan gratuito
hay 2.000 minutos al mes; cada ejecución gasta unos 10.

## 11. Alternativa sin cuentas

Para enseñar el sistema sin internet o si un proveedor falla el día de la sustentación:
`npm run local` en `backend/` y `npm run dev` en `frontend/` levantan todo en una sola máquina, con
su propio PostgreSQL 17, archivos y correos en carpetas. Los datos de esa demostración no son los de la
evaluación.
