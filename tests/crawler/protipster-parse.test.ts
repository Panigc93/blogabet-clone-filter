import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseProtipsterProfile, parseDashboardGraph } from '@/crawler/platforms/protipster/parse'

// Real captures (2026-11-20, cloud browser, public navigation):
// - <slug>-preload-2026-11-20.js.txt: the verbatim textContent of the profile
//   page <script> that carries tplConfig.preloadStateData.
// - heroico-dashboard-graph-2026-11-20.json: the real POST
//   /tipster/heroico/dashboard-graph responses captured while switching the
//   UI period dropdown (fetch-wrapped, one change per period).
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures/protipster', name), 'utf8')

describe('parseProtipsterProfile (real preload captures 2026-11-20)', () => {
  const heroico = parseProtipsterProfile(fx('heroico-preload-2026-11-20.js.txt'))

  it('extracts identity from UPP_DASHBOARD_OVERVIEW', () => {
    expect(heroico.overview).toEqual({
      id: 136241,
      username: 'heroico',
      usernameCanonical: 'heroico',
      avatar: null,
      userJoinDate: '2019-02-04 14:29:08',
      countryCode: 'VE',
    })
  })

  it('extracts followers and all-time cumulativeStats from UPP_SUMMARY_ADD_DATA', () => {
    expect(heroico.summary?.followersCount).toBe(341)
    expect(heroico.summary?.cumulativeStats).toMatchObject({
      profit: 5510,
      stakes: 143240,
      picks: 1031,
      yield: 3.8,
      hitRate: 49.27,
    })
  })

  it('extracts the default 6m chart block and the active-month list', () => {
    expect(heroico.chartDefault?.defaultDateCriteria).toBe('lastSixMonths')
    expect(heroico.chartDefault?.stats).toMatchObject({
      profit: 7252,
      stakes: 113380,
      picks: 671,
      yield: 6.4,
    })
    expect(heroico.chartDefault?.activeMonths).toEqual([
      '2026-11', '2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2020-04',
    ])
  })

  it('extracts avatar filename and country from a second real profile', () => {
    const almo = parseProtipsterProfile(fx('almo7tarif-preload-2026-11-20.js.txt'))
    expect(almo.overview).toMatchObject({
      id: 252502,
      username: 'ALMO7TARIF',
      usernameCanonical: 'almo7tarif',
      avatar: 'V5BY8RD3yZUFEWX3.png',
      userJoinDate: '2021-03-28 18:44:29',
      countryCode: 'MA',
    })
    expect(almo.summary?.followersCount).toBe(39)
    expect(almo.summary?.cumulativeStats.picks).toBe(1513)
    expect(almo.chartDefault?.activeMonths).toEqual(['2026-11', '2026-10', '2026-09'])
  })

  it('extracts a long-history profile (sonicc, active 2018 and 2026)', () => {
    const sonicc = parseProtipsterProfile(fx('sonicc-preload-2026-11-20.js.txt'))
    expect(sonicc.overview).toEqual({
      id: 100841,
      username: 'Sonicc',
      usernameCanonical: 'sonicc',
      avatar: '5b4bd6d533539.png',
      userJoinDate: '2018-05-26 13:28:35',
      countryCode: 'DE',
    })
    expect(sonicc.summary?.followersCount).toBe(53)
    expect(sonicc.summary?.cumulativeStats).toMatchObject({ picks: 3609, profit: -7418, stakes: 312240 })
    expect(sonicc.chartDefault?.defaultDateCriteria).toBe('lastSixMonths')
    expect(sonicc.chartDefault?.stats).toMatchObject({ profit: 6044, stakes: 60700, picks: 477 })
    expect(sonicc.chartDefault?.activeMonths).toEqual([
      '2026-11', '2026-10', '2026-09', '2026-08',
      '2018-10', '2018-09', '2018-08', '2018-07', '2018-06', '2018-05',
    ])
  })

  it('returns null blocks, never guesses, when markers are absent', () => {
    const empty = parseProtipsterProfile('<html><body>nada</body></html>')
    expect(empty.overview).toBeNull()
    expect(empty.summary).toBeNull()
    expect(empty.chartDefault).toBeNull()
  })
})

describe('parseDashboardGraph (real POST responses 2026-11-20)', () => {
  const fixture = JSON.parse(fx('heroico-dashboard-graph-2026-11-20.json')) as {
    responses: { dateCriteria: string; status: number; body: unknown }[]
  }

  it('parses every captured response', () => {
    expect(fixture.responses.map(r => r.dateCriteria)).toEqual([
      'lastThreeMonths', '2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05',
    ])
    for (const r of fixture.responses) {
      expect(r.status).toBe(200)
      expect(parseDashboardGraph(r.body)).not.toBeNull()
    }
  })

  it('carries exact profit and stakes per full calendar month', () => {
    const oct = fixture.responses.find(r => r.dateCriteria === '2026-10')!
    const parsed = parseDashboardGraph(oct.body)!
    expect(parsed.stats).toMatchObject({ profit: 7667, stakes: 79080, picks: 403 })
    expect(parsed.activeMonths).toContain('2026-05')
    expect(parsed.activeMonths).toContain('2020-04')
  })

  it('carries the rolling 3m window with exact denominator', () => {
    const m3 = fixture.responses.find(r => r.dateCriteria === 'lastThreeMonths')!
    const parsed = parseDashboardGraph(m3.body)!
    expect(parsed.stats).toMatchObject({ profit: 8087, stakes: 81520, picks: 417, yield: 9.9 })
  })
})
