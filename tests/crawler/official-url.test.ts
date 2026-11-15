import { describe, it, expect } from 'vitest'
import { blogabetUrl } from '@/crawler/crawl'

// Official XHR observed in the site's own UI on 2026-11-15 (order=followers, lastActive=12, start=0).
const OFFICIAL =
  'https://blogabet.com/tipsters/?f[language]=all&f[pickType]=all&f[sport]=all&f[sportPercent]=&f[leagues]=all&f[picksOver]=0&f[lastActive]=12&f[bookiesUsed]=null&f[bookiePercent]=&f[order]=followers&f[start]=0'

describe('blogabetUrl matches the official request', () => {
  it('is identical to the official XHR for the same filters', () => {
    expect(blogabetUrl(12, 0, 'followers')).toBe(OFFICIAL)
  })
  it('keeps yield as the default order and the same filters', () => {
    expect(blogabetUrl(1, 20)).toBe(OFFICIAL.replace('lastActive]=12', 'lastActive]=1').replace('order]=followers', 'order]=yield').replace('start]=0', 'start]=20'))
  })
  it('survives URL parsing with literal brackets', () => {
    expect(new URL(blogabetUrl(1, 0)).search).toContain('f[order]=yield')
  })
})
