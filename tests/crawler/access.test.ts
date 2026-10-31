import { describe, it, expect } from 'vitest'
import { parseStatsTabs, deriveSampleEvidence, TAB_EVIDENCE_CAVEAT } from '@/crawler/access'

// Fixtures SINTÉTICAS construidas solo desde la documentación:
//   - los wrappers que ya usa crawler/stats.ts (#alltimeStatsTab, #paidStatsTab)
//   - la familia documentada en blogabet-scripts/BLOGABET_CONTEXT.md
//     (#{type}-{seccion}-StatsTabContent)
// No son capturas vivas y NO certifican el markup real de Blogabet: si la
// primera corrida real muestra otra forma, el parser debe degradar a
// 'unknown', nunca adivinar.

const ARCHIVE_ROWS = `
  <table data-stats="archive"><tbody>
    <tr><td><span class="hidden">1759190400</span></td><td>12</td><td></td><td></td><td><span>+8%</span></td><td></td><td><span>1.10</span></td></tr>
    <tr><td><span class="hidden">1756598400</span></td><td>9</td><td></td><td></td><td><span>+3%</span></td><td></td><td><span>1.05</span></td></tr>
  </tbody></table>`

// Perfil sin wrappers de pestañas; tabla de archivo al descubierto (fallback sin scope de stats.ts)
const ALLTIME_ONLY_STATS = `<div id="stats">${ARCHIVE_ROWS}</div>`

// Wrappers que ya usa stats.ts: ALL + PAID
const PAID_STATS = `
  <div id="alltimeStatsTab">${ARCHIVE_ROWS}</div>
  <div id="paidStatsTab">${ARCHIVE_ROWS}</div>`

// Familia documentada en BLOGABET_CONTEXT.md: ALL + PRIVATE
const PRIVATE_STATS_CONTENT_IDS = `
  <div id="alltime-archive-StatsTabContent">${ARCHIVE_ROWS}</div>
  <div id="private-archive-StatsTabContent">${ARCHIVE_ROWS}</div>`

// Id INFERIDO por simetría (#privateStatsTab): sin evidencia documentada, no se acepta
const PRIVATE_INFERRED_WRAPPER = `
  <div id="alltimeStatsTab">${ARCHIVE_ROWS}</div>
  <div id="privateStatsTab">${ARCHIVE_ROWS}</div>`

// Pestaña PRIVATE (familia documentada) presente pero sin filas: evidencia ambigua
const PRIVATE_EMPTY_STATS = `
  <div id="alltimeStatsTab">${ARCHIVE_ROWS}</div>
  <div id="private-sports-StatsTabContent"><table data-stats="archive"><tbody></tbody></table></div>`

describe('parseStatsTabs', () => {
  it('perfil sin pestañas: alltime por fallback de stats.ts, sin paid/private', () => {
    const s = parseStatsTabs(ALLTIME_ONLY_STATS)
    expect(s.hasAlltimeTab).toBe(true)
    expect(s.hasPaidTab).toBe(false)
    expect(s.hasPrivateTab).toBe(false)
    expect(s.paidArchiveRows).toBe(0)
    expect(s.privateArchiveRows).toBe(0)
  })

  it('detecta pestaña PAID (wrapper de stats.ts) y cuenta sus filas de archivo', () => {
    const s = parseStatsTabs(PAID_STATS)
    expect(s.hasPaidTab).toBe(true)
    expect(s.paidArchiveRows).toBe(2)
    expect(s.hasPrivateTab).toBe(false)
  })

  it('detecta pestaña PRIVATE por la familia documentada y cuenta filas', () => {
    const s = parseStatsTabs(PRIVATE_STATS_CONTENT_IDS)
    expect(s.hasPrivateTab).toBe(true)
    expect(s.privateArchiveRows).toBe(2)
  })

  it('NO reconoce #privateStatsTab (id inferido sin evidencia documentada)', () => {
    const s = parseStatsTabs(PRIVATE_INFERRED_WRAPPER)
    expect(s.hasPrivateTab).toBe(false)
    expect(s.privateArchiveRows).toBe(0)
    expect(s.hasAlltimeTab).toBe(true)
  })

  it('pestaña PRIVATE vacía: existe la pestaña pero 0 filas (ambiguo)', () => {
    const s = parseStatsTabs(PRIVATE_EMPTY_STATS)
    expect(s.hasPrivateTab).toBe(true)
    expect(s.privateArchiveRows).toBe(0)
  })
})

