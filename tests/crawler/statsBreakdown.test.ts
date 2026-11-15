import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
  parseStatsBreakdown, availableStatsTabs, checkMuestraYield, dominantLeadBucket,
  liveShare, reconcileTotals, classifyCategory,
} from '@/crawler/statsBreakdown'

// Fixture real: pagina publica /blog/stats de un blog gratuito no verificado (50 picks),
// descargada el 2026-11-15 12:11 CET sin cookie. Caso extremo (yield muy alto, autograduado).
// Evidencia de fuente/hora/pestana de las capturas reales: fixtures/evidence-2026-11-15.json
const html = readFileSync(new URL('./fixtures/stats-public-free-unverified.html', import.meta.url), 'utf8')

const row = (key: string, picks: number, yieldPct: number | null) =>
  `<tr><td><span class="hidden">${key}</span>x</td>${[picks, '60%', '+10', yieldPct === null ? '' : `+${yieldPct}%`, '1.9', '3'].map(c => `<td>${c}</td>`).join('')}</tr>`
const section = (name: string, rows: string) => `<div data-stats="${name}"><table><tbody>${rows}</tbody></table></div>`
const hours = (label: string, picks: number) =>
  `<tr><td><span class="hidden">1</span></td><td>${label}</td>${[picks, '60%', '+10', '+5%', '1.9', '3'].map(c => `<td>${c}</td>`).join('')}</tr>`

describe('pestanas', () => {
  it('detecta solo las pestanas presentes', () => {
    expect(availableStatsTabs(html)).toEqual(['alltime'])
    expect(availableStatsTabs('<div id="alltimeStatsTab"></div><div id="paidStatsTab"></div><div id="privateStatsTab"></div>'))
      .toEqual(['alltime', 'paid', 'private'])
  })
  it('una pestana ausente devuelve null, nunca otra pestana ni ceros', () => {
    expect(parseStatsBreakdown(html, 'paid')).toBeNull()
    expect(parseStatsBreakdown(html, 'private')).toBeNull()
    expect(parseStatsBreakdown('<html></html>', 'alltime')).toBeNull()
  })
  it('no existe lectura sin pestana: el tipo la rechaza y en runtime tampoco devuelve nada', () => {
    // @ts-expect-error scope vacio no es una pestana valida
    expect(parseStatsBreakdown(html, '')).toBeNull()
  })
  it('las pestanas no se mezclan ni se suman', () => {
    const page =
      `<div id="alltimeStatsTab">${section('categories', row('Football-A', 100, 12))}</div>` +
      `<div id="paidStatsTab">${section('categories', row('Football-A', 40, 20))}</div>`
    expect(parseStatsBreakdown(page, 'alltime')!.categories).toHaveLength(1)
    expect(parseStatsBreakdown(page, 'alltime')!.categories![0].picks).toBe(100)
    expect(parseStatsBreakdown(page, 'paid')!.categories![0].picks).toBe(40)
    expect(parseStatsBreakdown(page, 'private')).toBeNull()
  })
  it('pestana presente sin secciones devuelve objeto vacio', () => {
    expect(parseStatsBreakdown('<div id="alltimeStatsTab"></div>', 'alltime')).toEqual({})
  })
})

