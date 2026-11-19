import { querySanitizedProjection, sanitizeProjectionPage } from '@/lib/bettingexpert-research/projection-public'
import { B_BINDING_SHA256 } from '@/lib/bettingexpert-research/projection-evidence'
import { EVIDENCE_REVISION } from '@/lib/bettingexpert-research/evidence'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { loadSeparatedProjection } from '@/lib/bettingexpert-research/projection-evidence'
import { buildBEProjectionSQL, projectionCursor } from '@/lib/bettingexpert-research/projection-sql'
import { compareDecimal } from '@/lib/bettingexpert-research/query'
import type { BEProjectionInput, BEProjectionParams, BENumericQuality } from '@/lib/bettingexpert-research/projection-contract'
const directory = process.env.BE_TEST_EVIDENCE_DIR
const binding = process.env.BE_TEST_BINDING_FILE
const suite = directory && binding ? describe : describe.skip
const labels: BENumericQuality[] = ['strictNumber', 'strictExperimentalNumber', 'Bnumber', 'unreconciledNumber']
const params = (changes: Partial<BEProjectionParams> = {}): BEProjectionParams => ({
  period: '12m', policy: { allowedNumericLabels: [] }, minimumPeriodYield: null, minimumPeriodPicks: null,
  minimumGlobalYield: null, minimumGlobalPicks: null, search: '', sort: 'periodYield', pageSize: 25, cursor: null, ...changes,
})
type Result = { total: number; items: {guid: string; username: string; period_yield: string | null; period_picks: number | null; quality: string; global_yield: string | null; raw_state: string; effective_reason: string | null}[] }
const cmpName = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b))
function oracle(input: BEProjectionInput, q: BEProjectionParams) {
  return input.profiles.map(p => {
    const w = p.windows[q.period], eligible = w.state === 'number' && q.policy.allowedNumericLabels.includes(w.acceptedClassLabel as BENumericQuality)
    return { p, y: eligible ? w.yieldPct : null, n: eligible ? w.picks : null,
      g: p.global.state === 'observed' ? p.global.yieldPct : null, gn: p.global.state === 'observed' ? p.global.picks : null }
  }).filter(x => x.p.username.toLowerCase().includes(q.search.toLowerCase())
    && (q.minimumPeriodYield === null || (x.y !== null && compareDecimal(x.y, q.minimumPeriodYield) >= 0))
    && (q.minimumGlobalYield === null || (x.g !== null && compareDecimal(x.g, q.minimumGlobalYield) >= 0))
    && (q.minimumPeriodPicks === null || (x.n !== null && x.n >= q.minimumPeriodPicks))
    && (q.minimumGlobalPicks === null || (x.gn !== null && x.gn >= q.minimumGlobalPicks)))
    .sort((a, b) => {
      if (q.sort !== 'name') {
        const x = q.sort === 'periodYield' ? a.y : a.g, y = q.sort === 'periodYield' ? b.y : b.g
        if (x === null && y !== null) return 1
        if (x !== null && y === null) return -1
        if (x !== null && y !== null) { const d = compareDecimal(y, x); if (d) return d }
      }
      return cmpName(a.p.username, b.p.username) || cmpName(a.p.sourceGuid, b.p.sourceGuid)
    })
}
suite('isolated BE SQL projection, real fixed 547 evidence and Global separation', () => {
  let db: PGlite, input: BEProjectionInput
  beforeAll(() => { db = new PGlite(); input = loadSeparatedProjection(directory!, binding!) })
  afterAll(async () => db.close())
  async function query(q: BEProjectionParams, data = input): Promise<Result> {
    const s = buildBEProjectionSQL(data, q), result = await db.query<Result>(s.text, s.values)
    return result.rows[0]
  }
  it('binds 100 all-time Globals and leaves the other 447 missing, not inferred', () => {
    expect(input.profiles.filter(p => p.global.state === 'observed')).toHaveLength(100)
    expect(input.profiles.filter(p => p.global.state === 'not_bound')).toHaveLength(447)
    expect(() => loadSeparatedProjection(directory!, directory! + '/statistics547.json')).toThrow('Unreviewed B binding')
  })
  it('empty policy exposes no effective period numbers, preserves Global independently', async () => {
    const r = await query(params({ pageSize: 100, minimumGlobalYield: '-9999' }))
    expect(r.total).toBe(100); expect(r.items.every(x => x.period_yield === null && x.global_yield !== null)).toBe(true)
    expect(r.items.some(x => x.effective_reason === 'quality_not_selected')).toBe(true)
  })
  it('48 original and 3 experimental remain separately selectable across periods', async () => {
    for (const [quality, expected] of [['strictNumber', 48], ['strictExperimentalNumber', 3], ['Bnumber', 137], ['unreconciledNumber', 297]] as const) {
      let count = 0
      for (const period of ['3m', '6m', '12m'] as const) {
        const r = await query(params({period, policy: {allowedNumericLabels: [quality]}, minimumPeriodYield: '-9999'})); count += r.total
        expect(r.items.every(x => x.quality === quality && x.period_yield !== null)).toBe(true)
      }
      expect(count).toBe(expected)
    }
  })
  it('all 312 holds stay NULL even under all-quality test policy; empty stays distinct', async () => {
    let held = 0, empty = 0
    for (const period of ['3m', '6m', '12m'] as const) {
      const q = params({period, policy: {allowedNumericLabels: labels}, pageSize: 100, sort: 'name'})
      for (let offset = 0; offset < 547; offset += 100) {
        const r = await query({...q, cursor: offset ? projectionCursor(input, q, offset) : null})
        for (const w of r.items) {
          if (w.raw_state === 'held') { held++; expect(w.period_yield).toBeNull(); expect(w.period_picks).toBeNull(); expect(w.effective_reason).toBeTruthy() }
          if (w.raw_state === 'no_eligible_sample') { empty++; expect(w.period_yield).toBeNull() }
        }
      }
    }
    expect(held).toBe(312); expect(empty).toBe(844)
  })
  it('WHERE, ORDER, total and every page match independent decimal oracle for policies/filters/sorts', async () => {
    for (const period of ['3m', '6m', '12m'] as const) for (const allowed of [[], ['Bnumber'], labels] as BENumericQuality[][]) for (const sort of ['periodYield', 'globalYield', 'name'] as const) {
      const q = params({period, policy: {allowedNumericLabels: allowed}, sort, minimumPeriodYield: allowed.length ? '0' : null, minimumGlobalPicks: sort === 'globalYield' ? 2 : null})
      const expected = oracle(input, q), got: string[] = []
      for (let offset = 0; offset < Math.max(expected.length, 1); offset += 25) {
        const r = await query({...q, cursor: offset ? projectionCursor(input, q, offset) : null})
        expect(r.total).toBe(expected.length); got.push(...r.items.map(x => x.guid))
        for (const item of r.items) {
          const e = expected.find(x => x.p.sourceGuid === item.guid)!
          expect(item.period_yield === null ? e.y === null : compareDecimal(item.period_yield, e.y!) === 0).toBe(true)
        }
      }
      expect(got).toEqual(expected.map(x => x.p.sourceGuid)); expect(new Set(got).size).toBe(got.length)
    }
  }, 60000)
  it('Global and period predicates stay in their own metric domain', async () => {
    for (const changes of [
      {minimumPeriodPicks: 10}, {minimumGlobalPicks: 10},
      {minimumGlobalYield: '0'}, {minimumPeriodYield: '0'},
      {minimumGlobalYield: '0', minimumPeriodYield: '-5', minimumPeriodPicks: 2, minimumGlobalPicks: 15},
    ]) {
      const q = params({policy: {allowedNumericLabels: labels}, ...changes}), r = await query(q)
      const expected = oracle(input, q)
      expect(r.total).toBe(expected.length); expect(r.items.map(x => x.guid)).toEqual(expected.slice(0, 25).map(x => x.p.sourceGuid))
    }
    const global = await query(params({minimumGlobalYield: '0'}))
    const period = await query(params({minimumPeriodYield: '0'}))
    expect(global.total).toBeGreaterThan(0); expect(period.total).toBe(0)
  })
  it('page after the end still reports full count; search is literal and parameterized', async () => {
    const q = params({sort: 'name', pageSize: 100})
    const r = await query({...q, cursor: projectionCursor(input, q, 600)})
    expect(r.total).toBe(547); expect(r.items).toEqual([])
    for (const search of ["' OR TRUE; DROP TABLE tipsters; --", '%', '_']) {
      const s = buildBEProjectionSQL(input, params({search})); expect(s.text).toBe(buildBEProjectionSQL(input, params()).text); expect(s.values[7]).toBe(search)
      const actual = await query(params({search})); expect(actual.total).toBe(oracle(input, params({search})).length)
    }
  })
  it('revisions, policy and either filter domain invalidate continuations', () => {
    const q = params(), cursor = projectionCursor(input, q, 25)
    for (const changed of [{period: '3m'}, {policy: {allowedNumericLabels: ['Bnumber']}}, {minimumGlobalPicks: 10}, {minimumPeriodYield: '1'}, {sort: 'name'}, {search: 'x'}, {pageSize: 50}]) expect(() => buildBEProjectionSQL(input, {...q, ...changed, cursor} as BEProjectionParams)).toThrow()
    expect(() => buildBEProjectionSQL({...input, revision: 'different'}, {...q, cursor})).toThrow()
    for (const changed of [{policy: {allowedNumericLabels: ['held']}}, {minimumPeriodYield: 'NaN'}, {minimumGlobalPicks: -1}, {pageSize: 0}]) expect(() => buildBEProjectionSQL(input, {...q, ...changed} as unknown as BEProjectionParams)).toThrow()
  })
  it('rejects fabricated or cloned inputs, and freezes verified nested evidence', () => {
    for (const data of [structuredClone(input), {...input}, {}]) {
      expect(() => buildBEProjectionSQL(data as BEProjectionInput, params())).toThrow('verified loader')
      expect(() => projectionCursor(data as BEProjectionInput, params(), 25)).toThrow('verified loader')
    }
    expect(Object.isFrozen(input)).toBe(true); expect(Object.isFrozen(input.profiles[0].windows['12m'])).toBe(true)
    expect(() => {input.profiles[0].windows['12m'].yieldPct = '999'}).toThrow()
  })
  it('does not round PostgreSQL numeric values at the text delivery boundary', async () => {
    // Standalone SQL numeric check, not a fake trusted evidence instance.
    const r = await db.query<{v: string}>(`SELECT v::text AS v FROM (VALUES ('1.00000000000000000001'::numeric), ('1.00000000000000000002'::numeric)) t(v) WHERE v >= $1::numeric ORDER BY v DESC`, ['1.000000000000000000015'])
    expect(r.rows).toEqual([{v: '1.00000000000000000002'}])
  })
  it('public boundary always invokes verified loader and strips private SQL fields', async () => {
    const q = params({policy: {allowedNumericLabels: labels}, pageSize: 100})
    const result = await querySanitizedProjection(directory!, binding!, q, async (text,values) => db.query(text,values))
    const serialized = JSON.stringify(result)
    for (const key of ['global_observation', 'receiptSha256', 'rawSha256', 'capturedAt', 'anchorCapturedAt', 'jsonPointer', '/tmp/', 'globalCapturedAt', 'annual_warning', EVIDENCE_REVISION, B_BINDING_SHA256]) expect(serialized).not.toContain(key)
    const secrets = input.profiles.flatMap(p => [
      ...(p.global.state === 'observed' ? [p.global.capturedAt, p.global.receiptSha256, p.global.rawSha256] : []),
      ...Object.values(p.windows).flatMap(w => [w.capturedAt, w.anchorCapturedAt, w.globalCapturedAt, w.originalSourceEvidenceSha256, ...w.sources.flatMap(s => [s.artifact, s.sha256])]),
    ]).filter((x): x is string => typeof x === 'string' && x.length > 0)
    for (const secret of secrets) expect(serialized).not.toContain(secret)
    expect(Object.keys(result).sort()).toEqual(['platform','period','total','productionReady','nextCursor','items'].sort())
    for (const item of result.items) {
      expect(Object.keys(item.global).sort()).toEqual(['state','basis','yieldPct','picks','profit'].sort())
      expect(item.selected.range.endExclusiveUtc).toBe('2026-11-01T00:00:00Z')
    }
    let invoked = false
    await expect(querySanitizedProjection(directory!, directory! + '/statistics547.json', q, async () => {invoked = true; return {rows: []}})).rejects.toThrow('Unreviewed B binding')
    expect(invoked).toBe(false)
  })
  it('allowlist ignores extra private nesting, hashes, paths and capture times', async () => {
    const q = params({policy: {allowedNumericLabels: labels}, pageSize: 100})
    const s = buildBEProjectionSQL(input, q), raw = (await db.query<any>(s.text,s.values)).rows[0]
    const dirty = structuredClone(raw)
    for (const row of dirty.items) Object.assign(row, {privateExtra: {path: '/private/sentinel', sha256: 'secret-hash-sentinel', capturedAt: '2099-01-01T01:02:03Z'}, annual_warning: '/private/sentinel'})
    const clean = sanitizeProjectionPage(dirty,q,null), serial = JSON.stringify(clean)
    for (const sentinel of ['/private/sentinel','secret-hash-sentinel','2099-01-01T01:02:03Z']) expect(serial).not.toContain(sentinel)
    const hq = params({search: 'Intuition', policy: {allowedNumericLabels: labels}}), hs = buildBEProjectionSQL(input, hq)
    const heldPage = (await db.query<any>(hs.text,hs.values)).rows[0]
    expect(heldPage.items[0].raw_state).toBe('held')
    heldPage.items[0].period_yield = '0'
    expect(() => sanitizeProjectionPage(heldPage,hq,null)).toThrow('Unexpected effective metrics')
  })
})
