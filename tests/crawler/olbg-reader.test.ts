import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { makeOlbgSource, mergeOlbgDiscovery, parseOlbgDiscovery, parseOlbgPerformance, readOlbgNodeField, type OlbgSource } from '../../crawler/platforms/olbg/reader'
import { prepareOlbgProfile } from '../../crawler/platforms/olbg/prepare'

function fixture(name: string) {
  return JSON.parse(readFileSync(new URL(`../fixtures/olbg/${name}.json`, import.meta.url), 'utf8'))
}
function source(f: ReturnType<typeof fixture>): OlbgSource { return f.originalReceipt }
function performance(id: number, mode: string) {
  const f = fixture(`profile-${id}-${mode}`)
  return parseOlbgPerformance(f.node, source(f), id, '2026-11')
}
function node(data: Record<string, unknown>) {
  const a: unknown[] = []
  function add(x: unknown): number {
    const i = a.length
    a.push(null)
    if (Array.isArray(x)) a[i] = x.map(add)
    else if (x && typeof x === 'object') a[i] = Object.fromEntries(Object.entries(x).map(([k, v]) => [k, add(v)]))
    else a[i] = x
    return i
  }
  add(data)
  return { data: a }
}
function fields(n: unknown) {
  return Object.fromEntries(['effectiveTipsterId', 'mode', 'tipsterUsername', 'monthFilterSelected', 'sportPeriodSelected', 'sportPeriodOptions', 'monthRows', 'sportRows'].map(k => [k, readOlbgNodeField(n, k)]))
}

describe('OLBG public statistical reader, real projected captures', () => {
  for (const id of [565069, 342919, 535122]) {
    it(`reads three independently dated sources for ${id} without inventing global yield`, () => {
      const m = performance(id, 'month')
      const six = performance(id, 'table-1')
      const twelve = performance(id, 'table-2')
      const p = prepareOlbgProfile(m, six, twelve)
      expect(p.profileId).toBe(id)
      expect(p.sources).toHaveLength(3)
      expect(p.globalYieldPct).toBeNull()
      expect(p.allTime).toBeNull()
      expect(p.databaseReady).toBe(false)
      expect(p.followers).toBeNull()
      expect(p.lastPickAt).toBeNull()
      expect(m.months.every(x => x.month <= '2026-11')).toBe(true)
      expect(twelve.tables.every(x => x.fromMonth === '2025-11' && x.throughMonth === '2026-10')).toBe(true)
    })
  }
  it('keeps All Tips, comments, profit and LSP distinct', () => {
    const p = performance(565069, 'table-2')
    const sport = p.tables.find(x => x.name === 'Horse Racing All Tips')!
    expect(sport).toMatchObject({ tips: 1393, levelStakeProfit: 419.83, competitionProfit: 20839, roiPct: 30, scope: 'sport-all-tips' })
    expect(p.tables.find(x => x.name === 'Irish Horse Racing')!.scope).toBe('competition')
    expect(p.globalYieldPct).toBeNull()
  })
  it('never replaces source ROI with LSP/tips', () => {
    const p = performance(565069, 'month')
    const may = p.months.find(x => x.month === '2026-05')!
    expect(may.roiPct).toBe(40)
    expect(100 * may.levelStakeProfit / may.tips).not.toBe(40)
  })
  it('summarizes available closed picks/LSP, not rounded ROI averages', () => {
    const p = prepareOlbgProfile(performance(565069, 'month'), performance(565069, 'table-1'), performance(565069, 'table-2'))
    expect(p.summaries.find(x => x.closedMonths === 6)).toMatchObject({ tips: 1337, levelStakeProfit: 441.71, roiPct: null, missingMonths: [] })
    expect(p.summaries.find(x => x.closedMonths === 12)).toMatchObject({ tips: null, levelStakeProfit: null })
    expect(p.summaries.find(x => x.closedMonths === 12)!.missingMonths).toContain('2026-03')
  })
  it('does not turn absent June into zero activity or a complete six-month window', () => {
    const p = prepareOlbgProfile(performance(342919, 'month'), performance(342919, 'table-1'), performance(342919, 'table-2'))
    expect(p.summaries.find(x => x.closedMonths === 6)).toMatchObject({ tips: null, missingMonths: ['2026-06'] })
  })
  it('normalizes source empty-table percentages to unknown', () => {
    const p = performance(535122, 'table-1')
    expect(p.tables.find(x => x.name === 'Specials All Tips')).toMatchObject({ tips: 0, roiPct: null, strikePct: null })
  })
  it('keeps negative records', () => {
    expect(performance(535122, 'month').months.find(x => x.month === '2026-10')!.levelStakeProfit).toBe(-25.89)
  })
  it('rejects a URL for a different numeric identity', () => {
    const f = fixture('profile-565069-month')
    expect(() => parseOlbgPerformance(f.node, source(f), 535122, '2026-11')).toThrow('URL mismatch')
  })
  it('rejects payload identity mismatch', () => {
    const f = fixture('profile-565069-month')
    expect(() => parseOlbgPerformance(node({ ...fields(f.node), effectiveTipsterId: 1 }), source(f), 565069, '2026-11')).toThrow('identity')
  })
  it('rejects sport monthly statistics passed as global All Tips', () => {
    const f = fixture('profile-565069-month')
    expect(() => parseOlbgPerformance(node({ ...fields(f.node), monthFilterSelected: 136 }), source(f), 565069, '2026-11')).toThrow('All Tips')
  })
  it('rejects wrong period, duplicate month, malformed number and future month', () => {
    const f = fixture('profile-565069-month')
    const d = fields(f.node)
    const rows = d.monthRows as Record<string, unknown>[]
    for (const monthRows of [[...rows, rows[0]], [{ ...rows[0], tips: '' }], [{ ...rows[0], date: 'Dec 2026' }]]) {
      expect(() => parseOlbgPerformance(node({ ...d, monthRows }), source(f), 565069, '2026-11')).toThrow()
    }
    const t = fixture('profile-565069-table-2')
    expect(() => parseOlbgPerformance(t.node, { ...source(t), url: source(t).url.replace('p=2', 'p=1') }, 565069, '2026-11')).toThrow('period')
  })
  it('uses the source period anchor and rejects a changed current-month label', () => {
    const f = fixture('profile-565069-table-2')
    const p = parseOlbgPerformance(f.node, source(f), 565069, '2026-11')
    expect(p.tables[0].throughMonth).toBe('2026-10')
    expect(() => parseOlbgPerformance(f.node, source(f), 565069, '2026-12')).toThrow('label')
  })
  it('rejects cross-profile and cross-anchor preparation', () => {
    expect(() => prepareOlbgProfile(performance(565069, 'month'), performance(342919, 'table-1'), performance(565069, 'table-2'))).toThrow('identities')
    const twelve = performance(565069, 'table-2')
    twelve.tables[0].throughMonth = '2026-09'
    expect(() => prepareOlbgProfile(performance(565069, 'month'), performance(565069, 'table-1'), twelve)).toThrow('anchors')
  })
})

