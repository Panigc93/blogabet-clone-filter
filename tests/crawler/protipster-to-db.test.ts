import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  protipsterRowToInsert, protipsterDisplayName, isEmailLike,
  twelveMonthWindow, mergeProtipsterUpdate, assertProtipsterImportProvenance,
  type ProtipsterDbMapping,
} from '@/crawler/platforms/protipster/to-db'
import { parseProtipsterProfile, parseDashboardGraph } from '@/crawler/platforms/protipster/parse'
import { protipsterAvatarUrl, type ProtipsterCaptureRow, type ProtipsterPeriodStats } from '@/crawler/platforms/protipster/types'

const fx = (name: string) => readFileSync(join(__dirname, 'fixtures/protipster', name), 'utf8')

const mustMap = (m: ProtipsterDbMapping) => {
  if (!m.ok) throw new Error(m.reason)
  return m.insert
}

const stats = (profit: number, stakes: number, picks: number, y: number | null = null): ProtipsterPeriodStats =>
  ({ profit, stakes, picks, yield: y, hitRate: null, averageOdds: null })

// Real heroico capture (2026-11-20): preload blocks parsed from the real page
// script plus the real monthly POST responses for 2026-05..2026-10.
function heroicoRow(capturedAt = '2026-11-20T12:50:00+01:00'): ProtipsterCaptureRow {
  const parsed = parseProtipsterProfile(fx('heroico-preload-2026-11-20.js.txt'))
  const posts = (JSON.parse(fx('heroico-dashboard-graph-2026-11-20.json')) as {
    responses: { dateCriteria: string; body: unknown }[]
  }).responses
  const months: Record<string, ProtipsterPeriodStats> = {}
  let period3m: ProtipsterPeriodStats | null = null
  for (const r of posts) {
    const block = parseDashboardGraph(r.body)!
    if (r.dateCriteria === 'lastThreeMonths') period3m = block.stats
    else months[r.dateCriteria] = block.stats
  }
  return {
    slug: 'heroico',
    capturedAt,
    sourceUrl: 'https://www.protipster.es/tipster/heroico',
    overview: parsed.overview,
    summary: parsed.summary,
    chartDefault: parsed.chartDefault,
    period3m,
    months,
  }
}

describe('twelveMonthWindow', () => {
  it('covers the 12 complete calendar months before the capture month', () => {
    const w = twelveMonthWindow('2026-11-20T12:50:00+01:00')
    expect(w.from).toBe('2025-11')
    expect(w.through).toBe('2026-10')
    expect(w.months).toHaveLength(12)
  })
})

describe('protipsterRowToInsert (real heroico capture)', () => {
  const insert = mustMap(protipsterRowToInsert(heroicoRow(), {
    id: 0, idSource: 'internal-transactional', slug: 'heroico',
    sourceUrl: 'https://www.protipster.es/tipster/heroico',
  }))

  it('maps identity and all-time stats with protipster units discipline', () => {
    expect(insert.platform).toBe('protipster')
    expect(insert.slug).toBe('heroico')
    expect(insert.name).toBe('heroico')
    expect(insert.profitUnit).toBe('protipster-units')
    expect(insert.picks).toBe(1031)
    expect(insert.profit).toBe('5510.000')
    expect(insert.yield).toBe('3.85') // exact 5510/143240, site displays 3.8
    expect(insert.followers).toBe(341)
    expect(insert.countryCode).toBe('VE')
    expect(insert.sinceYear).toBe(2019)
    expect(insert.signupAt?.toISOString()).toBe('2019-02-04T14:29:08.000Z')
    expect(insert.sourcePortfolioId).toBe(136241)
    expect(insert.sourceUrl).toBe('https://www.protipster.es/tipster/heroico')
    expect(insert.isPaid).toBe(false)
    expect(insert.price).toBeNull()
    expect(insert.avatarUrl).toBeNull() // heroico has no avatar
  })

  it('stores exact yields for the rolling 3m/6m site windows', () => {
    expect(insert.yield3m).toBe('9.92') // 8087/81520, site displays 9.9
    expect(insert.yield6m).toBe('6.40') // 7252/113380, site displays 6.4
    expect(insert.picks6mAvg).toBe('111.83')
  })

  it('computes 12m from full calendar months: sum(profit)/sum(stakes)', () => {
    // 2025-11..2026-10, active months 2026-05..2026-10:
    // profit 4755, stakes 142420, picks 1026 -> 3.34%
    expect(insert.yield12m).toBe('3.34')
  })

  it('keeps unexposed fields null and never fabricates', () => {
    expect(insert.verifiedPct).toBeNull()
    expect(insert.isVerified).toBe(false)
    expect(insert.lastPickAt).toBeNull()
    expect(insert.picksFree3mAvg).toBeNull()
    expect(insert.yieldFree3m).toBeNull()
    expect(insert.resetCount).toBe(0)
  })
})

