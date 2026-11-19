import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextRequest } from 'next/server'
import { BEPrivateResearch } from '@/components/BEPrivateResearch'
import { loadResearchEvidence, privateResearchEnabled, EVIDENCE_REVISION } from '@/lib/bettingexpert-research/evidence'
import { queryPrivateResearch, parseResearchParams, compareDecimal } from '@/lib/bettingexpert-research/query'
import { GET } from '@/app/lab/bettingexpert/research/data/route'

// Caller supplies the separately delivered private package; never network/DB.
const directory = process.env.BE_TEST_EVIDENCE_DIR
const suite = directory ? describe : describe.skip
const env = { NODE_ENV: 'development', BE_PRIVATE_RESEARCH: '1', BE_PRIVATE_RESEARCH_DIR: directory } as NodeJS.ProcessEnv
const query = (params: string) => queryPrivateResearch(new URLSearchParams(params), env)
afterEach(() => vi.unstubAllEnvs())
describe('BE lab stays off outside explicit local development', () => {
  it('is disabled by default, in test and always in production', () => {
    expect(privateResearchEnabled({ NODE_ENV: 'development' })).toBe(false)
    expect(privateResearchEnabled({ NODE_ENV: 'test', BE_PRIVATE_RESEARCH: '1' })).toBe(false)
    expect(privateResearchEnabled({ NODE_ENV: 'production', BE_PRIVATE_RESEARCH: '1' })).toBe(false)
  })
  it('private JSON returns 404 without gate and no private data', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('BE_PRIVATE_RESEARCH', '1')
    const r = GET(new NextRequest('http://localhost/lab/bettingexpert/research/data'))
    expect(r.status).toBe(404); expect(await r.json()).toEqual({ error: 'Not found' })
    expect(r.headers.get('cache-control')).toBe('no-store, private')
  })
  it('strictly parses one evidence class, period and revision', () => {
    expect(parseResearchParams(new URLSearchParams()).quality).toBe('source_boundary_gate')
    for (const params of ['quality=all', 'quality=constructor', 'quality=toString', 'period=1m', 'state=empty', 'sort=profit', 'minimum=NaN', 'page=-1', 'page=1', 'revision=changed']) expect(() => parseResearchParams(new URLSearchParams(params))).toThrow()
  })
  it('compares decimals exactly, including values indistinguishable by Number', () => {
    expect(compareDecimal('1.00000000000000000001', '1.00000000000000000000')).toBe(1)
    expect(compareDecimal('-0.01', '0')).toBe(-1)
    expect(compareDecimal('2.0', '2')).toBe(0)
  })
})
suite('bound real BE547 evidence through actual Next/React query', () => {
  it('loads all 547 fixed identities with 485 sums and no strict omissions', () => {
    const data = loadResearchEvidence(directory!)
    const windows = data.profiles.flatMap(p => Object.values(p.windows))
    expect(windows).toHaveLength(1641); expect(windows.filter(w => w.state === 'number')).toHaveLength(485)
    for (const w of windows.filter(w => w.acceptedClassLabel === 'strictNumber')) {
      expect(w.picks).toBeGreaterThan(0); expect(w.stake).toBeTypeOf('string')
      expect(w.capturedAt).toBeTypeOf('string'); expect(w.anchorCapturedAt).toBeTypeOf('string'); expect(w.originalSourceEvidenceSha256).toMatch(/^[a-f0-9]{64}$/)
    }
  })
  it('default does not silently mix classes', () => {
    const result = query('')
    expect(result.query.quality).toBe('source_boundary_gate')
    expect(result.items.every(r => r.platform === 'bettingexpert' && r.selected.quality === 'source_boundary_gate')).toBe(true)
  })
  it('counts correct cutoff numeric windows by selected period', () => {
    for (const [period, total] of [['3m', 30], ['6m', 109], ['12m', 158]]) expect(query(`period=${period}&quality=cutoff_reconstruction&state=number`).total).toBe(total)
  })
  it('keeps NULL with reasons and coverage hold distinct from empty sample', () => {
    const held = query('period=12m&quality=cutoff_reconstruction&state=held&search=Intuition')
    expect(held.total).toBe(1); expect(held.items[0].selected.valuePct).toBeNull(); expect(held.items[0].selected.reason).toBe('Cobertura incompleta')
    const empty = query('period=3m&quality=cutoff_reconstruction&state=no_eligible_sample')
    expect(empty.total).toBe(386); expect(empty.items.every(r => r.selected.reason === 'Sin muestra elegible observada' && r.selected.valuePct === null)).toBe(true)
    expect(query('period=3m&quality=cutoff_reconstruction&state=no_eligible_sample&minimum=0').total).toBe(0)
  })
  it('filters exact selected-period values, orders and counts before pagination', () => {
    const p = 'period=12m&quality=cutoff_reconstruction&state=number&minimum=0'
    const one = query(p), two = query(p + '&page=1&revision=' + EVIDENCE_REVISION)
    expect(one.total).toBeGreaterThan(25); expect(two.total).toBe(one.total)
    expect(new Set([...one.items, ...two.items].map(r => r.guid)).size).toBe(one.items.length + two.items.length)
    const values = [...one.items, ...two.items].map(r => r.selected.valuePct!)
    expect(values.every(v => compareDecimal(v, '0') >= 0)).toBe(true)
    for (let i = 1; i < values.length; i++) expect(compareDecimal(values[i - 1], values[i])).toBeGreaterThanOrEqual(0)
  })
  it('Next JSON and SSR use identical query result and no private evidence fields leak', async () => {
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('BE_PRIVATE_RESEARCH', '1'); vi.stubEnv('BE_PRIVATE_RESEARCH_DIR', directory!)
    const p = 'period=6m&quality=cutoff_reconstruction&state=number'
    const response = GET(new NextRequest('http://localhost/lab/bettingexpert/research/data?' + p))
    expect(response.status).toBe(200); const body = await response.json(); expect(body).toEqual(query(p))
    const html = renderToStaticMarkup(React.createElement(BEPrivateResearch, { data: body }))
    expect(html).toContain('Bettingexpert'); expect(html).toContain('sin agregado independiente'); expect(html).not.toContain('blogabet.com')
    for (const text of [JSON.stringify(body), html]) for (const forbidden of ['/tmp/', 'jsonPointer', 'source-artifacts', 'originalSourceEvidenceSha256', 'raw_base64', 'exactRowException']) expect(text).not.toContain(forbidden)
  })
  it('renders a retained NULL as reason, never 0%', () => {
    const result = query('period=12m&quality=cutoff_reconstruction&state=held&search=Intuition')
    const html = renderToStaticMarkup(React.createElement(BEPrivateResearch, { data: result }))
    expect(html).toContain('Sin dato numérico'); expect(html).toContain('Cobertura incompleta'); expect(html).not.toContain('0,00%')
  })
  it('rejects coordinated label promotions and deleted strict details even after local manifest rewrite', () => {
    const root = mkdtempSync(join(tmpdir(), 'be-lab-adversarial-'))
    try {
      cpSync(directory!, root, { recursive: true })
      const path = join(root, 'statistics547.json'), original = readFileSync(path)
      for (const promotion of ['Bnumber', 'strictNumber']) {
        const d = JSON.parse(original.toString()), w = d.profiles.flatMap((p: any) => Object.values(p.windows)).find((w: any) => w.acceptedClassLabel === 'unreconciledNumber') as any
        w.acceptedClassLabel = promotion; w.evidenceClass = promotion === 'Bnumber' ? 'terminal_global_consistent' : 'source_boundary_gate'; w.independentPeriodAggregate = true
        writeFileSync(path, JSON.stringify(d)); expect(() => loadResearchEvidence(root)).toThrow()
      }
      const d = JSON.parse(original.toString()), strict = d.profiles.flatMap((p: any) => Object.values(p.windows)).find((w: any) => w.acceptedClassLabel === 'strictNumber') as any
      for (const field of ['picks', 'profit', 'stake', 'capturedAt', 'anchorCapturedAt', 'globalCapturedAt', 'originalSourceEvidenceSha256']) delete strict[field]
      writeFileSync(path, JSON.stringify(d)); expect(() => loadResearchEvidence(root)).toThrow()
      const manifestPath = join(root, 'EVIDENCE-MANIFEST.json'), manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      manifest['statistics547.json'] = createHash('sha256').update(readFileSync(path)).digest('hex')
      writeFileSync(manifestPath, JSON.stringify(manifest)); expect(() => loadResearchEvidence(root)).toThrow(/revision/)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
