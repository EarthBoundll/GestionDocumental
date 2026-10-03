# Gestión documental para MYPEs

Sistema web basado en Cloud Computing para la gestión documental de micro y pequeñas empresas de Lima.
Tesis de pregrado de Ingeniería de Sistemas Computacionales, UPN, 2026 — Diego Moisés Acosta Gerónimo.

Varias empresas comparten la plataforma, cada una aislada de las demás. Hay tres roles: el
Administrador Master, que da de alta las empresas; el Administrador de Empresa, que gestiona su equipo,
sus categorías, las aprobaciones y el historial; y el Usuario, que sube, busca, ve y descarga documentos
y pide su aprobación. Toda acción queda registrada en un historial inalterable, del que salen los
indicadores de la tesis.

| Carpeta | Qué hay | Despliegue |
|---|---|---|
| [`backend/`](backend/README.md) | API REST en Express 5 y TypeScript, sobre PostgreSQL con RLS | Render |
| [`frontend/`](frontend) | SPA en React 19 y Tailwind 4 | Vercel |
| [`docs/`](docs/README.md) | Análisis, arquitectura, modelo de datos, API, estructura, despliegue, indicadores y evidencias | — |

## Probarlo en una máquina, sin cuentas

Requiere Node 24. En dos terminales:

```bash
cd backend && npm ci && npm run local     # API en :4000 con su propio PostgreSQL 17
```

```bash
cd frontend && npm ci && npm run dev      # http://localhost:5173
```

Para entrar hace falta el Master: pon `MASTER_EMAIL`, `MASTER_PASSWORD`, `MASTER_NOMBRE` y `MASTER_DNI`
en `backend/.env` (ver `backend/.env.example`) antes de `npm run local`. Con él se da de alta la primera
empresa y su administrador. Los correos de recuperación de contraseña quedan en `backend/.local/correos`.

## Pruebas

| Dónde | Comando | Qué prueba |
|---|---|---|
| `backend/` | `npm test` | 247 pruebas contra un PostgreSQL 17 real: reglas, permisos, RLS y aislamiento endpoint por endpoint |
| `backend/` | `npm run informe:aislamiento` | La batería A contra B, con su informe en [`docs/evidencias/`](docs/evidencias/aislamiento-entre-empresas.md) (indicador 6) |
| `frontend/` | `npm test` | 41 pruebas de pantallas, sesión, roles y cliente HTTP |
| `frontend/` | `npm run pruebas:funcionales` | Los 24 requisitos en un navegador real, en escritorio y celular, contra el sistema completo; informe en [`docs/evidencias/`](docs/evidencias/pruebas-funcionales.md). La primera vez: `npx playwright install chromium` |

## Desplegar

[`docs/07-despliegue.md`](docs/07-despliegue.md): Supabase, Brevo, Render y Vercel paso a paso, todo en
capa gratuita y sin tarjeta, y `npm run comprobar-despliegue` para verificar que quedó bien configurado.
