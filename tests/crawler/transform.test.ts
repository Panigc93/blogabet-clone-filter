import { describe, it, expect } from 'vitest'
import { transformTipster } from '@/crawler/crawl'

const mockApiTipster = {
  id: 12345,
  name: 'Test Tipster',
  slug: 'test-tipster',
  avatar: 'https://cdn.blogabet.com/avatars/abc.jpg',
  country: { flag: 'https://cdn.blogabet.com/images/flag/spain.png', code: 'ES' },
  subscription: { price: 9.99 },
  memberSince: '2022-05-15T00:00:00Z',
  picks: 500,
  profit: 1234.56,
  yield: 24.5,
  verifiedPercent: 87,
  followers: 120,
  lastPickDate: '2026-03-15T10:00:00Z',
  resetCount: 2,
}

describe('transformTipster', () => {
  it('maps all fields correctly', () => {
    const result = transformTipster(mockApiTipster)
    expect(result.id).toBe(12345)
    expect(result.slug).toBe('test-tipster')
    expect(result.name).toBe('Test Tipster')
    expect(result.avatarUrl).toBe('https://cdn.blogabet.com/avatars/abc.jpg')
    expect(result.countryCode).toBe('ES')
    expect(result.price).toBe('9.99')
    expect(result.isPaid).toBe(true)
    expect(result.sinceYear).toBe(2022)
    expect(result.picks).toBe(500)
    expect(result.verifiedPct).toBe('87')
    expect(result.followers).toBe(120)
    expect(result.resetCount).toBe(2)
  })

  it('sets isPaid=false and price=null when subscription.price is null', () => {
    const result = transformTipster({ ...mockApiTipster, subscription: { price: null } })
    expect(result.isPaid).toBe(false)
    expect(result.price).toBeNull()
  })

  it('sets isPaid=false when subscription.price is 0', () => {
    const result = transformTipster({ ...mockApiTipster, subscription: { price: 0 } })
    expect(result.isPaid).toBe(false)
  })

  it('parses sinceYear from ISO date string', () => {
    const result = transformTipster({ ...mockApiTipster, memberSince: '2019-01-01T00:00:00Z' })
    expect(result.sinceYear).toBe(2019)
  })
})
