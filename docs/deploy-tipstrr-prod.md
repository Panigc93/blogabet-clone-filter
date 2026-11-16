# Runbook despliegue Tipstrr a producción (2026-11-15)

Autorización: usuario 17:57/18:01 CET ("sube los 98... y recoge el resto").
Alcance: 98 perfiles con histórico verificado; los 111 NO se publican sin
validar. Sin cron Tipstrr, sin fixtures en prod, sin cuentas/gasto nuevos.
Revisión independiente del diff/secuencia ANTES de cualquier write.

Credencial: vault login "Neon blogabet (cadena de conexión DATABASE_URL)"
(subcampo password, vía `tools vault write-file` en contexto del agente
ejecutor; nunca por chat; borrar el archivo al terminar). Endpoint pooler,
rol `neondb_owner` (owner de tipsters; DDL suficiente). Verificado
2026-11-15 18:02 CET: prod tiene aplicadas 0000-0003 (hashes creados
1774021549853/1774029714000/1793004304000/1793331536142), 11167 filas BB,
sin columna platform, sin secuencia ni tabla de log.

## Secuencia (en este orden)

Orden clave (corrección de revisión): ESQUEMA → CÓDIGO DESPLEGADO VERDE →
DATOS. No se insertan filas Tipstrr mientras el master viejo (código BB
sin scoping por plataforma) pueda ejecutarse contra la base: las
migraciones son aditivas y seguras para el código viejo; el import va
DESPUÉS de que el despliegue nuevo esté verde.

0. Head de rama revisado; `DATABASE_URL` presente solo en el entorno del
   ejecutor; todo dry-run primero. Sin cron Tipstrr y sin run manual del
   crawler BB en todo el proceso.
1. BACKUP verificable (registrar la hora UTC de la copia):
   `SELECT now() AT TIME ZONE 'UTC' AS backup_started_utc;`
   `CREATE TABLE tipsters_backup_20261115 AS SELECT * FROM tipsters;`
   Comprobar: `SELECT count(*) FROM tipsters_backup_20261115;` = conteo
   vivo actual (leerlo de nuevo; no asumir 11167 fijo).
2. HUELLA PRE (variante A, toda la tabla: aún no existe platform) — guardar
   el valor (ver §Huella).
3. Aplicar migraciones 0004 y 0005 EN ORDEN:
   `DATABASE_URL_DIRECT=$(cat <archivo vault>) npx drizzle-kit migrate`
   (drizzle registra journal en drizzle.__drizzle_migrations; los `when`
   del journal son 1794753604217 (0004) y 1794762079604 (0005), ambos
   posteriores a las 4 filas existentes). Precheck: la constraint
   `tipsters_slug_unique` existe (0004 la elimina sin IF EXISTS):
   `SELECT 1 FROM pg_constraint WHERE conname='tipsters_slug_unique';`
4. HUELLA POST-migraciones (variante B, `WHERE platform='blogabet'`):
   debe ser IGUAL a la PRE. Conteo sigue 11167. Si difiere: STOP,
   rollback §. (El master viejo sigue funcionando aquí: columnas
   aditivas con default 'blogabet'.)
5. Merge de la rama a master → despliegue Vercel producción (las 4
   variables de entorno ya están en Production) → VERIFICAR DESPLIEGUE
   VERDE: endpoint prod responde, listado BB intacto con el código nuevo
   (filtro platform), sin errores en logs. Si falla: revert del
   despliegue/merge; la base sigue siendo compatible con el master viejo.
6. Dry-run import: `DATABASE_URL=$(cat <archivo vault>) npx tsx
   scripts/import-tipstrr-prod.ts` — plan esperado: 98 insert, 0 update,
   111 skip (cuarentena). Revisar skipDetail antes de aplicar. (La
   composición SQL del insert/update ya está validada contra PGlite con
   esquema real en tests/crawler/import-prod-sql.test.ts: nextval interno
   atómico, update sin tocar identidad, id capturado del origen.)
7. Apply: mismo comando con `--apply`. Por perfil, transacción atómica;
   ids internos por secuencia; cada skip deja fila en
   import_validation_log.
8. Verificaciones POST (el propio script las imprime y aborta si hay ids
   de fixture): por plataforma blogabet=11167 y tipstrr=98; fixtureIds=0;
   validationLogRows=111. HUELLA BB (variante B) de nuevo = PRE.
   Spot-check 3 filas Tipstrr contra sus capturas (picks/profit/yield).
