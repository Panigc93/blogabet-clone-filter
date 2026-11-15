import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdtempSync } from 'fs'
import { spawnSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'

const wf = readFileSync('.github/workflows/diag-listing-profit.yml', 'utf8')
const script = readFileSync('.github/diag/listing-profit.mjs', 'utf8')

describe('diagnostic workflow isolation', () => {
  it('has no schedule, no dispatch, and only fires on the diag branch push', () => {
    expect(wf).not.toMatch(/schedule:|cron:|workflow_dispatch|pull_request/)
    expect(wf).toMatch(/branches: \['diag\/listing-profit-once'\]/)
  })
  it('uses only BLOGABET_COOKIE, read-only permissions, no artifacts, no install step', () => {
    const secrets = Array.from(wf.matchAll(/secrets\.([A-Z_]+)/g)).map(m => m[1])
    expect(secrets).toEqual(['BLOGABET_COOKIE'])
    expect(wf).toMatch(/permissions:\n  contents: read/)
    expect(wf).not.toMatch(/upload-artifact|npm ci|npm install|DATABASE_URL|NEON/i)
  })
  it('script has no imports, no database, no retries and one fetch call', () => {
    const code = script.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    expect(code).not.toMatch(/^\s*import\s|require\(|neon|drizzle|DATABASE|playwright/m)
    expect(code).not.toMatch(/for \(|while \(|setTimeout|retry/i)
    expect((script.match(/\bfetch\(/g) ?? []).length).toBe(1)
  })
  it('requests exactly the user-reported combination: profit, 3 months, over 500 picks, start 0', () => {
    expect(script).toContain('f[sportPercent]=&f[leagues]=all&f[picksOver]=500&f[lastActive]=3&f[bookiesUsed]=null&f[bookiePercent]=&f[order]=profit&f[start]=0')
  })
})

describe('diagnostic script output (stubbed fetch, no network)', () => {
  const run = (response: object) => {
    const dir = mkdtempSync(join(tmpdir(), 'diag-'))
    const stub = join(dir, 'stub.mjs')
    writeFileSync(stub, `
      globalThis.__calls = 0
      globalThis.fetch = async (url, init) => {
        globalThis.__calls++
        if (globalThis.__calls > 1) throw new Error('second fetch')
        console.log('STUB_URL ' + url)
        console.log('STUB_HAS_COOKIE ' + (init.headers.Cookie === process.env.BLOGABET_COOKIE))
        return new Response(${JSON.stringify((response as any).body)}, { status: ${(response as any).status}, headers: { 'content-type': 'text/html', 'set-cookie': 'SECRETSET=1' } })
      }
    `)
    return spawnSync('node', ['--import', stub, '.github/diag/listing-profit.mjs'], {
      env: { ...process.env, BLOGABET_COOKIE: 'login_string=SUPERSECRETVALUE123' },
      encoding: 'utf8',
    })
  }
  it('never prints the cookie, body or header values; one request only', () => {
    const r = run({ status: 200, body: '<div class="tipster-block">PRIVATEBODY</div><div class="tipster-block"></div>' })
    const out = r.stdout + r.stderr
    expect(out).not.toContain('SUPERSECRETVALUE123')
    expect(out).not.toContain('PRIVATEBODY')
    expect(out).not.toContain('SECRETSET')
    expect(out).toContain('STUB_HAS_COOKIE true')
    expect(out).toContain('"status":200')
    expect(out).toContain('"tipsterBlocks":2')
    expect(r.status).toBe(0)
  })
  it('a 500 exits non-zero, with no second request', () => {
    const r = run({ status: 500, body: '' })
    expect(r.stdout).toContain('"status":500')
    expect(r.stdout).not.toContain('second fetch')
    expect(r.status).toBe(1)
  })
  it('refuses to run without the cookie', () => {
    const r = spawnSync('node', ['.github/diag/listing-profit.mjs'], { env: { PATH: process.env.PATH ?? '' } as unknown as NodeJS.ProcessEnv, encoding: 'utf8' })
    expect(r.status).toBe(1)
    expect(r.stdout).toMatch(/not set/)
  })
})
