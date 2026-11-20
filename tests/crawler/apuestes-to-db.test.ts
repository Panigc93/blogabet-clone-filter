import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  apuestesRowToInsert, apuestesDisplayName, apuestesSlugBase, resolveApuestesSlug,
  isEmailLike, isMonthsIncomplete, assertApuestesImportProvenance,
  type ApuestesCaptureRow, type ApuestesDbMapping,
} from '@/crawler/platforms/apuestes/to-db'

const mustMap = (m: ApuestesDbMapping) => {
  if (!m.ok) throw new Error(m.reason)
  return m.insert
}

const baseRow: ApuestesCaptureRow = {
  id: 31968,
  username: 'Avatarr',
  capturedAt: '2026-11-19T22:45:00Z',
  followers: 8,
  pickPrice: 0,
  plans: { '10': 0, '12': 0 },
  hist: { totalPicks: 2647, yield: 4.27, totalProfit: 501.2, winRate: 55, stakeAvg: 1, oddsAvg: 1.8, winPicks: 1400, lostPicks: 1200, nullPicks: 47 },
  m3: { totalPicks: 89, yield: 28.74, totalProfit: 25.6, winRate: 60, stakeAvg: 1, oddsAvg: 1.9, winPicks: 53, lostPicks: 36, nullPicks: 0 },
  m6: { totalPicks: 184, yield: 12.88, totalProfit: 23.7, winRate: 58, stakeAvg: 1, oddsAvg: 1.85, winPicks: 107, lostPicks: 77, nullPicks: 0 },
  m12: { totalPicks: 695, yield: 9.63, totalProfit: 66.9, winRate: 56, stakeAvg: 1, oddsAvg: 1.83, winPicks: 389, lostPicks: 306, nullPicks: 0 },
  lastActivityMonth: '2026-11',
  months: [
    { numpicks: 89, sumprofit: 25.6, sumstaked: 89, fecha_pub2: '2026-11' },
    { numpicks: 95, sumprofit: -1.9, sumstaked: 95, fecha_pub2: '2026-10' },
    { numpicks: 2463, sumprofit: 477.5, sumstaked: 2500, fecha_pub2: "2020-05" },
  ],
}