9. Prueba visual y endpoint prod: listado muestra 98 Tipstrr con filtros
   por plataforma; BB intacto.

## Huella de integridad BB

Determinista sobre columnas de negocio, ordenada por id; tolera el cambio
intencional de formato numérico de 0004 (round a 2) y excluye columnas
nuevas/defaults y updated_at:

```sql
-- Variante A (antes de 0004): sin filtro.
-- Variante B (después de 0004): añadir WHERE platform = 'blogabet'.
SELECT count(*) AS n, md5(string_agg(h, '' ORDER BY id)) AS fp FROM (
  SELECT id, md5(concat_ws('|', id, slug, name,
    coalesce(avatar_url,'~'), coalesce(flag_url,'~'), coalesce(country_code,'~'),
    is_paid, coalesce(price::text,'~'), coalesce(since_year::text,'~'), picks,
    coalesce(round(profit::numeric,2)::text,'~'), coalesce(yield::text,'~'),
    coalesce(verified_pct::text,'~'), coalesce(followers::text,'~'),
    coalesce(last_pick_at::text,'~'), reset_count, coalesce(last_reset_at::text,'~'),
    coalesce(picks_6m_avg::text,'~'), coalesce(yield_3m::text,'~'),
    coalesce(yield_6m::text,'~'), coalesce(yield_12m::text,'~'),
    coalesce(picks_free_3m_avg::text,'~'), coalesce(yield_free_3m::text,'~'),
    coalesce(stats_updated_at::text,'~'), is_verified)) AS h
  FROM tipsters -- WHERE platform = 'blogabet'  (variante B)
) t;
```

## Rollback

- Solo el import (migraciones sanas):
  `DELETE FROM tipsters WHERE platform = 'tipstrr';`
  `DELETE FROM import_validation_log WHERE run_id LIKE 'tipstrr-prod-20261115%';`
  No toca filas BB. La secuencia queda con gaps: inofensivo (surrogate).
- Migraciones (solo si 0004/0005 rompen algo y la huella lo confirma).
  El backup es pre-0004 (esquema viejo): NUNCA `INSERT ... SELECT *`
  contra la tabla ya migrada; restaurar con columnas ORIGINALES
  explícitas:
  ```sql
  BEGIN;
  TRUNCATE tipsters;
  INSERT INTO tipsters (id, slug, name, avatar_url, flag_url, country_code,
    is_paid, price, since_year, picks, profit, yield, verified_pct,
    followers, last_pick_at, reset_count, updated_at, last_reset_at,
    picks_6m_avg, yield_3m, yield_6m, yield_12m, stats_updated_at,
    picks_free_3m_avg, yield_free_3m, is_verified)
  SELECT id, slug, name, avatar_url, flag_url, country_code,
    is_paid, price, since_year, picks, profit, yield, verified_pct,
    followers, last_pick_at, reset_count, updated_at, last_reset_at,
    picks_6m_avg, yield_3m, yield_6m, yield_12m, stats_updated_at,
    picks_free_3m_avg, yield_free_3m, is_verified
  FROM tipsters_backup_20261115;
  COMMIT;
  ```
  después `ALTER TABLE tipsters DROP COLUMN source_portfolio_id;` (y las
  de 0004 si se revierte también 0004), `DROP TABLE import_validation_log;
  DROP SEQUENCE tipsters_internal_id_seq;`, revert del despliegue Vercel
  asociado, y limpiar el journal de drizzle para 0004/0005.
  NOTA: no asumir PITR ni plan de backups de Neon sin verificarlo; la
  ruta de recuperación verificable es esta tabla de backup.
- Nunca restaurar filas BB viejas salvo huella rota confirmada; nunca
  inyectar fixtures.

## Run de recuperación sport/6 (pendiente de autorización)

El importador aplica automáticamente el override sport/6 cuando existe
`captures/2026-11-15-sport6/<slug>.json` (solo los 111 recuperados): sustituye
el overview por los totales all-time advised de `/api/portfolio/<slug>/stats/sport/6`
y la puerta estricta re-verifica el cierre de 3 cifras contra la serie embebida.
`revenue-faq` está excluido por revisión (serie empieza ~1 año tras el alta).
Resultado esperado del run: 100 inserts nuevos, 10 cuarentena, 1 excluido,
97+TLE skip no-más-reciente. Mismo procedimiento --apply y verificación post-import.
