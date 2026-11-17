import type { TipsterInsert } from '@/db/schema'
import type { BatchRow } from './batch'

/** Pure insert preparation only. IDs are assigned by a future reviewed importer. */
export function bettingexpertToInsert(row: BatchRow, id: number): TipsterInsert {
  if (!row.ok) throw new Error('rejected-capture')
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('invalid-internal-id')
  if (!row.username.trim() || /[/?#]/.test(row.username) || !Number.isSafeInteger(row.picks) || row.picks < 0 || !Number.isFinite(row.profit) || !Number.isFinite(row.yieldPct) || !Number.isFinite(Date.parse(row.capturedAt))) throw new Error('invalid-capture')
  // Existing numeric columns store profit at 3dp and yield at 2dp. Raw API
  // precision stays in the private source manifest, not invented in DB.
  if (Math.abs(row.profit) >= 1e9 || Math.abs(row.yieldPct) >= 1e4) throw new Error('numeric-column-overflow')
  return {
    id, platform: 'bettingexpert', slug: row.username, name: row.username,
    profitUnit: 'bettingexpert-points', priceCurrency: 'eur',
    picks: row.picks, profit: String(row.profit), yield: String(row.yieldPct),
    // Public free-tip source; no premium offering is inferred from ranking.
    isPaid: false, price: null, avatarUrl: null, flagUrl: null, countryCode: null,
    sinceYear: null, signupAt: null, lastPickAt: null, followers: null,
    verifiedPct: null, isVerified: false, resetCount: 0, lastResetAt: null,
    capturedAt: new Date(row.capturedAt), statsUpdatedAt: new Date(row.capturedAt),
    yield3m: null, yield6m: null, yield12m: null, picks6mAvg: null,
    picksFree3mAvg: null, yieldFree3m: null, sourcePortfolioId: null,
  }
}
