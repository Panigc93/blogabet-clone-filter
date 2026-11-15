import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { HttpError, NO_RETRY_STATUSES, DEFAULT_MAX_ATTEMPTS } from '@/crawler/crawl'

describe('catalog retry policy', () => {
  it('never retries block, auth or rate-limit statuses', () => {
    expect(NO_RETRY_STATUSES).toEqual([401, 403, 429])
    expect(new HttpError(429, 'Too Many Requests').status).toBe(429)
  })
  it('default attempts are bounded: 5 total (was 8)', () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBe(5)
  })
})

describe('crawl-daily workflow', () => {
  const wf = readFileSync('.github/workflows/crawl-daily.yml', 'utf8')
  it('has no outer retry loops: both steps run once', () => {
    expect(wf).not.toMatch(/for i in/)
    expect(wf).not.toMatch(/sleep \d+/)
    expect((wf.match(/npx tsx crawler\/crawl\.ts/g) ?? []).length).toBe(1)
    expect((wf.match(/npx tsx crawler\/stats\.ts/g) ?? []).length).toBe(1)
  })
  it('stats exit code reaches the job (last command of the step, no "|| true", no break)', () => {
    const stats = wf.slice(wf.indexOf('Run stats crawler'))
    expect(stats).not.toMatch(/\|\| true|&& break|; true/)
    expect(stats.trimEnd().endsWith('npx tsx crawler/stats.ts')).toBe(true)
  })
  it('stats still run if the catalog step failed, and clearing is not enabled', () => {
    expect(wf).toMatch(/if: \$\{\{ !cancelled\(\) \}\}/)
    expect(wf).not.toMatch(/CLEAR_INACTIVE_STATS/)
  })
  it('keeps the schedule untouched', () => {
    expect(wf).toMatch(/cron: '0 3 \* \* \*'/)
  })
})
