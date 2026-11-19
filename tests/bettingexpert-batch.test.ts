import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildProfileTotalsQuery, parseProfileTotalsBatch } from '../crawler/platforms/bettingexpert/batch'
const root = new URL('./fixtures/bettingexpert/', import.meta.url)
const ids = JSON.parse(readFileSync(new URL('batch-identities.json', root), 'utf8'))
const fixture = JSON.parse(readFileSync(new URL('batch-real.json', root), 'utf8'))
const capturedAt = '2026-11-17T17:43:00Z'
const parse = (raw: unknown) => parseProfileTotalsBatch(raw, ids, capturedAt)
it('reads six real author aggregates including negative global profits', () => {
  const rows = parse(fixture)
  expect(rows.every(x => x.ok)).toBe(true)
  expect(rows[0]).toMatchObject({ picks: 5635, profit: -139.27, yieldPct: -0.281, winRatePct: null, yield3m: null, yield6m: null, yield12m: null })
  expect(rows[5]).toMatchObject({ picks: 8631, profit: 703.4201, yieldPct: 0.957 })
})
it('never uses filterTips.count for aggregate picks', () => {
  const changed = structuredClone(fixture); changed.data.p0.count = 999999
  expect(parse(changed)[0]).toMatchObject({ picks: 5635 })
})
it('rejects GraphQL errors even if partial data exists', () => expect(parse({ ...fixture, errors: [{ message: 'partial error' }] }).every(x => !x.ok)).toBe(true))
it('quarantines wrong author GUID', () => {
  const changed = structuredClone(fixture); changed.data.p0.tips[0].user.guid = ids[1].guid
  expect(parse(changed)[0]).toMatchObject({ ok: false, reason: 'author-identity-mismatch' })
})
it('quarantines renamed username for manual reconciliation', () => {
  const changed = structuredClone(fixture); changed.data.p0.tips[0].user.username = 'Other'
  expect(parse(changed)[0].ok).toBe(false)
})
it('quarantines absent author stats rather than copying segment stats', () => {
  const changed = structuredClone(fixture); changed.data.p0.tips[0].user.stats.tipsCount = null
  expect(parse(changed)[0].ok).toBe(false)
})
it('quarantines no returned pick without declaring profile nonexistent', () => {
  const changed = structuredClone(fixture); changed.data.p0.tips = []
  expect(parse(changed)[0]).toMatchObject({ ok: false, reason: 'no-unique-author-sample' })
})
it('rejects invalid win rate', () => {
  const changed = structuredClone(fixture); changed.data.p0.tips[0].user.stats.winRate = 101
  expect(parse(changed)[0].ok).toBe(false)
})
it('bounds query size and excludes arbitrary identity injection', () => {
  expect(() => buildProfileTotalsQuery([])).toThrow()
  expect(() => buildProfileTotalsQuery([...ids, ids[0]])).toThrow()
  expect(() => buildProfileTotalsQuery([{ guid: 'bad', username: 'x' }])).toThrow()
  expect(() => buildProfileTotalsQuery([ids[0], ids[0]])).toThrow()
})
it('uses variable filters and one pick per GUID, without historical pagination', () => {
  const q = buildProfileTotalsQuery(ids)
  expect(q.query.match(/limit:1,/g)).toHaveLength(6)
  expect(q.query).not.toContain(ids[0].guid)
  expect(q.variables.f0.user).toBe(ids[0].guid)
})
it('rejects capture time without an offset', () => expect(() => parseProfileTotalsBatch(fixture, ids, '2026-11-17T18:00:00')).toThrow())