describe('fixture real (alltime)', () => {
  const b = parseStatsBreakdown(html, 'alltime')!

  it('lee todas las secciones', () => {
    for (const s of ['sports', 'categories', 'pick_types', 'stakes', 'bookies', 'odds_range', 'hour_of_the_day', 'hours_to_event'] as const) {
      expect(b[s]?.length, s).toBeGreaterThan(0)
    }
  })
  it('categories conserva la clave original y metricas de la misma fila', () => {
    const r = b.categories!.find(x => x.key === 'Football-Spa. Primera')!
    expect(r).toMatchObject({ sport: 'Football', category: 'Spa. Primera', categoryKind: 'unclassified', picks: 21, winRate: 76, yieldPct: 2041 })
    expect(r.oddsAvg).toBeCloseTo(27.601)
  })
  it('subtotales y totales cuadran dentro de la pestana', () => {
    expect(reconcileTotals(b)).toEqual({ sportsPicks: 50, categoriesPicks: 50, hoursToEventPicks: 50, consistent: true })
  })
  it('antelacion publicada y live con denominador', () => {
    expect(b.bookies!.map(r => r.key)).toEqual(expect.arrayContaining(['Bet365', 'BETWAY']))
    expect(dominantLeadBucket(b)).toEqual({ bucket: '1-3', sharePct: 70 })
    expect(liveShare(b)).toEqual({ livePicks: 0, totalPicks: 50, pct: 0 })
  })
  it('con 50 picks ninguna categoria cumple Muestra, sin sumar ligas', () => {
    expect(checkMuestraYield(b).filter(c => c.sampleOk)).toHaveLength(0)
  })
})

describe('clasificacion de categorias', () => {
  it('Livebet y Combo pick son agregados, no competiciones', () => {
    expect(classifyCategory('Football', 'Livebet')).toBe('live_aggregate')
    expect(classifyCategory('Basketball', 'Live bet')).toBe('live_aggregate')
    expect(classifyCategory('Combo pick', 'Combo pick')).toBe('combo_aggregate')
  })
  it('Greece o Spa. Primera quedan sin clasificar: pueden ser pais o competicion', () => {
    expect(classifyCategory('Football', 'Greece')).toBe('unclassified')
    expect(classifyCategory('Football', 'Spa. Primera')).toBe('unclassified')
  })
  it('separador " - " se recorta y el key original se conserva', () => {
    const page = `<div id="alltimeStatsTab">${section('categories', row('Football - Livebet', 120, 14))}</div>`
    const r = parseStatsBreakdown(page, 'alltime')!.categories![0]
    expect(r).toMatchObject({ key: 'Football - Livebet', sport: 'Football', category: 'Livebet', categoryKind: 'live_aggregate' })
  })
})

describe('checkMuestraYield', () => {
  it('exige 100 picks y 11% en la propia fila y arrastra el tipo de categoria', () => {
    const page = `<div id="alltimeStatsTab">${section('categories',
      row('Football-A', 100, 11) + row('Football-B', 99, 30) + row('Football-C', 500, 10.99) + row('Football-D', 120, null) + row('Football-Livebet', 300, 20))}</div>`
    const out = checkMuestraYield(parseStatsBreakdown(page, 'alltime')!)
    expect(out.map(c => c.muestraYYieldCumplen)).toEqual([true, false, false, false, true])
    expect(out[4].categoryKind).toBe('live_aggregate')   // cumple M y Y, pero no acredita ninguna liga
    expect(out[3].yieldPct).toBeNull()                     // falta de dato: null, no 0
  })
})

describe('falta de datos, sin rellenar ceros', () => {
  it('sin hours_to_event: liveShare y antelacion son null', () => {
    const b = parseStatsBreakdown(`<div id="alltimeStatsTab">${section('categories', row('Football-A', 10, 5))}</div>`, 'alltime')!
    expect(liveShare(b)).toBeNull()
    expect(dominantLeadBucket(b)).toBeNull()
    expect(reconcileTotals(b).consistent).toBeNull()
  })
  it('totales que no cuadran se marcan inconsistentes', () => {
    const page = `<div id="alltimeStatsTab">${section('sports', row('Football', 100, 10))}${section('categories', row('Football-A', 90, 10))}${section('hours_to_event', hours('LIVE', 100))}</div>`
    expect(reconcileTotals(parseStatsBreakdown(page, 'alltime')!).consistent).toBe(false)
  })
  it('live con LIVE explicito', () => {
    const page = `<div id="alltimeStatsTab">${section('hours_to_event', hours('LIVE', 30) + hours('1-3', 70))}</div>`
    expect(liveShare(parseStatsBreakdown(page, 'alltime')!)).toEqual({ livePicks: 30, totalPicks: 100, pct: 30 })
  })
})
