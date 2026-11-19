import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseBettingexpertProfile } from '../crawler/platforms/bettingexpert/parse'
const root = new URL('./fixtures/bettingexpert/', import.meta.url)
const capturedAt = '2026-11-17T17:40:00Z'
const cases = [
  ['Black_Panther', 5635, -139.27, -0.28],
  ['johnnyvee', 30216, -82.39, -0.03],
  ['Abeyek', 62248, -9449.17, -1.87],
  ['Intuition', 142672, -14174.53, -1.03],
  ['Rubendrn1995', 11398, -2962.63, -3.39],
  ['DelPiero28', 8631, 703.42, 0.96],
] as const
const html = readFileSync(new URL('DelPiero28.html', root), 'utf8')
const ctx = { username: 'DelPiero28', profileUrl: 'https://www.bettingexpert.com/user/profile/DelPiero28', capturedAt }
describe('Bettingexpert profile-only reader', () => {
  for (const [username, picks, profit, yieldPct] of cases) it(`reads real profile ${username}, not sports ranking`, () => {
    const actual = parseBettingexpertProfile(readFileSync(new URL(`${username}.html`, root), 'utf8'), { username, profileUrl: `https://www.bettingexpert.com/user/profile/${username}`, capturedAt })
    expect(actual.ok).toBe(true)
    if (actual.ok) expect(actual.capture).toMatchObject({ picks, profit, yieldPct, yield3m: null, yield6m: null, yield12m: null, scope: 'profile-overall', capturedAt })
  })
  it('rejects wrong canonical identity', () => expect(parseBettingexpertProfile(html.replace('rel="canonical"', 'rel="other"'), ctx).ok).toBe(false))
  it('rejects absent stat rather than zero-filling', () => expect(parseBettingexpertProfile(html.replace('Average odds', 'Unknown field'), ctx).ok).toBe(false))
  it('rejects incorrect numeric formatting', () => expect(parseBettingexpertProfile(html.replace('703.42', '703,42'), ctx).ok).toBe(false))
  it('rejects missing/invalid capture time', () => expect(parseBettingexpertProfile(html, { ...ctx, capturedAt: 'yesterday' }).ok).toBe(false))
  it('rejects arbitrary source URL', () => expect(parseBettingexpertProfile(html, { ...ctx, profileUrl: 'https://example.com/user/profile/DelPiero28' }).ok).toBe(false))
  it('rejects out of range win rate', () => expect(parseBettingexpertProfile(html.replace('43.61%', '143.61%'), ctx).ok).toBe(false))
  it('rejects duplicate aggregate heading', () => expect(parseBettingexpertProfile(html.replace('</main>', '<h3>Overall stats</h3></main>'), ctx).ok).toBe(false))
})
