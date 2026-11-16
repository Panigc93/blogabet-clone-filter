import { describe, it, expect } from 'vitest'
import { parseSitemapProfiles } from '@/crawler/platforms/bet2invest/catalog'

// Fictional sitemap modelled on the real __sitemap__/en-us.xml shape.

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://bet2invest.com/tipsters</loc></url>
  <url><loc>https://bet2invest.com/tipsters/soccer</loc></url>
  <url><loc>https://bet2invest.com/tipsters/performance-stats/AAAONE</loc></url>
  <url><loc>https://bet2invest.com/tipsters/performance-stats/BBB-two</loc></url>
  <url><loc>https://bet2invest.com/tipsters/performance-stats/AAAONE</loc></url>
  <url><loc>https://bet2invest.com/blog/some-article</loc></url>
</urlset>`

describe('parseSitemapProfiles', () => {
  it('extracts profile slugs only, deduplicated', () => {
    const profiles = parseSitemapProfiles(SITEMAP)
    expect(profiles.map((p) => p.slug)).toEqual(['AAAONE', 'BBB-two'])
    expect(profiles[0].url).toBe('https://bet2invest.com/tipsters/performance-stats/AAAONE')
  })

  it('returns an empty list when no profiles are present', () => {
    expect(parseSitemapProfiles('<urlset></urlset>')).toEqual([])
  })
})
