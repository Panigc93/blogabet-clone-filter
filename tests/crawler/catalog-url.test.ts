import { describe, it, expect } from 'vitest'
import { blogabetUrl, CATALOG_ORDER } from '@/crawler/crawl'

describe('blogabetUrl', () => {
  it('uses the followers order', () => {
    expect(CATALOG_ORDER).toBe('followers')
    expect(new URL(blogabetUrl(1, 0)).searchParams.get('f[order]')).toBe('followers')
  })
  it('differs from the previous yield URL only in f[order]', () => {
    const now = new URL(blogabetUrl(1, 30))
    const before = new URL(blogabetUrl(1, 30))
    before.searchParams.set('f[order]', 'yield')
    now.searchParams.delete('f[order]')
    before.searchParams.delete('f[order]')
    expect(now.toString()).toBe(before.toString())
    expect(now.searchParams.get('f[lastActive]')).toBe('1')
    expect(now.searchParams.get('f[start]')).toBe('30')
    expect(now.searchParams.get('f[leagues]')).toBe('all')
  })
})

import { blogabetUrl as _u, OFFICIAL_ORDERS } from '../../crawler/listing'
describe('test-only order override', () => {
  it('default order is unchanged and override only changes f[order]', () => {
    const base = new URL(_u(1, 0)), prof = new URL(_u(1, 0, 'profit'))
    expect(base.searchParams.get('f[order]')).toBe('followers')
    expect(prof.searchParams.get('f[order]')).toBe('profit')
    prof.searchParams.set('f[order]', 'followers')
    expect(prof.toString()).toBe(base.toString())
    expect(OFFICIAL_ORDERS).toContain('profit')
  })
})
