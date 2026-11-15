# Persistencia multiplataforma (Blogabet + Tipstrr)

Estado 2026-11-15: **implementado en rama, NO ejecutado**. La migración
`drizzle/0003_multi_platform.sql` existe como archivo; no se ha aplicado a
ninguna base de datos. Aplicarla, escribir en Neon y mergear son decisiones
separadas del propietario.

## Modelo

Una sola tabla `tipsters` con discriminador:

- `platform` (text, default `'blogabet'`): fuente del registro.
- Unicidad: `(platform, slug)` (`ux_tipsters_platform_slug`). El unique
  antiguo sobre `slug` se elimina: un slug Tipstrr puede colisionar con uno
  BB sin pisarse.
- `id` sigue siendo el PK numérico que aporta la fuente (BB trae el suyo).
  Convención: filas Tipstrr usan `-portfolioId` (espacio negativo), así las
  dos fuentes no colisionan jamás. El `portfolioId` sale de datos reales
  capturados; nunca se inventa.

## Dinero: no mezclar unidades

- `profit_unit`: `'eur'` (BB) | `'units'` (Tipstrr; su escala "10/10").
  `profit` solo es comparable dentro de la misma unidad. La vista EUR de
  Tipstrr es derivación (unidades × stake configurado), nunca se almacena.
- `price_currency`: `'eur'` | `'gbp'`. El filtro de precio de la API se
  limita a `price_currency='eur'` hasta que exista UI consciente de divisa.
- `yield*` son % sin unidad: comparables solo cuando la consistencia del
  registro lo respalda (`yield` all-time se guarda null si falla cualquier
  chequeo; yields de periodo null si la ventana está incompleta).

## Campos nuevos

- `signup_at`: alta de la cuenta cuando la fuente la expone (Tipstrr
  `dateCreated`). BB mantiene `since_year` (primera apuesta) — no son lo
  mismo y no se mezclan.
- `captured_at`: instante de la captura para fuentes por captura
  (Tipstrr). null en BB (crawl en vivo). Es la fecha de frescura honesta.
- `followers` pasa a nullable: ausencia ≠ 0 (Tipstrr no lo expone).

## Ausencias Tipstrr (null, nunca 0)

`verified_pct`, `followers`, `since_year`, `last_pick_at` (granularidad mes
no es fecha de pick), `picks_free_3m_avg` / `yield_free_3m` (split free/paid
NO evaluable: control fallido 15-11-2026).

## Lecturas

- API `/api/tipsters`: `platform` opcional, **default `blogabet`** — la UI
  actual no cambia. `platform=tipstrr` explícito para opt-in.
- `lib/query.ts`: filtro `platform` aditivo; guarda de divisa en precio.
- Load more / paginación: sin cambios (page + PAGE_SIZE existentes).

## Rollback

La migración es aditiva + dos relajaciones. Vuelta atrás (documentada, no
ejecutada): borrar filas `platform='tipstrr'`, `DROP INDEX
ux_tipsters_platform_slug`, `DROP INDEX idx_tipsters_platform`, `ALTER TABLE
tipsters DROP COLUMN platform, profit_unit, price_currency, signup_at,
captured_at`, restaurar `followers` DEFAULT 0 NOT NULL y el unique de
`slug`. Las filas BB no se tocan en ningún sentido.

## Captura inicial vs actualización (propuesta, ambas gated)

- **Inicial, manual y puntual**: para cada perfil resuelto, una captura
  única con el navegador (cuenta propia) → archivo fechado en
  `crawler/platforms/tipstrr/captures/` → `load-capture.ts` →
  `tipstrrSnapshotToInsert` → upsert. Sin periodicidad, sin automatismo.
- **Actualización periódica**: decisión SEPARADA y posterior (cadencia
  explícita, términos de Tipstrr, riesgo de cuenta). Hoy no existe y no se
  propone fecha.

## Pruebas offline que respaldan esto

- `tests/crawler/tipstrr-load-capture.test.ts`: captura real → snapshot ==
  datos revisados (2 perfiles).
- `tests/crawler/tipstrr-to-db.test.ts`: snapshot → insert con unidades,
  divisa, nulls y yields verificados.
- `tests/lib/query.test.ts`: scoping por plataforma y guarda de divisa.
