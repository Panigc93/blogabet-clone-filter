import { describe, it, expect } from 'vitest'
import { HttpError, NO_RETRY_STATUSES } from '../../crawler/crawl'

describe('crawl retry policy', () => {
  it('block, auth and rate-limit statuses are never retried', () => {
    expect(NO_RETRY_STATUSES).toEqual([401, 403, 429])
  })
  it('HttpError carries the status', () => {
    const e = new HttpError(500, 'Internal Server Error')
    expect(e.status).toBe(500)
    expect(e.message).toMatch(/500/)
  })
})