describe('protipsterRowToInsert holds', () => {
  it('holds a profile whose active window months lack exact monthly captures', () => {
    // Real almo7tarif capture (active 2026-09..11) without monthly POSTs.
    const parsed = parseProtipsterProfile(fx('almo7tarif-preload-2026-11-20.js.txt'))
    const row: ProtipsterCaptureRow = {
      slug: 'almo7tarif',
      capturedAt: '2026-11-20T12:51:00+01:00',
      sourceUrl: 'https://www.protipster.es/tipster/almo7tarif',
      overview: parsed.overview,
      summary: parsed.summary,
      chartDefault: parsed.chartDefault,
      period3m: stats(-5067, 225800, 1513, -2.2),
      months: {},
    }
    const m = protipsterRowToInsert(row, { id: 0, idSource: 'internal-transactional', slug: 'almo7tarif' })
    expect(m.ok).toBe(false)
    if (!m.ok) {
      expect(m.klass).toBe('cuarentena[months-incomplete]')
      expect(m.reason).toContain('2026-09')
    }
  })

  it('imports a true empty 12m window as NULL, never 0', () => {
    const row = heroicoRow('2025-06-15T10:00:00+02:00') // window 2024-06..2025-05: no activity
    const insert = mustMap(protipsterRowToInsert(row, { id: 0, idSource: 'internal-transactional', slug: 'heroico' }))
    expect(insert.yield12m).toBeNull()
  })

  it('holds a window yield outside numeric(6,2)', () => {
    const row = heroicoRow()
    row.period3m = stats(50000, 100, 1, 50) // 50000% window yield
    const m = protipsterRowToInsert(row, { id: 0, idSource: 'internal-transactional', slug: 'heroico' })
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.klass).toBe('cuarentena[yield-out-of-schema-range]')
  })

  it('holds when the site yield contradicts the computed one', () => {
    const row = heroicoRow()
    row.period3m = { ...row.period3m!, yield: 50 }
    const m = protipsterRowToInsert(row, { id: 0, idSource: 'internal-transactional', slug: 'heroico' })
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.klass).toBe('cuarentena[capture-inconsistency]')
  })

  it('holds when the default chart block is not the 6m window', () => {
    const row = heroicoRow()
    row.chartDefault = { ...row.chartDefault!, defaultDateCriteria: 'lastThreeMonths' }
    const m = protipsterRowToInsert(row, { id: 0, idSource: 'internal-transactional', slug: 'heroico' })
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.klass).toBe('cuarentena[capture-inconsistency]')
  })

  it('holds rows without usable content', () => {
    const row = heroicoRow()
    row.summary = null
    const m = protipsterRowToInsert(row, { id: 0, idSource: 'internal-transactional', slug: 'heroico' })
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.klass).toBe('cuarentena[no-usable-content]')
  })
})

describe('privacy and helpers', () => {
  it('masks email-shaped usernames and drops their sourceUrl', () => {
    expect(isEmailLike('tipster@example.com')).toBe(true)
    expect(protipsterDisplayName('tipster@example.com')).toBe('tip***')
    const row = heroicoRow()
    row.overview = { ...row.overview!, username: 'tipster@example.com' }
    const insert = mustMap(protipsterRowToInsert(row, {
      id: 0, idSource: 'internal-transactional', slug: 'heroico',
      sourceUrl: 'https://www.protipster.es/tipster/heroico',
    }))
    expect(insert.name).toBe('tip***')
    expect(insert.sourceUrl).toBeNull()
  })

  it('builds avatar URLs only from the observed filename shape', () => {
    expect(protipsterAvatarUrl(null)).toBeNull()
    expect(protipsterAvatarUrl('V5BY8RD3yZUFEWX3.png'))
      .toBe('https://www.protipster.es/uploads/avatars/V5BY8RD3yZUFEWX3.120.png')
    expect(protipsterAvatarUrl('../../etc/passwd')).toBeNull()
  })

  it('merges by overwriting managed columns and keeping identity immutable', () => {
    const insert = mustMap(protipsterRowToInsert(heroicoRow(), {
      id: 0, idSource: 'internal-transactional', slug: 'heroico',
    }))
    const merged = mergeProtipsterUpdate({ ...insert, id: -2000000123 }, { ...insert, yield3m: null })
    expect(merged.id).toBe(-2000000123)
    expect(merged.platform).toBe('protipster')
    expect(merged.yield3m).toBeNull() // populated -> true empty overwrites
  })

  it('rejects isolated-fixture ids on the real import path', () => {
    expect(() => assertProtipsterImportProvenance('isolated-fixture', 'heroico')).toThrow()
    expect(() => assertProtipsterImportProvenance('internal-transactional', 'heroico')).not.toThrow()
  })
})