describe('deriveSampleEvidence', () => {
  it('listado con precio → subscribe-offer (oferta del listado, no acceso)', () => {
    const r = deriveSampleEvidence({ listingIsPaid: true, listingPrice: '9.99', stats: null })
    expect(r.sampleVisibility).toBe('subscribe-offer')
    expect(r.reason).toContain('9.99')
    expect(r.profileAccessStatus).toBe('unknown')
  })

  it('listado con plan de pago sin precio → subscribe-offer', () => {
    const r = deriveSampleEvidence({ listingIsPaid: true, listingPrice: null, stats: null })
    expect(r.sampleVisibility).toBe('subscribe-offer')
    expect(r.profileAccessStatus).toBe('unknown')
  })

  it('PRIVATE con filas → private-sample (muestra, no acceso al perfil)', () => {
    const r = deriveSampleEvidence({ listingIsPaid: false, listingPrice: null, stats: parseStatsTabs(PRIVATE_STATS_CONTENT_IDS) })
    expect(r.sampleVisibility).toBe('private-sample')
    expect(r.profileAccessStatus).toBe('unknown')
  })

  it('PAID con filas pese a listado sin cuota → paid-sample', () => {
    const r = deriveSampleEvidence({ listingIsPaid: false, listingPrice: null, stats: parseStatsTabs(PAID_STATS) })
    expect(r.sampleVisibility).toBe('paid-sample')
    expect(r.profileAccessStatus).toBe('unknown')
  })

  it('pestaña presente pero vacía → unknown (ambigua)', () => {
    const r = deriveSampleEvidence({ listingIsPaid: false, listingPrice: null, stats: parseStatsTabs(PRIVATE_EMPTY_STATS) })
    expect(r.sampleVisibility).toBe('unknown')
  })

  it('listado sin cuota + solo ALL-TIME → alltime-only, nunca free', () => {
    const r = deriveSampleEvidence({ listingIsPaid: false, listingPrice: null, stats: parseStatsTabs(ALLTIME_ONLY_STATS) })
    expect(r.sampleVisibility).toBe('alltime-only')
    expect(r.profileAccessStatus).toBe('unknown')
  })

  it('sin página de stats → unknown', () => {
    const r = deriveSampleEvidence({ listingIsPaid: false, listingPrice: null, stats: null })
    expect(r.sampleVisibility).toBe('unknown')
    expect(r.profileAccessStatus).toBe('unknown')
  })

  it('ningún camino clasifica el acceso al perfil: siempre unknown', () => {
    const inputs = [
      { listingIsPaid: true, listingPrice: '5', stats: null },
      { listingIsPaid: false, listingPrice: null, stats: parseStatsTabs(PRIVATE_STATS_CONTENT_IDS) },
      { listingIsPaid: false, listingPrice: null, stats: parseStatsTabs(PAID_STATS) },
      { listingIsPaid: false, listingPrice: null, stats: parseStatsTabs(ALLTIME_ONLY_STATS) },
      { listingIsPaid: false, listingPrice: null, stats: null },
    ] as const
    for (const input of inputs) {
      expect(deriveSampleEvidence(input).profileAccessStatus).toBe('unknown')
    }
  })
})

describe('TAB_EVIDENCE_CAVEAT', () => {
  it('declara que no clasifica acceso al perfil ni certifica acceso anónimo/público/gratuito', () => {
    expect(TAB_EVIDENCE_CAVEAT).toMatch(/No clasifica el acceso al perfil/)
    expect(TAB_EVIDENCE_CAVEAT).toMatch(/anónimo, público o gratuito/)
  })
})
