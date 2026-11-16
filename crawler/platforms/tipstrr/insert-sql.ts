// Composición SQL de alta/actualización de tipsters, COMPARTIDA por
// scripts/import-tipstrr-prod.ts y scripts/import-tipstrr-catalog.ts.
// Extraída 2026-11-15 para que el import de catálogo use el MISMO builder
// probado (PGlite en tests/crawler/import-catalog-sql.test.ts e
// import-prod-sql.test.ts) en vez de una copia local. Mantener aquí cualquier
// cambio de esquema: ambos imports lo heredan.
import type { TipsterInsert } from '@/db/schema'

export const COLUMNS: [keyof TipsterInsert, string][] = [
  ['platform', 'platform'], ['slug', 'slug'], ['name', 'name'],
  ['profitUnit', 'profit_unit'], ['priceCurrency', 'price_currency'],
  ['avatarUrl', 'avatar_url'], ['flagUrl', 'flag_url'], ['countryCode', 'country_code'],
  ['isPaid', 'is_paid'], ['price', 'price'], ['sinceYear', 'since_year'],
  ['picks', 'picks'], ['profit', 'profit'], ['yield', 'yield'],
  ['verifiedPct', 'verified_pct'], ['isVerified', 'is_verified'],
  ['followers', 'followers'], ['lastPickAt', 'last_pick_at'],
  ['signupAt', 'signup_at'], ['capturedAt', 'captured_at'],
  ['resetCount', 'reset_count'], ['lastResetAt', 'last_reset_at'],
  ['picks6mAvg', 'picks_6m_avg'], ['yield3m', 'yield_3m'], ['yield6m', 'yield_6m'],
  ['yield12m', 'yield_12m'], ['picksFree3mAvg', 'picks_free_3m_avg'],
  ['yieldFree3m', 'yield_free_3m'], ['statsUpdatedAt', 'stats_updated_at'],
  ['sourcePortfolioId', 'source_portfolio_id'],
]

export function buildInsert(insert: TipsterInsert, internalId: boolean): { text: string; params: unknown[] } {
  const cols: string[] = ['id']
  const vals: string[] = []
  const params: unknown[] = []
  if (internalId) {
    // Id surrogate generado por la secuencia interna en la propia
    // transacción del INSERT (sin placeholder).
    vals.push(`nextval('tipsters_internal_id_seq')`)
  } else {
    params.push(insert.id)
    vals.push(`$${params.length}`)
  }
  for (const [key, col] of COLUMNS) {
    const v = insert[key]
    if (v === undefined) continue // defaults de esquema
    cols.push(col)
    params.push(v)
    vals.push(`$${params.length}`)
  }
  return {
    text: `INSERT INTO tipsters (${cols.join(', ')}) VALUES (${vals.join(', ')})`,
    params,
  }
}

export function buildUpdate(id: number, merged: TipsterInsert): { text: string; params: unknown[] } {
  const sets: string[] = []
  const params: unknown[] = []
  for (const [key, col] of COLUMNS) {
    if (key === 'platform' || key === 'slug') continue // identidad inmutable
    const v = merged[key]
    if (v === undefined) continue
    params.push(v)
    sets.push(`${col} = $${params.length}`)
  }
  params.push(id)
  return { text: `UPDATE tipsters SET ${sets.join(', ')} WHERE id = $${params.length}`, params }
}

// PG devuelve numeric como string: camelize revierte el mapeo de columnas.
export const NUMERIC_KEYS = new Set([
  'price', 'profit', 'yield', 'verifiedPct',
  'picks6mAvg', 'yield3m', 'yield6m', 'yield12m', 'picksFree3mAvg', 'yieldFree3m',
])
export const camelize = (row: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    const key = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
    out[key] = NUMERIC_KEYS.has(key) && typeof v === 'string' ? Number(v) : v
  }
  return out
}
