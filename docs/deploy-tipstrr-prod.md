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

0. Head de rama revisado; `DATABASE_URL` presente solo en el entorno del
   ejecutor; todo dry-run primero.
1. BACKUP verificable:
   `CREATE TABLE tipsters_backup_20261115 AS SELECT * FROM tipsters;`
   Comprobar: `SELECT count(*) FROM tipsters_backup_20261115;` = 11167.
2. HUELLA PRE (variante A, toda la tabla: aún no existe platform) — guardar
   el valor (ver §Huella).
3. Aplicar migraciones 0004 y 0005 EN ORDEN:
   `DATABASE_URL_DIRECT=$(cat <archivo vault>) npx drizzle-kit migrate`
   (drizzle registra journal en drizzle.__drizzle_migrations; los `when`
   del journal son 1794753604217 (0004) y 1794762079604 (0005), ambos
   posteriores a las 4 filas existentes). Precheck: la constraint
   `tipsters_slug_unique` existe (0004 la elimina sin IF EXISTS):
   `SELECT 1 FROM pg_constraint WHERE conname='tipsters_slug_unique';`
4. HUELLA POST-0004 (variante B, `WHERE platform='blogabet'`): debe ser
   IGUAL a la PRE. Conteo sigue 11167. Si difiere: STOP, rollback §.
5. Dry-run import: `DATABASE_URL=$(cat <archivo vault>) npx tsx
   scripts/import-tipstrr-prod.ts` — plan esperado: 98 insert, 0 update,
   111 skip (cuarentena). Revisar skipDetail antes de aplicar.
6. Apply: mismo comando con `--apply`. Por perfil, transacción atómica;
   ids internos por secuencia; cada skip deja fila en
   import_validation_log.
7. Verificaciones POST (el propio script las imprime y aborta si hay ids
   de fixture): por plataforma blogabet=11167 y tipstrr=98; fixtureIds=0;
   validationLogRows=111. HUELLA BB (variante B) de nuevo = PRE.
   Spot-check 3 filas Tipstrr contra sus capturas (picks/profit/yield).
8. Merge de la rama a master (revisión independiente previa) → despliegue
   Vercel producción (las 4 variables de entorno ya están en Production;
   el código actual de master sigue funcionando tras 0004: columnas
   aditivas con default 'blogabet').
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
- Migraciones (solo si 0004/0005 rompen algo y la huella lo confirma):
  `BEGIN; TRUNCATE tipsters; INSERT INTO tipsters SELECT * FROM
  tipsters_backup_20261115; COMMIT;` (el backup es pre-0004: tiene todas
  las columnas originales; las nuevas vuelven a su estado al re-aplicar o
  se eliminan), después `ALTER TABLE tipsters DROP COLUMN
  source_portfolio_id;` (y las de 0004 si se revierte también 0004),
  `DROP TABLE import_validation_log; DROP SEQUENCE
  tipsters_internal_id_seq;`, revert del despliegue Vercel asociado, y
  limpiar el journal de drizzle para 0004/0005.
- Nunca restaurar filas BB viejas salvo huella rota confirmada; nunca
  inyectar fixtures.
