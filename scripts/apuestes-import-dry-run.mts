import { readFileSync } from 'node:fs'

// Local import dry-run, no DB: read the Apuestes capture JSONL, apply the
// documented field-by-field mapping (docs/apuestes-import-mapping.md), and
// report the exact counts an importer would produce. Verifies the package
// is internally consistent before any load decision. Usage:
//   npx tsx scripts/apuestes-import-dry-run.mts [path-to-jsonl]

const JSONL = process.argv[2] ?? new URL('../data/apuestes/profiles.jsonl', import.meta.url).pathname

interface Row {
  id: number
  username: string
  http: string
  error?: string
  hist?: Record<string, number | null>
  m3?: Record<string, number | null>
  m6?: Record<string, number | null>
  m12?: Record<string, number | null>
  months?: Array<{ numpicks: number }>
  isPaid?: boolean
  quarantine?: { http: string; reason: string } | null
  discrepancy?: { field: string; listingValue: number; profileValue: number } | null
}

const counts = {
  rows: 0,
  quarantined: 0,
  usable: 0,
  usableVerifiedFree: 0,
  usableVerifiedPaid: 0,
  unknownClassification: 0,
  discrepancyFlagged: 0,
  importHeldDiscrepancy: 0,
  importHeldMonthsIncomplete: 0,
  importHeldYieldRange: 0,
  monthsIncomplete: 0,
  importable: 0,
  yieldForcedNullOnEmptyWindowM3: 0,
  yieldForcedNullOnEmptyWindowM6: 0,
  yieldForcedNullOnEmptyWindowM12: 0,
  windowPicksGtHistM3: 0,
  windowPicksGtHistM6: 0,
  windowPicksGtHistM12: 0,
  windowOrderViolations: 0,
  usableWithoutMonths: 0,
}

// Schema compatibility, validated against db/schema.ts (2026-11-20):
//  - tipsters.picks is integer NOT NULL DEFAULT 0. A null/unknown totalPicks
//    is NOT representable field-level: inserting 0 would fabricate data.
//    Therefore a discrepancy row is HELD OUT of the import set entirely
//    (row-level hold), and the hold is logged in the shape of the existing
//    import_validation_log table (klass 'cuarentena[totalPicks-discrepancy]').
//    Both source values stay only in the private raw dataset.
//  - yield / yield_3m / yield_6m / yield_12m are nullable numeric, so NULL
//    yield on an empty window IS supported and is the only correct value.
//  - There is no months table: months stay in the raw dataset only.
interface HoldLog { id: number; username: string; klass: string; reason: string }
const holdLog: HoldLog[] = []
const monthsIncompleteIds: number[] = []

// Import projection for one usable row. Returns null when the row is held
// out of the import set. Rows held:
//  - discrepancy rows (27): totalPicks not representable (schema picks NOT
//    NULL) and neither side validated.
//  - months-incomplete rows (2: ids 54750, 54299): the site exposes only
//    recent months for them; per main's instruction they are set apart
//    COMPLETELY for now, pending adjudication — not imported with just the
//    months field stripped. Originals stay in the private raw dataset.
function projectForImport(row: Row, monthsIncomplete: boolean) {
  if (row.discrepancy) {
    holdLog.push({
      id: row.id,
      username: row.username,
      klass: 'cuarentena[totalPicks-discrepancy]',
      reason: 'listing totalPicks disagrees with profile hist.totalPicks; neither side validated; schema picks is NOT NULL so no field-level null is representable',
    })
    return null
  }
  if (monthsIncomplete) {
    holdLog.push({
      id: row.id,
      username: row.username,
      klass: 'cuarentena[months-incomplete]',
      reason: 'sum(months.numpicks) below hist.totalPicks: site exposes only recent months; row held pending adjudication',
    })
    return null
  }
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null }
  for (const [label, w] of [['hist', row.hist], ['m3', row.m3], ['m6', row.m6], ['m12', row.m12]] as const) {
    const y = num(w?.yield)
    if (y !== null && Math.abs(y) >= 10000) {
      holdLog.push({
        id: row.id,
        username: row.username,
        klass: 'cuarentena[yield-out-of-schema-range]',
        reason: `${label} yield ${y} exceeds numeric(6,2); row held pending column-widening decision`,
      })
      return null
    }
  }
  const proj: Record<string, unknown> = {
    id: row.id,
    username: row.username,
    totalPicks: row.hist?.totalPicks ?? null,
    months: row.months ?? [],
  }
  return proj
}

