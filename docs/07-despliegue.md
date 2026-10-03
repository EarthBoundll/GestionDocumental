# 07 · Despliegue

Estado: **todo preparado y probado en local; faltan las cuentas.** El código, `render.yaml` y
`frontend/vercel.json` están listos, y la compilación de producción se probó con la CSP de Vercel
(ningún bloqueo). Crear las cuentas y pegar las claves lo hace el autor: son datos personales y
credenciales que no pasan por el repositorio ni por el asistente.

Orden: Supabase → Brevo → Render → Vercel → Master → monitor → comprobación. Ningún servicio pide
tarjeta (RNF07). Calcula una hora la primera vez.

## 1. Supabase: base de datos y archivos

1. Crea el proyecto en la región **East US (North Virginia)**, la misma que Render (D11). Guarda la
   contraseña de la base en tu gestor de contraseñas.
2. **Desactiva la Data API** (*Project Settings → Data API*). La API propia es la única puerta (D14).
3. Botón **Connect → Session pooler** (puerto 5432): copia la URI. Es `DATABASE_URL`, **sin**
   `?sslmode` al final (D12).
4. *Project Settings → Database → SSL Configuration → Download certificate*: el contenido completo del
   archivo, con sus líneas `-----BEGIN CERTIFICATE-----`, es `DATABASE_CA`.
5. *Storage → New bucket*: nombre `documentos`, **privado** (D9).
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
   de PostgreSQL sin contraseña (`app_empresa` y `app_plataforma`, D17); el usuario `postgres` de
   Supabase tiene permiso para hacerlo.
4. Anota la dirección del servicio: `https://<servicio>.onrender.com`.

## 4. Vercel: el frontend

1. *Add New → Project*, importa el repositorio y en **Root Directory** elige `frontend`. Vercel
   detecta Vite; deja la compilación por defecto.
2. Variable de entorno `VITE_API_URL` = `https://<servicio>.onrender.com/api/v1`. Se lee al compilar:
   si la cambias, vuelve a desplegar.
3. El nombre del proyecto debe dar la dirección que pusiste en `CORS_ORIGEN`. Si Vercel te da otra,
   corrige `CORS_ORIGEN` y `URL_FRONTEND` en Render (*Environment*); Render se redespliega solo.

`frontend/vercel.json` reescribe cualquier ruta a `index.html` (recargar `/documentos/…` funciona) y
envía la CSP, que solo deja hablar con `*.onrender.com`.

## 5. Proxies de confianza

El limitador de intentos cuenta por IP, así que la API tiene que ver la IP real de cada persona. Sigue
el paso 4 de [`backend/README.md`](../backend/README.md): abre `/api/v1/salud/red`, ajusta
`PROXIES_DE_CONFIANZA` y después pon `DIAGNOSTICO_RED=false`.

## 6. Crear el Master

Una sola vez, desde tu máquina, en `backend/`: pon en tu `.env` la `DATABASE_URL` y el `DATABASE_CA`
de producción y tus `MASTER_EMAIL`, `MASTER_PASSWORD`, `MASTER_NOMBRE` y `MASTER_DNI`, y ejecuta
`npm run crear-master`. La contraseña necesita 12 caracteres o más, sin tu DNI, sin tu correo (tampoco
lo que va antes de la @) y sin ser solo números. Después **quita la URL de producción de tu `.env`**:
así ningún `npm run migrar` de desarrollo toca la base de la evaluación.

## 7. El monitor

En UptimeRobot (o cron-job.org), un monitor HTTP a `https://<servicio>.onrender.com/api/v1/salud`
cada 5 o 10 minutos. Mantiene despierta la API y activo el proyecto de Supabase (D13), y su registro de
caídas es evidencia de disponibilidad.

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

## 9. Durante la evaluación

| Cuándo | Qué | Por qué |
|---|---|---|
| Una semana antes de cada hito | Entra a Supabase y comprueba que el proyecto no está pausado | R2 |
| Dos minutos antes de cada sesión | Abre `/api/v1/salud` | R1: si el monitor falló, la API despierta ahora y no con la primera persona |
| Al cerrar cada sesión | Exporta el historial a CSV y ejecuta las consultas de [08 · Indicadores](08-indicadores.md); guarda ambos fuera de Supabase | R3: el plan gratuito no tiene copias de seguridad |

## 10. Alternativa sin cuentas

Para enseñar el sistema sin internet o si un proveedor falla el día de la sustentación:
`npm run local` en `backend/` y `npm run dev` en `frontend/` levantan todo en una sola máquina, con
su propio PostgreSQL 17, archivos y correos en carpetas. Los datos de esa demostración no son los de la
evaluación.