describe('apuestesRowToInsert', () => {
  const insert = mustMap(apuestesRowToInsert(baseRow, { id: 31968, idSource: 'source-captured', slug: 'avatarr' }))

  it('maps core fields with apuestes units discipline', () => {
    expect(insert.platform).toBe('apuestes')
    expect(insert.slug).toBe('avatarr')
    expect(insert.name).toBe('Avatarr')
    expect(insert.profitUnit).toBe('apuestes-units')
    expect(insert.priceCurrency).toBe('eur')
    expect(insert.picks).toBe(2647)
    expect(insert.profit).toBe('501.200')
    expect(insert.yield).toBe('4.27')
    expect(insert.followers).toBe(8)
    expect(insert.sourcePortfolioId).toBe(31968)
    expect(insert.sinceYear).toBe(2020) // oldest month with recorded picks
  })

  it('keeps unexposed fields null and never fabricates', () => {
    expect(insert.price).toBeNull() // plan key semantics unverified
    expect(insert.verifiedPct).toBeNull()
    expect(insert.avatarUrl).toBeNull()
    expect(insert.lastPickAt).toBeNull() // month granularity, not a pick date
    expect(insert.picksFree3mAvg).toBeNull()
    expect(insert.yieldFree3m).toBeNull()
  })

  it('window yields and picks6mAvg come from site windows; empty window is NULL', () => {
    expect(insert.yield3m).toBe('28.74')
    expect(insert.yield6m).toBe('12.88')
    expect(insert.yield12m).toBe('9.63')
    expect(insert.picks6mAvg).toBe((184 / 6).toFixed(2))
    const idle = mustMap(apuestesRowToInsert({
      ...baseRow,
      m3: { totalPicks: 0, yield: null, totalProfit: null, winRate: null, stakeAvg: null, oddsAvg: null, winPicks: null, lostPicks: null, nullPicks: null },
    }, { id: 1, idSource: 'isolated-fixture', slug: 'idle' }))
    expect(idle.yield3m).toBeNull()
  })

  it('holds discrepancy rows row-level (picks NOT NULL: no field-level null)', () => {
    const m = apuestesRowToInsert({ ...baseRow, discrepancy: { field: 'totalPicks', listingValue: 1084, profileValue: 1086 } }, { id: 2, idSource: 'isolated-fixture', slug: 'disc' })
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.klass).toBe('cuarentena[totalPicks-discrepancy]')
  })

  it('holds months-incomplete rows completely', () => {
    const partial = {
      ...baseRow,
      hist: { ...baseRow.hist!, totalPicks: 1117 },
      months: baseRow.months!.slice(0, 2), // sum 184 below hist 1117: site exposes only recent months
    }
    const m = apuestesRowToInsert(partial, { id: 54750, idSource: 'isolated-fixture', slug: 'goldeoro' })
    expect(m.ok).toBe(false)
    if (!m.ok) expect(m.klass).toBe('cuarentena[months-incomplete]')
    expect(isMonthsIncomplete(partial)).toBe(true)
    expect(isMonthsIncomplete(baseRow)).toBe(false)
  })

  it('holds quarantined rows, surfacing the retry outcome when present', () => {
    const m = apuestesRowToInsert({ ...baseRow, quarantine: { http: '302', reason: 'http:302' }, retry: { outcome: 'redirect-to-listing' } }, { id: 3, idSource: 'isolated-fixture', slug: 'q' })
    expect(m.ok).toBe(false)
    if (!m.ok) {
      expect(m.klass).toBe('cuarentena[capture]')
      expect(m.reason).toContain('redirect-to-listing')
    }
  })

  it('provenance guard rejects isolated-fixture ids on the real route', () => {
    expect(() => assertApuestesImportProvenance('isolated-fixture', 'x')).toThrow()
    expect(() => assertApuestesImportProvenance('source-captured', 'x')).not.toThrow()
  })
})

describe('apuestes privacy: email-shaped usernames never exposed', () => {
  // Fabricated fixtures with the same shapes as the 7 real cases (which
  // live only in the private dataset, never in git): plain, long-local-part,
  // numeric local part, odd domain.
  const emails = [
    'fakeuser10@hotmail.com', 'fake.user@gmail.com', 'fakename1984@gmail.com',
    'fake81@gmail.com', 'fakelongusername@gmail.com', 'fakehandle@7gmail.com',
    'faketeamcards@hotmail.com',
  ]
  it('display name masks the address (no @, no domain)', () => {
    for (const e of emails) {
      const name = apuestesDisplayName(e)
      expect(name).not.toContain('@')
      expect(name).not.toMatch(/\.[a-z]{2,}$/i)
      expect(name.endsWith('***')).toBe(true)
    }
    expect(apuestesDisplayName('Avatarr')).toBe('Avatarr') // normal names untouched
  })
  it('slug never contains @ or dots, for any username', () => {
    for (const e of [...emails, '[ XOVA ]', '| XOVA |', "KING'S BACK", 'TeamBet#', '@MendezTipster']) {
      const slug = apuestesSlugBase(e)
      expect(slug).not.toContain('@')
      expect(slug).not.toContain('.')
      expect(slug).toMatch(/^[a-z0-9-]*$/)
    }
  })
  it('mapped insert of an email-username row exposes neither name nor slug with the address', () => {
    const taken = new Set<string>()
    const slug = resolveApuestesSlug('fake.user@gmail.com', 42, taken)
    const insert = mustMap(apuestesRowToInsert({ ...baseRow, id: 42, username: 'fake.user@gmail.com' }, { id: 42, idSource: 'isolated-fixture', slug }))
    expect(insert.name).not.toContain('@')
    expect(insert.slug).not.toContain('@')
    expect(JSON.stringify({ name: insert.name, slug: insert.slug })).not.toContain('gmail')
  })
  it('the whole captured dataset: no email-shaped name or @ in any slug', () => {
    const rows = readFileSync(new URL('../../data/apuestes/profiles.jsonl', import.meta.url), 'utf8')
      .split('\n').filter(Boolean).map(l => JSON.parse(l) as ApuestesCaptureRow)
    const taken = new Set<string>()
    let masked = 0
    for (const r of rows) {
      const slug = resolveApuestesSlug(r.username, r.id, taken)
      expect(slug).not.toContain('@')
      if (isEmailLike(r.username)) {
        masked++
        expect(apuestesDisplayName(r.username)).not.toContain('@')
      }
    }
    expect(masked).toBe(7) // the 7 real addresses in the capture
    expect(taken.size).toBe(rows.length) // every slug unique
  })
})

