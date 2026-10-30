import { Tipster } from '@/db/schema'

// CSV export of the listing. Columns mirror fields already visible in the UI
// (no new/private data); stats_updated_at is included as freshness metadata.

interface CsvColumn {
  header: string
  value: (t: Tipster) => string
}

function isoOrEmpty(value: Date | string | null): string {
  if (!value) return ''
  const d = new Date(value)
  return isNaN(d.getTime()) ? '' : d.toISOString()
}

export const TIPSTER_CSV_COLUMNS: CsvColumn[] = [
  { header: 'name',              value: t => t.name },
  { header: 'slug',              value: t => t.slug },
  { header: 'url',               value: t => `https://${t.slug}.blogabet.com` },
  { header: 'tipo',              value: t => (t.isPaid ? 'paid' : 'free') },
  { header: 'price',             value: t => t.price ?? '' },
  { header: 'since_year',        value: t => (t.sinceYear != null ? String(t.sinceYear) : '') },
  { header: 'picks',             value: t => String(t.picks) },
  { header: 'profit',            value: t => t.profit ?? '' },
  { header: 'yield',             value: t => t.yield ?? '' },
  { header: 'verified_pct',      value: t => t.verifiedPct ?? '' },
  { header: 'is_verified',       value: t => (t.isVerified ? '1' : '0') },
  { header: 'followers',         value: t => String(t.followers) },
  { header: 'yield_3m',          value: t => t.yield3m ?? '' },
  { header: 'yield_6m',          value: t => t.yield6m ?? '' },
  { header: 'yield_12m',         value: t => t.yield12m ?? '' },
  { header: 'picks_6m_avg',      value: t => t.picks6mAvg ?? '' },
  { header: 'picks_free_3m_avg', value: t => t.picksFree3mAvg ?? '' },
  { header: 'yield_free_3m',     value: t => t.yieldFree3m ?? '' },
  { header: 'reset_count',       value: t => String(t.resetCount) },
  { header: 'last_reset_at',     value: t => isoOrEmpty(t.lastResetAt) },
  { header: 'stats_updated_at',  value: t => isoOrEmpty(t.statsUpdatedAt) },
]

function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function toCsv(rows: Tipster[], columns: CsvColumn[] = TIPSTER_CSV_COLUMNS): string {
  const header = columns.map(c => escapeCell(c.header)).join(',')
  const lines = rows.map(row => columns.map(c => escapeCell(c.value(row))).join(','))
  return [header, ...lines].join('\r\n') + '\r\n'
}
