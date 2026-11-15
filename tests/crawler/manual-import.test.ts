import { describe, it, expect } from 'vitest'
import { normalizeImport, ManualImportError } from '@/crawler/platforms/manual-import'

// FABRICATED input: invented tipsters standing in for a dataset the owner
// lawfully holds (e.g. sent by a tipster). Not real platform data.

const VALID = {
  sourceNote: 'provided directly by the tipster for demo purposes, 2026-11-15',
  records: [
    {
      platform: 'tipstrr' as const,
      username: 'Demo Rovers Tips',
      profileUrl: 'https://tipstrr.com/tipster/demo-rovers-tips',
      accountType: 'premium' as const,
      sportName: 'Fútbol',
      stats: {
        picks: 268,
        yieldPct: 13.4,
        yieldBasis: 'advised-stakes' as const,
        winRatePct: 44,
        avgOdds: 2.62,
        periodLabel: 'Últimos 12 meses',
      },
    },
    {
      platform: 'golazobets' as const,
      username: 'Ejemplo Corner Pro',
      stats: {},
    },
  ],
}

describe('normalizeImport', () => {
  it('normalizes records with full provenance and null defaults', () => {
    const out = normalizeImport(VALID)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({
      platform: 'tipstrr',
      platformId: 'import:tipstrr:demo rovers tips',
      username: 'Demo Rovers Tips',
      accountType: 'premium',
    })
    expect(out[0].samples[0]).toMatchObject({
      picks: 268,
      yieldPct: 13.4,
      yieldBasis: 'advised-stakes',
      scope: 'all_time',
    })
    // absent fields are null, never 0
    expect(out[1].samples[0]).toMatchObject({
      picks: null,
      yieldPct: null,
      yieldBasis: 'unknown',
    })
  })

  it('refuses a dataset without a real source note', () => {
    expect(() => normalizeImport({ sourceNote: 'web', records: [] })).toThrow(ManualImportError)
  })

  it('refuses records without username or platform', () => {
    expect(() =>
      normalizeImport({ ...VALID, records: [{ platform: 'tipstrr' } as never] }),
    ).toThrow(ManualImportError)
    expect(() =>
      normalizeImport({ ...VALID, records: [{ username: 'X' } as never] }),
    ).toThrow(ManualImportError)
  })
})
