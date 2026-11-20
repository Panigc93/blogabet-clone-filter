import { readFileSync, readdirSync } from 'node:fs'
// Namespace imports: the package has no "type":"module", so tsx compiles the
// crawler .ts files as CJS and static named ESM bindings are not detectable.
import * as apParse from '../crawler/platforms/apuestes/parse'
import * as apTypes from '../crawler/platforms/apuestes/types'
// CJS interop lands the transpiled exports on .default.
const { parseApuestesProfile } = (apParse as { default?: typeof apParse }).default ?? apParse
const { isPaidProfile } = (apTypes as { default?: typeof apTypes }).default ?? apTypes

// Real-parser equivalence check: run the repo TypeScript parser over the raw
// profile HTMLs preserved from the validated sample and diff field-by-field
// against the Python-parsed capture checkpoints for the same usernames. The
// full-capture raw HTML was deleted by design after parsing (16 MB of JSON
// kept instead of ~1.8 GB of HTML), so this covers the 11 raw pages that
// survive; a full-coverage rerun needs an authorized recapture. All evidence
// lives in the repo under evidence/apuestes/ (gitignored, personal data).
// Usage: npx tsx scripts/apuestes-parse-equivalence.mts [htmlDir] [captureDir] [sampleJson]

const EVIDENCE = new URL('../evidence/apuestes', import.meta.url).pathname
const HTML_DIR = process.argv[2] ?? `${EVIDENCE}/html`
const CAPTURE_DIR = process.argv[3] ?? `${EVIDENCE}/capture`
const SAMPLE_JSON = process.argv[4] ?? `${EVIDENCE}/ap_sample.json`

const PERIOD_FIELDS = [
  'totalPicks', 'totalProfit', 'stakeAvg', 'oddsAvg',
  'winPicks', 'lostPicks', 'nullPicks', 'winRate', 'yield',
] as const

type Period = Record<string, number | null>

function normalize(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function diffPeriod(name: string, ts: Period, py: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const f of PERIOD_FIELDS) {
    const a = ts[f]
    const b = normalize(py[f])
    if (a === b) continue
    // Python kept raw nulls; TS coerces absent totalPicks to 0 by design.
    if (f === 'totalPicks' && b === null && a === 0) continue
    if (a !== null && b !== null && Math.abs((a as number) - (b as number)) < 1e-9) continue
    out.push(`${name}.${f}: ts=${String(a)} py=${String(b)}`)
  }
  return out
}

let checked = 0
let failed = 0
for (const file of readdirSync(HTML_DIR).filter(f => f.endsWith('.html'))) {
  const username = file.replace(/\.html$/, '')
  const html = readFileSync(`${HTML_DIR}/${file}`, 'utf8')
  const ts = parseApuestesProfile(html)
  const ckpt = `${CAPTURE_DIR}/${username}.json`
  let py: Record<string, unknown>
  try {
    py = JSON.parse(readFileSync(ckpt, 'utf8'))
  } catch {
    // Two sample profiles (ElKaiser, Tradingchevaux) have 0 listing picks and
    // were never in the mass capture; compare against the compact validated
    // sample instead: [totalPicks, yield] per period.
    const sample = JSON.parse(readFileSync(SAMPLE_JSON, 'utf8')) as Array<Record<string, unknown>>
    const row = sample.find(r => r.user === username)
    if (!row) { failed++; console.log(`NO-REFERENCE ${username}`); continue }
    const pairs: Array<[string, unknown, unknown]> = [
      ['historico', ts.historico, row.hist], ['m3', ts.m3, row.m3],
      ['m6', ts.m6, row.m6], ['m12', ts.m12, row.m12],
    ]
    const probs: string[] = []
    for (const [name, per, ref] of pairs) {
      const [rp, ry] = ref as [number, number]
      const t = per as { totalPicks: number; yield: number | null }
      if (t.totalPicks !== rp || Math.abs((t.yield ?? 0) - ry) > 1e-9 && t.yield !== ry) probs.push(`${name}: ts=[${t.totalPicks},${t.yield}] ref=[${rp},${ry}]`)
    }
    if (ts.lastActivityMonth !== row.last) probs.push(`last: ts=${ts.lastActivityMonth} ref=${row.last}`)
    checked++
    if (probs.length) { failed++; console.log(`MISMATCH ${username} (sample-ref): ${probs.join(' | ')}`) }
    else console.log(`OK ${username} (sample-ref, reduced: picks+yield+last)`)
    continue
  }

  const problems: string[] = []
  if (String(py.id ?? '') !== String(ts.id)) problems.push(`id: ts=${ts.id} py=${py.id}`)
  if (normalize(py.followers) !== ts.followers) problems.push('followers')
  if (normalize(py.pickPrice) !== ts.pickPrice) problems.push('pickPrice')
  const tsPlans = Object.fromEntries(Object.entries(ts.pricePlans ?? {}).map(([k, v]) => [k, v.price]))
  if (JSON.stringify(tsPlans) !== JSON.stringify(py.plans ?? {})) problems.push('plans')
  if (ts.lastActivityMonth !== (py.lastActivityMonth ?? null)) problems.push('lastActivityMonth')
  const tsPaid = isPaidProfile(ts)
  if (tsPaid !== Boolean(py.isPaid)) problems.push(`isPaid: ts=${tsPaid} py=${py.isPaid}`)
  problems.push(...diffPeriod('historico', ts.historico as Period, py.hist ?? {}))
  problems.push(...diffPeriod('m3', ts.m3 as Period, py.m3 ?? {}))
  problems.push(...diffPeriod('m6', ts.m6 as Period, py.m6 ?? {}))
  problems.push(...diffPeriod('m12', ts.m12 as Period, py.m12 ?? {}))

  checked++
  if (problems.length) {
    failed++
    console.log(`MISMATCH ${username}: ${problems.join(' | ')}`)
  } else {
    console.log(`OK ${username}`)
  }
}
console.log(`---\n${checked} profiles checked, ${failed} mismatches`)
process.exit(failed ? 1 : 0)
