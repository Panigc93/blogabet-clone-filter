import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { selectProfileIds, extractBankrollBlocks, monthsCloseWithTotals, windowYield, parseMonthsResponse } from '@/crawler/platforms/bet2invest/api-months'

// Reduced real fixtures (og meta + __NUXT_DATA__ only) from public profile pages downloaded 2026-11-17.
const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8')

describe('Bet2Invest real fixtures: selection and blocks', () => {
  it('multi-bankroll con default y stats == cabecera: selected', () => {
    const html = fx('b2i-select-multi-default.html')
    expect(selectProfileIds(html)).toMatchObject({ status: 'selected', basis: 'default-stats-equal-header' })
    expect(extractBankrollBlocks(html)!.length).toBeGreaterThan(1)
  })
  it('Gerganaana: settled card selects identity but row still needs corroborating months', () => {
    expect(selectProfileIds(fx('b2i-select-multi-candidate.html')).status).toBe('selected')
  })
  it('caso reset: current 0 apuestas y cabecera 0; bloques leidos sin fusionar', () => {
    const blocks = extractBankrollBlocks(fx('b2i-reset-current-zero.html'))!
    expect(blocks.length).toBeGreaterThan(0)
    const b = blocks.find((x) => x.lastStatistics && (x.lastStatistics.betsNumber ?? 0) > 0)
    expect(b).toBeDefined()
    expect(b!.current?.betsNumber).toBe(0)
    expect(b!.lastReset).not.toBeNull()
  })
  it('sin payload: null', () => {
    expect(extractBankrollBlocks('<html></html>')).toBeNull()
  })
})

describe('serie mensual vacia', () => {
  it('no es un cero que cierra contra totales 0 ni produce yield', () => {
    const m = parseMonthsResponse([])!
    expect(m).toEqual([])
    expect(monthsCloseWithTotals(m, 0, 0, 'full')).toBe(false)
    expect(windowYield(m, new Date('2026-11-17T00:00:00Z')).yieldPct).toBeNull()
  })
})
