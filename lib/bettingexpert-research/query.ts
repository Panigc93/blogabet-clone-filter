import { loadPrivateResearch, EVIDENCE_REVISION } from './evidence'
import type { BEEvidenceClass, BEPeriod, BEWindowResearch } from './contract'

export const QUALITY_LABELS: Record<BEEvidenceClass, string> = {
  source_boundary_gate: 'Límites de fuente',
  source_boundary_experimental: 'Límites de fuente, experimental',
  terminal_global_consistent: 'Historial terminal, consistente con Global',
  cutoff_reconstruction: 'Historial observado, sin agregado independiente',
  held: 'Retenido por gates anteriores',
}
export type ResearchState = 'all' | 'number' | 'no_eligible_sample' | 'held'
export interface ResearchParams {
  period: BEPeriod; quality: BEEvidenceClass; state: ResearchState
  search: string; minimum: string | null; sort: 'yield' | 'name'; page: number
  revision: string | null
}
export class ResearchInputError extends Error {}
const decimal = /^-?\d{1,12}(?:\.\d{1,28})?$/
export function parseResearchParams(p: URLSearchParams): ResearchParams {
  const period = p.get('period') ?? '12m', quality = p.get('quality') ?? 'source_boundary_gate'
  const state = p.get('state') ?? 'all', sort = p.get('sort') ?? 'yield'
  const page = p.get('page') ?? '0', minimum = p.get('minimum') || null
  if (!['3m', '6m', '12m'].includes(period) || !Object.prototype.hasOwnProperty.call(QUALITY_LABELS, quality) || !['all', 'number', 'no_eligible_sample', 'held'].includes(state) || !['yield', 'name'].includes(sort) || !/^\d{1,3}$/.test(page) || Number(page) > 100 || (minimum !== null && !decimal.test(minimum))) throw new ResearchInputError('Filtros no válidos')
  const revision = p.get('revision')
  if ((revision && revision !== EVIDENCE_REVISION) || (Number(page) > 0 && revision !== EVIDENCE_REVISION)) throw new ResearchInputError('La revisión cambió. Vuelve a la primera página.')
  return { period: period as BEPeriod, quality: quality as BEEvidenceClass, state: state as ResearchState, sort: sort as ResearchParams['sort'], page: Number(page), minimum, search: (p.get('search') ?? '').slice(0, 100), revision }
}
// Exact finite decimal comparison, no float conversion for filtering/ordering.
function scaled(value: string) {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw Error('Invalid bound decimal')
  const negative = value.startsWith('-'), [whole, fraction = ''] = value.replace('-', '').split('.')
  return { n: BigInt(whole + fraction) * BigInt(negative ? -1 : 1), scale: fraction.length }
}
export function compareDecimal(a: string, b: string) {
  const x = scaled(a), y = scaled(b), scale = Math.max(x.scale, y.scale)
  const power = (n: number) => BigInt('1' + '0'.repeat(n))
  const left = x.n * power(scale - x.scale), right = y.n * power(scale - y.scale)
  return left < right ? -1 : left > right ? 1 : 0
}
const reasons: Record<string, string> = {
  incomplete_coverage_or_cap: 'Cobertura incompleta', unverified_status: 'Estado fuente sin resolver',
  unverified_settlement_pattern: 'Patrón aritmético pendiente', no_closed_sample: 'Sin muestra elegible observada',
  verified_no_closed_sample: 'Sin muestra elegible observada', missing_or_wrong_anchor_identity: 'Falta identidad en los límites de fuente',
  prior_gate_hold: 'Retenido por validación anterior',
}
function view(w: BEWindowResearch) {
  return { period: w.period, state: w.state, valuePct: w.yieldPct, picks: w.picks, profit: w.profit, stake: w.stake,
    startUtc: w.startUtc, endExclusiveUtc: w.endExclusiveUtc, quality: w.evidenceClass,
    qualityLabel: QUALITY_LABELS[w.evidenceClass], reasonCode: w.reason ?? null, reason: w.state === 'no_eligible_sample' ? 'Sin muestra elegible observada' : w.state === 'held' ? reasons[w.reason ?? ''] ?? 'Pendiente de validación de fuente' : null,
    productionReady: false as const }
}
/** Shared SSR and private JSON query. Only fixed bound evidence can enter. */
export function queryPrivateResearch(params: URLSearchParams, env: NodeJS.ProcessEnv = process.env) {
  const q = parseResearchParams(params), dataset = loadPrivateResearch(env)
  const selected = dataset.profiles.filter(r => {
    const w = r.windows[q.period]
    return w.evidenceClass === q.quality && (q.state === 'all' || w.state === q.state)
      && r.username.toLocaleLowerCase('es').includes(q.search.toLocaleLowerCase('es'))
      && (q.minimum === null || (w.yieldPct !== null && compareDecimal(w.yieldPct, q.minimum) >= 0))
  })
  selected.sort((a, b) => {
    if (q.sort === 'yield') {
      const x = a.windows[q.period].yieldPct, y = b.windows[q.period].yieldPct
      if (x === null && y !== null) return 1
      if (x !== null && y === null) return -1
      if (x !== null && y !== null) { const cmp = compareDecimal(y, x); if (cmp) return cmp }
    }
    return a.username.localeCompare(b.username, 'es') || a.sourceGuid.localeCompare(b.sourceGuid)
  })
  const start = q.page * 25
  return { revision: EVIDENCE_REVISION, query: q, total: selected.length, pageSize: 25, productionReady: false as const,
    hasMore: start + 25 < selected.length,
    items: selected.slice(start, start + 25).map(r => ({ platform: 'bettingexpert' as const, username: r.username,
      guid: r.sourceGuid, selected: view(r.windows[q.period]),
      windows: (['3m', '6m', '12m'] as BEPeriod[]).map(n => view(r.windows[n])),
      annualWarning: r.incompleteAnnualWarning ? 'El anual incompleto conserva observaciones de half-loss sin ampliar su autorización.' : null })) }
}
export type ResearchPage = ReturnType<typeof queryPrivateResearch>
