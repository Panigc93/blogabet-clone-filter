import { describe, it, expect } from 'vitest'
import { selectProfileIds, extractProfileIds } from '@/crawler/platforms/bet2invest/api-months'

// Fully synthetic Nuxt payloads (no real tipster data). Shape: user object + public bankroll objects whose
// `statistics` points to explicit settledBetsNumber/betsNumber + roi; card uses stable testids, og badge is not identity.
type B = [id: number, dflt: boolean, stat: [number, number] | null, type?: string]
function page(banks: B[], hdr: [number, number] | null = [606, 1.37]): string {
  const d: unknown[] = [{}]
  const add = (x: unknown) => (d.push(x), d.length - 1)
  const user = add({ id: 0, username: 0, lastBetAt: 0, createdAt: 0 })
  ;(d[user] as Record<string, unknown>).id = add(5)
  ;(d[user] as Record<string, unknown>).username = add('synthetic')
  ;(d[user] as Record<string, unknown>).lastBetAt = add('2026-11-01T00:00:00.000Z')
  for (const [bid, dflt, stat, typ = 'public'] of banks) {
    const sd = stat ? add({ settledBetsNumber: add(stat[0]), betsNumber: add(stat[0]), roi: add(stat[1]) }) : null
    const b = add({ id: 0, default: 0, type: 0, statistics: sd, lastReset: null, isMutable: false })
    ;(d[b] as Record<string, unknown>).id = add(bid)
    ;(d[b] as Record<string, unknown>).default = add(dflt)
    ;(d[b] as Record<string, unknown>).type = add(typ)
  }
  const og = hdr ? `<meta property="og:description" content="Discover X, a PRO Tipster. ${hdr[1]}% ROI on ${hdr[0]} tips.">` : ''
  const card = hdr ? `<span data-testid="stats-settledBetsNumber">${hdr[0]}</span><span data-testid="stats-roi">${hdr[1]}%</span>` : ''
  return `${og}${card}<script type="application/json" id="__NUXT_DATA__">${JSON.stringify(d)}</script>`
}
const st = (b: B[], h?: [number, number] | null) => selectProfileIds(page(b, h)).status

describe('Bet2Invest bankroll selection (offline, synthetic)', () => {
  it('un solo bankroll publico se toma tal cual, aunque sus contadores no igualen la cabecera', () => {
    const r = selectProfileIds(page([[1, true, [580, 1.37]]]))
    expect(r).toMatchObject({ status: 'selected', basis: 'single-public-bankroll', ids: { publicBankrollId: 1, userId: 5 } })
  })
  it('varios: default=true con stats == cabecera -> selected', () => {
    expect(selectProfileIds(page([[1, true, [606, 1.37]], [2, false, [85, 12.6]]]))).toMatchObject({ status: 'selected', basis: 'default-stats-equal-header', ids: { publicBankrollId: 1 } })
  })
  it('varios: default con apuestas distintas -> candidate, no vinculado', () => {
    const r = selectProfileIds(page([[1, true, [604, 1.37]], [2, false, null]]))
    expect(r.status).toBe('candidate')
    expect(extractProfileIds(page([[1, true, [604, 1.37]], [2, false, null]]))).toBeNull()
  })
  it('varios: la cabecera coincide con un bankroll NO default -> ambiguous', () => {
    expect(st([[1, false, [606, 1.37]], [2, true, [10, 3]]])).toBe('ambiguous')
  })
  it('varios: default no unico o ausente -> ambiguous', () => {
    expect(st([[1, true, [606, 1.37]], [2, true, [10, 3]]])).toBe('ambiguous')
    expect(st([[1, false, [606, 1.37]], [2, false, [10, 3]]])).toBe('ambiguous')
  })
  it('varios sin cabecera -> ambiguous (nunca se adivina)', () => {
    expect(st([[1, true, [606, 1.37]], [2, false, null]], null)).toBe('ambiguous')
  })
  it('puerta de ROI 0.005+1e-9: 1.375 y 1.365 entran; 1.376 y 1.364 no', () => {
    expect(st([[1, true, [606, 1.375]], [2, false, null]])).toBe('selected')
    expect(st([[1, true, [606, 1.365]], [2, false, null]])).toBe('selected')
    expect(st([[1, true, [606, 1.376]], [2, false, null]])).toBe('candidate')
    expect(st([[1, true, [606, 1.364]], [2, false, null]])).toBe('candidate')
  })
  it('bankrolls no publicos se ignoran; HTML sin payload es ambiguous', () => {
    expect(st([[1, true, [606, 1.37], 'private'], [2, true, [606, 1.37]]])).toBe('selected')
    expect(selectProfileIds('<html></html>').status).toBe('ambiguous')
  })
})