describe('OLBG bounded directory discovery', () => {
  it('deduplicates the same numeric identity across tables without dropping provenance', () => {
    const f = fixture('discovery-projection')
    const d = parseOlbgDiscovery(f.data, source(f))
    const merged = mergeOlbgDiscovery([d, d])
    expect(merged).toHaveLength(d.length)
    expect(merged[0].appearances).toHaveLength(2)
    expect(merged[0].id).toBeGreaterThan(0)
  })
  it('keeps name aliases attached to a stable numeric identity', () => {
    const f = fixture('discovery-projection')
    const d = parseOlbgDiscovery(f.data, source(f)).slice(0, 1)
    expect(mergeOlbgDiscovery([d, [{ ...d[0], username: 'Changed display name' }]])[0].usernames).toHaveLength(2)
  })
  it('rejects a different table/view, loading state and duplicate IDs', () => {
    const f = fixture('discovery-projection')
    for (const data of [{ ...f.data, tableId: 1 }, { ...f.data, crtView: 6 }, { ...f.data, pageReady: false }, { ...f.data, currentTables: [f.data.currentTables[0], f.data.currentTables[0]] }]) {
      expect(() => parseOlbgDiscovery(data, source(f))).toThrow()
    }
  })
  it('rejects stale anchors or a foreign source host', () => {
    const f = fixture('discovery-projection')
    expect(() => parseOlbgDiscovery({ ...f.data, monthYear: '2026-10' }, source(f))).toThrow('Stale')
    expect(() => parseOlbgDiscovery(f.data, { ...source(f), url: source(f).url.replace('www.olbg.com', 'example.com') })).toThrow('source URL')
  })
})

describe('data-only decoder and capture receipts', () => {
  it('hashes exact bytes and rejects oversize or timezone-free receipts', () => {
    const s = makeOlbgSource('{}', 'https://www.olbg.com/tipsters/tables/data', '2026-11-17T18:00:00Z')
    expect(s.bytes).toBe(2)
    expect(s.sha256).toHaveLength(64)
    expect(() => makeOlbgSource('x'.repeat(2 * 1024 * 1024 + 1), s.url, s.capturedAt)).toThrow('2 MiB')
    expect(() => makeOlbgSource('{}', s.url, '2026-11-17T18:00:00')).toThrow('timezone')
  })
  it('does not execute strings or follow cyclic/tagged references', () => {
    expect(readOlbgNodeField(node({ field: 'globalThis.sideEffect = true' }), 'field')).toBe('globalThis.sideEffect = true')
    expect(() => readOlbgNodeField({ data: [{ field: 1 }, { nested: 1 }] }, 'field')).toThrow('cyclic')
    expect(() => readOlbgNodeField({ data: [{ field: 1 }, ['Date', '2026-11-17']] }, 'field')).toThrow('tagged')
  })
})
