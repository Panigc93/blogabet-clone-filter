import { describe, it, expect } from 'vitest'
import { parseStatsAccess, deriveAccessStatus, ACCESS_STATUS_CAVEAT } from '@/crawler/access'

// Fixtures construidas SOLO con markup documentado en blogabet-scripts
// (BLOGABET_CONTEXT.md + los wrappers que ya usa crawler/stats.ts).
// No provienen de una captura viva: el parser debe degradar a 'unknown'
// ante cualquier forma no reconocida.

const ARCHIVE_ROWS = `
  <table data-stats="archive"><tbody>
    <tr><td><span class="hidden">1759190400</span></td><td>12</td><td></td><td></td><td><span>+8%</span></td><td></td><td><span>1.10</span></td></tr>
    <tr><td><span class="hidden">1756598400</span></td><td>9</td><td></td><td></td><td><span>+3%</span></td><td></td><td><span>1.05</span></td></tr>
  </tbody></table>`

// Perfil free: sin wrappers de pestañas; tabla de archivo al descubierto (fallback sin scope de stats.ts)
const FREE_STATS = `<div id="stats">${ARCHIVE_ROWS}</div>`

// Perfil con pestañas ALL + PAID (wrappers que ya usa stats.ts)
const PAID_STATS = `
  <div id="alltimeStatsTab">${ARCHIVE_ROWS}</div>
  <div id="paidStatsTab">${ARCHIVE_ROWS}</div>`

// Perfil con pestañas ALL + PRIVATE (wrapper por simetría con paidStatsTab)
const PRIVATE_STATS = `
  <div id="alltimeStatsTab">${ARCHIVE_ROWS}</div>
  <div id="privateStatsTab">${ARCHIVE_ROWS}</div>`

// Variante PRIVATE con la familia de ids de BLOGABET_CONTEXT (#private-{seccion}-StatsTabContent)
const PRIVATE_STATS_CONTENT_IDS = `
  <div id="alltime-archive-StatsTabContent">${ARCHIVE_ROWS}</div>
  <div id="private-archive-StatsTabContent">${ARCHIVE_ROWS}</div>`

// Pestaña PRIVATE presente pero sin filas: ambiguo, no se puede afirmar nada
const PRIVATE_EMPTY_STATS = `
  <div id="alltimeStatsTab">${ARCHIVE_ROWS}</div>
  <div id="privateStatsTab"><table data-stats="archive"><tbody></tbody></table></div>`

describe('parseStatsAccess', () => {
  it('perfil free: alltime sin pestañas paid/private', () => {
    const s = parseStatsAccess(FREE_STATS)
    expect(s.hasAlltimeScope).toBe(true)
    expect(s.hasPaidScope).toBe(false)
    expect(s.hasPrivateScope).toBe(false)
    expect(s.paidArchiveRows).toBe(0)
    expect(s.privateArchiveRows).toBe(0)
  })

  it('detecta pestaña PAID y cuenta sus filas de archivo', () => {
    const s = parseStatsAccess(PAID_STATS)
    expect(s.hasPaidScope).toBe(true)
    expect(s.paidArchiveRows).toBe(2)
    expect(s.hasPrivateScope).toBe(false)
  })

  it('detecta pestaña PRIVATE (wrapper) y cuenta filas', () => {
    const s = parseStatsAccess(PRIVATE_STATS)
    expect(s.hasPrivateScope).toBe(true)
    expect(s.privateArchiveRows).toBe(2)
  })

  it('detecta PRIVATE con la familia de ids documentada en BLOGABET_CONTEXT', () => {
    const s = parseStatsAccess(PRIVATE_STATS_CONTENT_IDS)
    expect(s.hasPrivateScope).toBe(true)
    expect(s.privateArchiveRows).toBe(2)
  })

  it('pestaña PRIVATE vacía: scope presente, cero filas', () => {
    const s = parseStatsAccess(PRIVATE_EMPTY_STATS)
    expect(s.hasPrivateScope).toBe(true)
    expect(s.privateArchiveRows).toBe(0)
  })
})

describe('deriveAccessStatus', () => {
  it('listado con precio → paid aunque no haya stats', () => {
    const r = deriveAccessStatus({ listingIsPaid: true, listingPrice: '9.99', stats: null })
    expect(r.status).toBe('paid')
    expect(r.reason).toContain('9.99')
  })

  it('listado free + stats limpias → free', () => {
    const r = deriveAccessStatus({ listingIsPaid: false, listingPrice: null, stats: parseStatsAccess(FREE_STATS) })
    expect(r.status).toBe('free')
  })

  it('listado free + pestaña PAID con filas → paid (contradicción señalada)', () => {
    const r = deriveAccessStatus({ listingIsPaid: false, listingPrice: null, stats: parseStatsAccess(PAID_STATS) })
    expect(r.status).toBe('paid')
    expect(r.reason).toContain('pese a listado')
  })

  it('listado free + pestaña PRIVATE con filas → private', () => {
    const r = deriveAccessStatus({ listingIsPaid: false, listingPrice: null, stats: parseStatsAccess(PRIVATE_STATS) })
    expect(r.status).toBe('private')
  })

  it('pestaña PRIVATE vacía → unknown (ambiguo, no se afirma)', () => {
    const r = deriveAccessStatus({ listingIsPaid: false, listingPrice: null, stats: parseStatsAccess(PRIVATE_EMPTY_STATS) })
    expect(r.status).toBe('unknown')
  })

  it('sin página de stats → unknown (nunca se asume free por ausencia)', () => {
    const r = deriveAccessStatus({ listingIsPaid: false, listingPrice: null, stats: null })
    expect(r.status).toBe('unknown')
  })
})

describe('caveat', () => {
  it('todo consumo del estado exige recordar que no hay verificación anónima', () => {
    expect(ACCESS_STATUS_CAVEAT).toContain('No certifica acceso anónimo')
  })
})
