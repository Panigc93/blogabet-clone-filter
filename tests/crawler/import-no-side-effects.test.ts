import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'

describe('production importer is inert on import', () => {
  it('imports exported SQL builders without DB, network or exit', () => {
    const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
      globalThis.fetch = () => { throw new Error('NETWORK_NOT_ALLOWED') }
      delete process.env.DATABASE_URL
      const m = await import('./scripts/import-tipstrr-prod.ts')
      const exports = m.default || m
      if (typeof exports.buildInsert !== 'function') throw new Error('missing builder')
      console.log('inert-import-ok')
    `], { cwd: process.cwd(), encoding: 'utf8' })
    expect(child.status, child.stderr).toBe(0)
    expect(child.stdout.trim()).toBe('inert-import-ok')
    expect(child.stderr).not.toContain('DATABASE_URL')
  })
})