for (const line of readFileSync(JSONL, 'utf8').split('\n')) {
  if (!line.trim()) continue
  const row = JSON.parse(line) as Row
  counts.rows++
  if (row.quarantine) {
    counts.quarantined++
    counts.unknownClassification++
    continue
  }
  const hist = row.hist ?? {}
  if (typeof hist.totalPicks !== 'number' || hist.totalPicks <= 0 || !row.months?.length) {
    // A row outside quarantine with no usable content would be a package bug.
    counts.usableWithoutMonths++
    continue
  }
  counts.usable++
  // Recompute isPaid from profile evidence only, never trust the flag blindly.
  // The JSONL stores plans as {key: price}; isPaidProfile in types.ts takes
  // full plan objects, so apply the same rule on the flattened shape here.
  const r = row as Record<string, unknown>
  const plans = (r.plans ?? {}) as Record<string, number | null>
  const paid = ((r.pickPrice as number | null) ?? 0) > 0 ||
    Object.values(plans).some(price => (price ?? 0) > 0)
  if (paid !== Boolean(row.isPaid)) {
    console.log(`PAID-FLAG-MISMATCH ${row.username}: recomputed ${paid}, stored ${row.isPaid}`)
  }
  if (paid) counts.usableVerifiedPaid++
  else counts.usableVerifiedFree++
  if (row.discrepancy) counts.discrepancyFlagged++
  const monthsSum = (row.months ?? []).reduce((s, m) => s + (m.numpicks ?? 0), 0)
  const monthsIncomplete = monthsSum < (hist.totalPicks ?? 0)
  if (monthsIncomplete) {
    counts.monthsIncomplete++
    monthsIncompleteIds.push(row.id)
  }
  const proj = projectForImport(row, monthsIncomplete)
  if (proj === null) {
    if (row.discrepancy) counts.importHeldDiscrepancy++
    else if (monthsIncomplete) counts.importHeldMonthsIncomplete++
    else counts.importHeldYieldRange++
  } else counts.importable++
  const w3 = row.m3 ?? {}, w6 = row.m6 ?? {}, w12 = row.m12 ?? {}
  const p3 = w3.totalPicks ?? 0, p6 = w6.totalPicks ?? 0, p12 = w12.totalPicks ?? 0
  if (!(p3 <= p6 && p6 <= p12)) counts.windowOrderViolations++
  for (const [w, win] of [['M3', w3], ['M6', w6], ['M12', w12]] as const) {
    if ((win.totalPicks ?? 0) === 0 && win.yield == null) {
      counts[`yieldForcedNullOnEmptyWindow${w}` as keyof typeof counts]++
    }
    if (typeof win.totalPicks === 'number' && win.totalPicks > (hist.totalPicks ?? 0)) {
      counts[`windowPicksGtHist${w}` as keyof typeof counts]++
    }
  }
}

console.log(JSON.stringify(counts, null, 2))

const expected = {
  rows: 3716,
  quarantined: 27,
  usable: 3689,
  usableVerifiedFree: 3436,
  usableVerifiedPaid: 253,
  unknownClassification: 27,
  discrepancyFlagged: 27,
  importHeldDiscrepancy: 27,
  importHeldMonthsIncomplete: 2,
  importHeldYieldRange: 1,
  monthsIncomplete: 2,
  importable: 3659,
  yieldForcedNullOnEmptyWindowM3: 3573,
  yieldForcedNullOnEmptyWindowM6: 3528,
  yieldForcedNullOnEmptyWindowM12: 3396,
  windowPicksGtHistM3: 0,
  windowPicksGtHistM6: 0,
  windowPicksGtHistM12: 0,
  windowOrderViolations: 0,
  usableWithoutMonths: 0,
}
let bad = 0
for (const [k, v] of Object.entries(expected)) {
  const actual = counts[k as keyof typeof counts]
  if (actual !== v) {
    console.log(`ASSERT-FAIL ${k}: expected ${v}, got ${actual}`)
    bad++
  }
}
const expectedMonthsIncomplete = [54299, 54750]
if (JSON.stringify([...monthsIncompleteIds].sort((a, b) => a - b)) !== JSON.stringify(expectedMonthsIncomplete)) {
  console.log(`ASSERT-FAIL monthsIncompleteIds: expected ${expectedMonthsIncomplete}, got ${monthsIncompleteIds}`)
  bad++
}
console.log(bad ? `${bad} assertions FAILED` : 'all assertions passed')
process.exit(bad ? 1 : 0)
