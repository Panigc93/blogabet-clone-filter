# E2E (offline, fixtures)

Suites de extremo a extremo 100% locales: un mock del protocolo HTTP de Neon sirve
tipsters sintéticos y la app se prueba contra él en build de producción. No tocan
Neon real, Blogabet, ni credenciales: `SITE_PASSWORD`/`AUTH_SECRET` son valores de
test y `DATABASE_URL` apunta al mock.

## Requisitos
- Node 20+, `npm ci`
- `playwright` instalado (está en devDependencies) y Chrome:
  - `npx playwright install chromium`, o
  - Chrome/Chromium del sistema (`/usr/bin/google-chrome`), o
  - `PLAYWRIGHT_CHROME_PATH=/ruta/al/chrome`

## Ejecutar todo
```bash
tests/e2e/run.sh
```
El script:
1. **Se niega a correr si `db/index.ts` tiene cambios sin commitear** (staged o
   no). Si los hay, haz commit o stash primero: el runner jamás pisa trabajo tuyo.
2. Hace backup byte-exacto de `db/index.ts` y lo parchea temporalmente para
   apuntar `fetchEndpoint` al mock (`http://localhost:4400/sql`). Al salir
   (éxito, error o señal) restaura **desde el backup**, nunca desde git.
   **Nunca commitees el parche.**
3. Compila (`npm run build`) con env de test.
4. Arranca mock + `next start` y corre `verify.mjs` (26 checks: filtros URL,
   comparador, CSV, MYS, badges) y `verify3.mjs` (12 checks: pagina /top-mys —
   pool exacto, orden por puntuacion, exclusiones, metodologia/caveats,
   enlace desde el listado y overflow movil).
5. Relanza con fixtures grandes (1200 tipsters, `MOCK_BIG=1`) y corre
   `verify2.mjs` (22 checks: paginación, LoadMore, export con límite 1000, ordenación).

Variables opcionales: `MOCK_PORT` (4400), `E2E_APP_PORT` (3100), `E2E_BASE`,
`E2E_SHOTS` (capturas + `export.csv`, por defecto `tests/e2e/shots/`, ignorado en git).

## Notas
- `mock-neon.mjs` implementa el contrato HTTP de `@neondatabase/serverless`
  (POST `/sql` con `{query, params}`, respuesta `fields[]` con OIDs PG reales y
  `rows` como arrays; booleanos en formato texto `'t'/'f'`).
- `MOCK_BIG=1` genera 1200 tipsters deterministas (seed por índice).
- Next 14 cachea respuestas de fetch en `.next/cache`: `run.sh` lo borra entre suites;
  si cambias fixtures a mano, bórralo tú también.
- Los fixtures no validan datos reales de Blogabet; son control sintético.
