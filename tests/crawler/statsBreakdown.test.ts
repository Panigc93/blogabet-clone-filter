import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { parseStatsBreakdown, checkMuestraYield, dominantLeadBucket, liveShare } from '@/crawler/statsBreakdown'

// Fixture: pagina publica /blog/stats de un blog gratuito no verificado (50 picks),
// descargada el 2026-11-15 sin cookie. Es un caso extremo (yield muy alto, autograduado).
const html = readFileSync(new URL('./fixtures/stats-public-free-unverified.html', import.meta.url), 'utf8')

describe('parseStatsBreakdown', () => {
  const b = parseStatsBreakdown(html)

  it('lee todas las secciones de desglose', () => {
    for (const s of ['sports', 'categories', 'pick_types', 'stakes', 'bookies', 'odds_range', 'hour_of_the_day', 'hours_to_event'] as const) {
      expect(b[s]?.length, s).toBeGreaterThan(0)
    }
  })

  it('categories: deporte, liga y metricas de la misma fila', () => {
    const row = b.categories!.find(r => r.key === 'Football-Spa. Primera')!
    expect(row).toMatchObject({ sport: 'Football', category: 'Spa. Primera', picks: 21, winRate: 76, yieldPct: 2041 })
    expect(row.oddsAvg).toBeCloseTo(27.601)
    expect(row.stakeAvg).toBeCloseTo(3.29)
  })

  it('las categorias suman los picks del deporte (50)', () => {
    expect(b.categories!.reduce((s, r) => s + r.picks, 0)).toBe(50)
    expect(b.sports![0]).toMatchObject({ key: 'Football', picks: 50 })
  })

  it('bookies y antelacion con etiqueta visible', () => {
    expect(b.bookies!.map(r => r.key)).toEqual(expect.arrayContaining(['Bet365', 'BETWAY']))
    expect(b.hours_to_event!.map(r => r.key)).toEqual(expect.arrayContaining(['1-3', '3-6', '6-12', '12-24']))
    expect(dominantLeadBucket(b)).toEqual({ bucket: '1-3', sharePct: 70 })
  })

  it('no suma ligas pequenas: con 50 picks ninguna liga cumple Muestra', () => {
    const checks = checkMuestraYield(b)
    expect(checks.filter(c => c.sampleOk)).toHaveLength(0)
    expect(checks.filter(c => c.muestraYYieldCumplen)).toHaveLength(0)
  })

  it('un scope inexistente devuelve vacio, no toda la pagina', () => {
    expect(parseStatsBreakdown(html, '#paidStatsTab')).toEqual({})
  })

  it('liveShare es 0 cuando no hay picks LIVE', () => {
    expect(liveShare(b)).toBe(0)
  })

  it('pagina sin desgloses devuelve objeto vacio', () => {
    expect(parseStatsBreakdown('<html><body></body></html>')).toEqual({})
  })
})

describe('checkMuestraYield', () => {
  it('exige 100 picks y 11% en la propia fila', () => {
    const r = (key: string, picks: number, yieldPct: number | null) => ({ key, picks, winRate: null, profit: null, yieldPct, oddsAvg: null, stakeAvg: null })
    const out = checkMuestraYield({ categories: [r('Football-A', 100, 11), r('Football-B', 99, 30), r('Football-C', 500, 10.99), r('Football-D', 120, null)] })
    expect(out.map(c => c.muestraYYieldCumplen)).toEqual([true, false, false, false])
  })
})

describe('categorias con separador " - "', () => {
  it('recorta espacios en deporte y liga', () => {
    const cell = (c: string) => `<td>${c}</td>`
    const html = `<div id="alltimeStatsTab"><div data-stats="categories"><table><tbody><tr>` +
      `<td><span class="hidden">Football - Livebet</span>Livebet</td>${['120', '60%', '+10', '+14%', '1.9', '3'].map(cell).join('')}` +
      `</tr></tbody></table></div></div>`
    const row = parseStatsBreakdown(html).categories![0]
    expect(row).toMatchObject({ key: 'Football - Livebet', sport: 'Football', category: 'Livebet', picks: 120, yieldPct: 14 })
  })
})