describe('apuestes slug collisions', () => {
  it('[ XOVA ] id 14810 and | XOVA | id 13394 get distinct slugs', () => {
    const taken = new Set<string>()
    const a = resolveApuestesSlug('[ XOVA ]', 14810, taken)
    const b = resolveApuestesSlug('| XOVA |', 13394, taken)
    expect(a).not.toBe(b)
    expect(a).toBe('xova')
    expect(b).toBe('xova-13394')
  })
})

describe('mergeApuestesUpdate + planApuestesImport (ruta idempotente)', () => {
  it('merge: null nuevo = vacío verdadero y SOBREESCRIBE; identidad inmutable', async () => {
    const { mergeApuestesUpdate } = await import('@/crawler/platforms/apuestes/to-db')
    const existing = mustMap(apuestesRowToInsert(baseRow, { id: -2000000001, idSource: 'internal-transactional', slug: 'avatarr', sourceUrl: 'https://apuestes.com/tipster/Avatarr' }))
    // ventana 3m pasa a vacía (picks 0 -> yield null) y followers deja de exponerse:
    // el mapping solo emite null por vacío verdadero, así que el update pisa.
    const next = { ...existing, yield3m: null, followers: null, capturedAt: new Date('2026-11-20T00:00:00Z'), id: 999, slug: 'otro' }
    const merged = mergeApuestesUpdate(existing, next)
    expect(merged.yield3m).toBeNull()      // poblado->vacío: NULL aplicado, no conservado
    expect(merged.followers).toBeNull()
    expect(merged.id).toBe(existing.id)    // identidad jamás se pisa
    expect(merged.slug).toBe('avatarr')
    expect(merged.capturedAt).toEqual(new Date('2026-11-20T00:00:00Z'))
  })

  it('plan sobre la captura real: 3.716 filas -> 3.659 inserts + 57 holds, con source_url exacta', async () => {
    const { planApuestesImport } = await import('@/crawler/platforms/apuestes/import')
    const plan = planApuestesImport(
      new URL('../../data/apuestes/profiles.jsonl', import.meta.url).pathname,
      new URL('../../data/apuestes/profile-urls.json', import.meta.url).pathname,
    )
    expect(plan.rows).toBe(3716)
    expect(plan.inserts.length).toBe(3659)
    expect(plan.holds.length).toBe(57)
    let masked = 0
    for (const ins of plan.inserts) {
      expect(ins.id).toBe(0) // placeholder: la secuencia interna asigna el real en transacción
      if (ins.name.endsWith('***')) {
        masked++
        expect(ins.sourceUrl).toBeNull() // email-shaped: la URL exacta llevaría la dirección
      } else {
        expect(ins.sourceUrl).toMatch(/^https:\/\/apuestes\.com\/tipster\//)
        // la URL no lleva una dirección email (handles con '@' no-email sí, es su handle)
        expect(ins.sourceUrl).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i)
      }
    }
    expect(masked).toBe(7) // las 7 direcciones: nombre/slug/url sin la dirección
    const klasses = plan.holds.map(h => h.klass).sort()
    expect(klasses.filter(k => k === 'cuarentena[totalPicks-discrepancy]')).toHaveLength(27)
    expect(klasses.filter(k => k === 'cuarentena[months-incomplete]')).toHaveLength(2)
    expect(klasses.filter(k => k === 'cuarentena[yield-out-of-schema-range]')).toHaveLength(1)
    expect(klasses.filter(k => k === 'cuarentena[capture]')).toHaveLength(27)
  })
})
