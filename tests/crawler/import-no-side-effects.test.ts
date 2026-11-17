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
  it('Bet2Invest executor import is inert without credentials or fetch', () => {
    const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
      globalThis.fetch = () => { throw new Error('NETWORK_NOT_ALLOWED') }
      delete process.env.DATABASE_URL
      const m = await import('./crawler/platforms/bet2invest/execute-offline-import.ts')
      const exports = m.default || m
      if (typeof exports.executeOfflineImport !== 'function') throw new Error('missing executor')
      console.log('inert-executor-ok')
    `], { cwd: process.cwd(), encoding: 'utf8' })
    expect(child.status, child.stderr).toBe(0)
    expect(child.stdout.trim()).toBe('inert-executor-ok')
  })
  it('still runs CLI directly and refuses missing credentials before network', () => {
    const env = { ...process.env }
    delete env.DATABASE_URL
    const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/import-tipstrr-prod.ts'], { cwd: process.cwd(), encoding: 'utf8', env })
    expect(child.status).toBe(1)
    expect(child.stderr).toContain('DATABASE_URL ausente o dummy')
    expect(child.stdout).not.toContain('INSERT')
  })

})
