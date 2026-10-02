# API · Gestión documental

API REST en Express 5 y TypeScript sobre PostgreSQL. El diseño está en [`../docs`](../docs/README.md).

## Puesta en marcha

Requiere Node 24.

```bash
npm ci
cp .env.example .env       # y rellénalo
npm run migrar             # crea o actualiza el esquema
npm run dev                # http://localhost:4000/api/v1/salud
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Arranca la API y la reinicia al guardar un cambio |
| `npm run migrar` | Aplica las migraciones pendientes de `migraciones/` |
| `npm test` | Ejecuta todas las pruebas. No necesita nada instalado: levanta su propio PostgreSQL 17 |
| `npm run typecheck` | Comprueba los tipos de todo el proyecto, pruebas incluidas |
| `npm run build` y `npm start` | Compila a `dist/` y arranca la versión compilada, como en Render |

## Migraciones

- Una migración es un archivo `NNN_descripcion.sql` en `migraciones/`, y se aplica en su propia
  transacción. Por eso no lleva `BEGIN` ni `COMMIT`.
- **Una migración aplicada no se edita.** El ejecutor guarda la suma SHA-256 de cada archivo y se
  niega a seguir si cambió: los cambios van en una migración nueva.
- En Render se aplican durante la compilación (ver `../render.yaml`). Si fallan, el despliegue se
  detiene y sigue en línea la versión anterior.

## Pruebas

Las pruebas de integración corren contra un PostgreSQL 17 real, la misma versión mayor que Supabase,
que el paquete `embedded-postgres` arranca en un directorio temporal. Cada archivo de pruebas trabaja
en su propia base, recién creada y migrada.

## Primer despliegue en Render

1. En Supabase, crea el proyecto en la región **East US (North Virginia)**. Copia la URL del
   *Session pooler*, descarga el certificado, crea un bucket **privado** llamado `documentos` y copia la
   URL del proyecto y su clave secreta (*Project Settings → API Keys*).
2. En Render: **New → Blueprint**, elige el repositorio y pega `DATABASE_URL` y `DATABASE_CA` cuando
   los pida, junto con `SUPABASE_URL` y `SUPABASE_CLAVE_SECRETA`. `JWT_SECRETO` lo genera Render.
3. Cuando `https://<servicio>.onrender.com/api/v1/salud` responda `{"estado":"ok"}`, **fija los proxies
   de confianza**. El limitador de intentos cuenta por IP, y la API tiene que ver la IP real de cada
   persona, no la del proxy de Render:
   - Abre `https://<servicio>.onrender.com/api/v1/salud/red` y compara `ip` con tu IP pública (por
     ejemplo, la que muestra cualquier web de «cuál es mi IP»).
   - Si no coinciden, mira `cadena`: tu IP es el primer elemento. Ajusta `PROXIES_DE_CONFIANZA` hasta que
     `ip` sea la tuya.
   - Pon `DIAGNOSTICO_RED` en `false`. La ruta deja de existir.
