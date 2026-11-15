import { describe, it, expect } from 'vitest'
import { normalizeImport, parseImportFile, ManualImportError } from '@/crawler/platforms/manual-import'
import { evaluateMys } from '@/crawler/platforms/mys'

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

describe('parseImportFile', () => {
  const valid = {
    sourceNote: 'exported file provided by tipster on 2026-11-15',
    records: [{ platform: 'tipstrr', username: 'Alguien', stats: { picks: 120, yieldPct: 11.2 } }],
  }

  it('accepts a minimal valid file', () => {
    const parsed = parseImportFile(valid)
    expect(parsed.records).toHaveLength(1)
    expect(parsed.records[0].stats?.picks).toBe(120)
  })

  it('rejects a short or missing sourceNote', () => {
    expect(() => parseImportFile({ records: [] })).toThrow(ManualImportError)
    expect(() => parseImportFile({ sourceNote: 'short', records: [] })).toThrow(ManualImportError)
  })

  it('rejects string numbers instead of coercing them', () => {
    expect(() =>
      parseImportFile({
        sourceNote: valid.sourceNote,
        records: [{ platform: 'tipstrr', username: 'X', stats: { yieldPct: '12.5' } }],
      }),
    ).toThrow(/record 0\.stats\.yieldPct must be a finite number/)
  })

  it('rejects an unknown platform', () => {
    expect(() =>
      parseImportFile({
        sourceNote: valid.sourceNote,
        records: [{ platform: 'betfair', username: 'X' }],
      }),
    ).toThrow(/platform must be one of/)
  })

  it('rejects non-object records with their index', () => {
    expect(() =>
      parseImportFile({ sourceNote: valid.sourceNote, records: [null, 'nope'] }),
    ).toThrow(/record 0 must be an object/)
  })

  it('treats null stats fields as absent', () => {
    const parsed = parseImportFile({
      sourceNote: valid.sourceNote,
      records: [{ platform: 'tipstrr', username: 'X', stats: { picks: null, yieldPct: null } }],
    })
    expect(parsed.records[0].stats?.picks).toBeUndefined()
  })

  it('end to end: parse then normalize keeps absent metrics null', () => {
    const out = normalizeImport(
      parseImportFile({
        sourceNote: valid.sourceNote,
        records: [{ platform: 'golazobets', username: 'Y', stats: { picks: 150 } }],
      }),
    )
    expect(out[0].samples[0].picks).toBe(150)
    expect(out[0].samples[0].yieldPct).toBeNull()
    expect(evaluateMys(out[0].samples[0]).passesMY).toBeNull()
  })
})
