import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseBlogabetProfile } from '@/crawler/blogabet-profile-signal'
import { signalToAccessUpdate, probeProfiles } from '@/crawler/blogabet-profile-probe'

const frag = (slug: string) =>
  readFileSync(new URL(`../fixtures/blogabet-profile/${slug}.fragment.html`, import.meta.url), 'utf8')
const OBSERVED = new Date('2026-11-20T17:00:00Z')

describe('signalToAccessUpdate (prepared probe mapping, not executed)', () => {
  it('banner -> free with evidence and observation date', () => {
    const u = signalToAccessUpdate(parseBlogabetProfile(frag('jj1ba0')), OBSERVED)
    expect(u.accessClass).toBe('free')
    expect(u.accessEvidence).toContain('NON-VERIFIED')
    expect(u.accessObservedAt).toBe(OBSERVED)
  })

  it('subscribe price -> paid with the price in evidence', () => {
    const u = signalToAccessUpdate(parseBlogabetProfile(frag('sabobic')), OBSERVED)
    expect(u.accessClass).toBe('paid')
    expect(u.accessEvidence).toContain('59')
  })

  it('SERVICE FULL -> paid without a price', () => {
    const u = signalToAccessUpdate(parseBlogabetProfile(frag('ibet-35')), OBSERVED)
    expect(u.accessClass).toBe('paid')
    expect(u.accessEvidence).toContain('SERVICE FULL')
  })

  it('no-signal and not-found -> NULL class, still stamped (stale listing flags never resurrect)', () => {
    const noSignal = signalToAccessUpdate(parseBlogabetProfile(frag('yugovalue')), OBSERVED)
    expect(noSignal.accessClass).toBeNull()
    expect(noSignal.accessEvidence).toBe('no-signal')
    const dead = signalToAccessUpdate(parseBlogabetProfile(frag('versustips11')), OBSERVED)
    expect(dead.accessClass).toBeNull()
    expect(dead.accessEvidence).toBe('blog-not-found')
    expect(dead.accessObservedAt).toBe(OBSERVED)
  })
})

describe('probeProfiles flow shape (dry-run over fixture fetches, no network)', () => {
  it('maps each fetched page to its access update, in order, without writes', async () => {
    const pages: Record<string, string> = {
      jj1ba0: frag('jj1ba0'),
      'ibet-35': frag('ibet-35'),
      versustips11: frag('versustips11'),
    }
    const updates = await probeProfiles(['jj1ba0', 'ibet-35', 'versustips11'], {
      write: false,
      fetchHtml: async (slug) => pages[slug],
      intervalMs: 0,
    })
    expect(updates.map(u => u.accessClass)).toEqual(['free', 'paid', null])
  })
})
