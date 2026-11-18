import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { registrationCreatedAt, validRegistrationDate } from '@/crawler/platforms/bet2invest/registration'
import { parseProfilePage } from '@/crawler/platforms/bet2invest/parse'
const load = (name: string) => readFileSync(`tests/fixtures/bet2invest/${name}`, 'utf8')
const payload = (d: unknown[]) => `<script id="__NUXT_DATA__">${JSON.stringify(d)}</script>`
const fixture = (): unknown[] => [{username:1,createdAt:2,lastBetAt:3},'Example','2023-07-12T08:46:45.810Z',null]
describe('B2I registration Since, distinct from first bet and bankroll', () => {
  it.each([['kopf','ssr-payload-kopf.html','2025-02-22T09:20:50.681Z'],['NumeroX','ssr-payload-numerox.html','2023-07-12T08:46:45.810Z']])('reads real account identity %s', (username,file,date) => {
    expect(registrationCreatedAt(load(file),username)).toBe(date)
    const statsFile = username === 'kopf' ? 'free-hydrated-kopf.html' : 'pro-ssr-numerox.html'
    const script = load(file).match(/<script[^>]*id="__NUXT_DATA__"[^>]*>[\s\S]*?<\/script>/)![0]
    expect(parseProfilePage(load(statsFile) + script).registrationCreatedAt).toBe(date)
  })
  it('rejects wrong username and case mismatch', () => {
    expect(registrationCreatedAt(payload(fixture()),'Other')).toBeNull()
    expect(registrationCreatedAt(payload(fixture()),'example')).toBeNull()
  })
  it('rejects duplicate users even if dates agree', () => {
    const d=fixture(); d.push(d[0]);expect(registrationCreatedAt(payload(d),'Example')).toBeNull()
  })
  it('ignores bankroll and profile creation dates', () => {
    const d=fixture();d.push({createdAt:4,lastReset:4},'2026-01-01T00:00:00.000Z');expect(registrationCreatedAt(payload(d),'Example')).toBe('2023-07-12T08:46:45.810Z')
  })
  it.each(['','<script id="__NUXT_DATA__">invalid</script>',payload([]),payload([{}])])('fails closed on absent or malformed payload', html => expect(registrationCreatedAt(html,'Example')).toBeNull())
  it('rejects multiple payload scripts',()=>expect(registrationCreatedAt(payload(fixture())+payload(fixture()),'Example')).toBeNull())
  it.each(['2026-02-30T00:00:00.000Z','2023-07-12','invalid',null,42,'1960-01-01T00:00:00.000Z'])('rejects invalid date %s', date => expect(validRegistrationDate(date)).toBeNull())
  it('rejects creation after capture and invalid capture',()=>{
    expect(validRegistrationDate('2026-11-19T00:00:00.000Z',new Date('2026-11-18'))).toBeNull()
    expect(validRegistrationDate('2023-07-12T08:46:45.810Z',new Date('invalid'))).toBeNull()
  })
})
