# Persistencia multiplataforma (Blogabet + Tipstrr)

Estado 2026-11-15: **implementado en rama, NO ejecutado**. La migración
`drizzle/0004_multi_platform.sql` existe como archivo; no se ha aplicado a
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
- `profit` se amplía de `numeric(10,2)` a `numeric(12,3)`: el test de
  integración detectó que las unidades Tipstrr llevan 3 decimales reales
  (361.815) y (10,2) los truncaba silenciosamente a 361.82. La ampliación
  es sin pérdida para los datos BB existentes (2 decimales caben en 3).
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

## Prueba de integración (15-11-2026, rama, sin tocar Neon)

`tests/db/multi-platform.integration.test.ts` levanta Postgres real en
proceso (PGlite, devDependency) y aplica la cadena COMPLETA del journal
0000→0004 sin parches: el baseline de PR1 (0003_naive_dormammu, las 7
columnas de stats, ya registrado en producción) + nuestro delta 0004
generado por drizzle-kit con snapshot/journal reales. Con datos fabricados
verifica 8/8:
migración limpia y filas BB intactas, coexistencia de slug entre fuentes,
scope default BB / opt-in Tipstrr, orden por yield con ids negativos y
profits de unidades distintas sin mezclar, filtro de precio solo EUR +
señal `priceFilterIgnored` cuando platform=tipstrr, paginación OFFSET
estable con ids negativos, ausencias null nunca 0, y rollback documentado
que deja la tabla en su forma BB. NO prueba la migración contra los datos
reales de Neon: eso sigue pendiente de aprobación.

## Lecturas

- API `/api/tipsters`: `platform` opcional, **default `blogabet`** — la UI
  actual no cambia. `platform=tipstrr` explícito para opt-in.
- `lib/query.ts`: filtro `platform` aditivo; guarda de divisa en precio.
- Load more / paginación: sin cambios (page + PAGE_SIZE existentes).

## Alcance del crawler Blogabet

Toda consulta del crawler BB lleva filtro `platform='blogabet'`
(`crawler/bb-scope.ts`): el borrado de obsoletos por slug, la cohorte de
stats y la limpieza de inactivos no tocan filas Tipstrr aunque compartan
slug. Regresión: `tests/db/crawler-scope.integration.test.ts` (4/4).

## Rollback

La migración es aditiva + dos relajaciones. Vuelta atrás (documentada, no
ejecutada): borrar filas `platform='tipstrr'`, `DROP INDEX
ux_tipsters_platform_slug`, `DROP INDEX idx_tipsters_platform`, `ALTER TABLE
tipsters DROP COLUMN platform, profit_unit, price_currency, signup_at,
captured_at` (0004 solo; el baseline 0003 de PR1 ya está en producción y
no se toca), restaurar `followers` DEFAULT 0 NOT NULL y el unique de
`slug`. El ensanche de `profit` a (12,3) NO se revierte: es sin pérdida y
revertirlo truncaría decimales si ya hubiera filas con 3. Las filas BB no
se tocan en ningún otro sentido.

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
