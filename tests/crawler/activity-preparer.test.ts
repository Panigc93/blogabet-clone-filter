import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function prepare(rows: unknown[]) {
  const dir = mkdtempSync(join(tmpdir(), 'activity-prepare-'))
  try {
    const input = join(dir, 'input.jsonl'), output = join(dir, 'out.json')
    writeFileSync(input, rows.map(r => JSON.stringify(r)).join('\n'))
    const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/prepare-activity-evidence.ts', input, output], { encoding: 'utf8' })
    return { status: run.status, error: run.stderr, data: run.status === 0 ? JSON.parse(readFileSync(output, 'utf8')) : null }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
const sample = {
  slug: 'Apuestas Tx', sourceUrl: 'https://golazobets.com/tipster/Apuestas%20Tx', capturedAt: '2026-11-16T12:00:00Z',
  pagination: { current_page: 1, last_page: 8 }, observedPicks: [{ created_at: '2026-11-16 10:00:00' }]
}
describe('offline evidence preparer', () => {
  it('matches exact known slug with spaces while URL stays encoded and clamps to capture', () => {
    const r = prepare([sample])
    expect(r.status, r.error).toBe(0)
    expect(r.data[0]).toMatchObject({ slug: 'Apuestas Tx', publishedUpper: new Date(sample.capturedAt).toISOString(), coverage: 'first-page' })
  })
  it('accepts equivalent percent encoding of parentheses without changing source URL', () => {
    const sourceUrl = 'https://golazobets.com/tipster/Abreu13%20%28CamiPicks%29'
    const r = prepare([{ ...sample, slug: 'Abreu13 (CamiPicks)', sourceUrl }])
    expect(r.status, r.error).toBe(0)
    expect(r.data[0].sourceUrl).toBe(sourceUrl)
    expect(r.data[0].coverage).toBe('first-page')
  })
  it('refuses encoded/unknown slug or wrong source URL rather than silently missing DB match', () => {
    expect(prepare([{ ...sample, slug: 'Apuestas%20Tx' }]).status).not.toBe(0)
    expect(prepare([{ ...sample, sourceUrl: 'https://golazobets.com/tipster/other' }]).status).not.toBe(0)
    expect(prepare([sample, sample]).status).not.toBe(0)
  })
})
