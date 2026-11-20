import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseBlogabetProfile } from '@/crawler/blogabet-profile-signal'

// Fixtures are minimal fragments extracted 2026-11-20 from 13 profile pages
// fetched with the authorized crawler method (>=10s apart, all HTTP 200, no
// blocks). Full pages are not committed (session-fetched); each fixture
// records its source URL and date in an HTML comment.
const frag = (slug: string) =>
  readFileSync(new URL(`../fixtures/blogabet-profile/${slug}.fragment.html`, import.meta.url), 'utf8')

describe('parseBlogabetProfile (13-profile sample, 2026-11-20)', () => {
  it('non-verified blogs carry the affirmative free banner', () => {
    for (const slug of ['jj1ba0', 'aussie1126', 'safin1', 'ilikemybet']) {
      const r = parseBlogabetProfile(frag(slug))
      expect(r.access, slug).toBe('free')
      expect(r.live).toBe(true)
      expect(r.signal).toMatchObject({ kind: 'free-nonverified' })
    }
  })

  it('paid services carry an explicit subscribe price matching the stored listing price', () => {
    const sabobic = parseBlogabetProfile(frag('sabobic'))
    expect(sabobic.access).toBe('paid')
    expect(sabobic.signal).toMatchObject({ kind: 'paid-price', priceEur: 59 })
    const dedi22 = parseBlogabetProfile(frag('dedi22'))
    expect(dedi22.signal).toMatchObject({ kind: 'paid-price', priceEur: 55 })
  })

  it('SERVICE FULL is a paid service without a parseable price (stored false is not free)', () => {
    const r = parseBlogabetProfile(frag('ibet-35'))
    expect(r.access).toBe('paid')
    expect(r.signal).toMatchObject({ kind: 'paid-service-full' })
  })

  it('verified profiles without a subscribe box stay unclassified, never free by absence', () => {
    for (const slug of ['yugovalue', 'anubispicks', 'scpicks23']) {
      const r = parseBlogabetProfile(frag(slug))
      expect(r.access, slug).toBeNull()
      expect(r.live).toBe(true)
      expect(r.signal.kind).toBe('none')
    }
  })

  it('deleted blogs answer Blog not found: stale flags prove nothing', () => {
    for (const slug of ['versustips11', 'ouzbourne', 'iordan']) {
      const r = parseBlogabetProfile(frag(slug))
      expect(r.live, slug).toBe(false)
      expect(r.access).toBeNull()
      expect(r.signal.kind).toBe('not-found')
    }
  })
})
