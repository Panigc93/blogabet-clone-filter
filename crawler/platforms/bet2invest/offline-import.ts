// Bet2Invest OFFLINE import simulation (preparatory). Reads captures ALREADY on disk (SSR html + months json),
// picks the bankroll, maps to a tipsters row and computes period yields. No network, no DB, no write of any kind
// except the report the caller asks for. Nothing here decides unverified semantics:
// - resets are not reconstructed: a window is computed only if it lies entirely AFTER the reset month;
// - header vs API counters are kept as two things; the only gate on months is the same ROI gate as the closing check;
// - unknown account type stays in quarantine (never assumed free).
import fs from 'fs'
import path from 'path'
import { parseProfilePage } from './parse'
import { bet2investProfileToInsert, type Bet2InvestDbMapping } from './to-db'
import { B2I_HEADER_ROI_TOLERANCE, extractBankrollBlocks, parseMonthsResponse, selectProfileIds, type Bet2InvestApiMonth } from './api-months'
import type { TipsterInsert } from '@/db/schema'

export const B2I_WINDOWS = [3, 6, 12] as const
export type B2IWindow = (typeof B2I_WINDOWS)[number]

// months/bets = coverage of the window (months WITH rows and their bets). A month without a row is absent, not zero.
// caveats keeps uncertainty that does not block a figure (e.g. lastReset null does not prove no reset happened).
export type WindowYield = { value: string | null; reason: string | null; months: number; bets: number; caveats: string[] }

const ym = (y: number, m: number) => y * 12 + (m - 1)

/**
 * Yield of the last `n` COMPLETE months before `now` (the month in progress is excluded) as sum(profit)/sum(stake).
 * Null with a reason when the evidence does not allow a safe figure. Months without rows are not zeros.
 */
export function windowYieldOrNull(
  months: Bet2InvestApiMonth[] | null,
  n: B2IWindow,
  now: Date,
  ctx: { headerRoiPct: number | null; lastReset: string | null; selected: boolean },
): WindowYield {
  const no = (reason: string): WindowYield => ({ value: null, reason, months: 0, bets: 0, caveats: [] })
  if (!ctx.selected) return no('bankroll-no-vinculado')
  if (months === null) return no('sin-serie-mensual')
  if (months.length === 0) return no('serie-mensual-vacia')
  // The series must reproduce the published ROI (same gate as the closing check) before any window is trusted.
  const stakeAll = months.reduce((a, r) => a + r.stakeUnits, 0)
  const profitAll = months.reduce((a, r) => a + r.profitUnits, 0)
  if (ctx.headerRoiPct === null || !(stakeAll > 0)) return no('sin-roi-de-cabecera-o-stake-cero')
  if (Math.abs((100 * profitAll) / stakeAll - ctx.headerRoiPct) > B2I_HEADER_ROI_TOLERANCE) return no('meses-no-reproducen-roi-de-cabecera')
  const cur = ym(now.getUTCFullYear(), now.getUTCMonth() + 1)
  const start = cur - n
  if (ctx.lastReset !== null) {
    const d = new Date(ctx.lastReset)
    if (!Number.isFinite(d.getTime())) return no('lastReset-ilegible')
    // Safe only if the whole window starts after the reset month: no bet in it can belong to the pre-reset block.
    if (start <= ym(d.getUTCFullYear(), d.getUTCMonth() + 1)) return no('ventana-solapa-reinicio-semantica-no-verificada')
  }
  const used = months.filter((m) => ym(m.year, m.month) >= start && ym(m.year, m.month) < cur)
  const stake = used.reduce((a, r) => a + r.stakeUnits, 0)
  if (used.length === 0) return no('sin-actividad-en-ventana')
  if (!(stake > 0)) return no('stake-cero-en-ventana')
  const profit = used.reduce((a, r) => a + r.profitUnits, 0)
  return {
    value: ((100 * profit) / stake).toFixed(2),
    reason: null,
    months: used.length,
    bets: used.reduce((a, r) => a + r.bets, 0),
    caveats: [ctx.lastReset === null ? 'lastReset-null-no-prueba-ausencia-de-reinicio' : 'ventana-posterior-al-reinicio', ...(used.length < n ? [`cobertura-${used.length}-de-${n}-meses`] : [])],
  }
}

export type OfflineRow =
  | { slug: string; status: 'row'; insert: TipsterInsert; windows: Record<B2IWindow, WindowYield>; basis: string }
  | { slug: string; status: 'quarantine' | 'not-selected' | 'parse-error'; reason: string }

export function buildOfflineRow(p: {
  slug: string
  html: string
  monthsJson: unknown | null
  capturedAt: Date
  surrogateId: number // simulation only: the real id comes from the transactional import route
}): OfflineRow {
  const sel = selectProfileIds(p.html)
  if (sel.status !== 'selected') return { slug: p.slug, status: 'not-selected', reason: `${sel.status}: ${sel.why}` }
  let mapping: Bet2InvestDbMapping
  let roi: number | null
  try {
    const prof = parseProfilePage(p.html)
    roi = prof.roiPct
    mapping = bet2investProfileToInsert(prof, { id: p.surrogateId, idSource: 'isolated-fixture', slug: p.slug, capturedAt: p.capturedAt })
  } catch (e) {
    return { slug: p.slug, status: 'parse-error', reason: e instanceof Error ? e.message : String(e) }
  }
  if (!mapping.ok) return { slug: p.slug, status: 'quarantine', reason: mapping.reason }
  const months = p.monthsJson === null ? null : parseMonthsResponse(p.monthsJson)
  const block = (extractBankrollBlocks(p.html) ?? []).find((b) => b.bankrollId === sel.ids.publicBankrollId)
  const ctx = { headerRoiPct: roi, lastReset: block?.lastReset ?? null, selected: true }
  const windows = Object.fromEntries(B2I_WINDOWS.map((n) => [n, windowYieldOrNull(months, n, p.capturedAt, ctx)])) as Record<B2IWindow, WindowYield>
  const insert: TipsterInsert = { ...mapping.insert, yield3m: windows[3].value, yield6m: windows[6].value, yield12m: windows[12].value }
  return { slug: p.slug, status: 'row', insert, windows, basis: sel.basis }
}

export interface OfflineReport {
  capturedAt: string
  total: number
  rows: number
  byStatus: Record<string, number>
  quarantineReasons: Record<string, number>
  windowNullReasons: Record<string, number>
  windowValues: Record<string, number>
  rowsWithAllWindows: number
}

/** Reads `<dir>/ssr/<slug>.html` and `<dir>/api/<slug>.json` if present. Read-only on `dir`. */
export function simulateImport(dir: string, capturedAt: Date): { report: OfflineReport; rows: OfflineRow[] } {
  const slugs = fs.readdirSync(path.join(dir, 'ssr')).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort()
  const rows: OfflineRow[] = []
  let id = -1
  for (const slug of slugs) {
    const html = fs.readFileSync(path.join(dir, 'ssr', `${slug}.html`), 'utf8')
    const apiPath = path.join(dir, 'api', `${slug}.json`)
    let monthsJson: unknown | null = null
    if (fs.existsSync(apiPath)) {
      try {
        monthsJson = JSON.parse(fs.readFileSync(apiPath, 'utf8'))
      } catch {
        monthsJson = null
      }
    }
    rows.push(buildOfflineRow({ slug, html, monthsJson, capturedAt, surrogateId: id-- }))
  }
  const bump = (m: Record<string, number>, k: string) => void (m[k] = (m[k] ?? 0) + 1)
  const rep: OfflineReport = { capturedAt: capturedAt.toISOString(), total: rows.length, rows: 0, byStatus: {}, quarantineReasons: {}, windowNullReasons: {}, windowValues: {}, rowsWithAllWindows: 0 }
  for (const r of rows) {
    bump(rep.byStatus, r.status)
    if (r.status === 'row') {
      rep.rows++
      let all = true
      for (const n of B2I_WINDOWS) {
        const w = r.windows[n]
        if (w.value === null) {
          all = false
          bump(rep.windowNullReasons, `${n}m:${w.reason}`)
        } else bump(rep.windowValues, `${n}m`)
      }
      if (all) rep.rowsWithAllWindows++
    } else bump(rep.quarantineReasons, r.reason.replace(/\(.*$/, '').slice(0, 80))
  }
  return { report: rep, rows }
}

// ---- Import PLAN (pure). Decides insert/update/skip per row and the validation-log entries; it executes nothing.
// The local-tested executor in execute-offline-import.ts runs this inside ONE transaction with ids from the
// internal sequence (idSource 'internal-transactional'). No production adapter or activation is provided here.
import { assertBet2InvestRealImportProvenance, planBet2InvestUpsert, type Bet2InvestIdSource, type Bet2InvestUpsertPlan } from './to-db'

export interface ValidationLogEntry {
  platform: 'bet2invest'
  slug: string
  capturedAt: string
  class: string
  reason: string
  runId: string
}

export interface ImportPlan {
  plans: { slug: string; plan: Bet2InvestUpsertPlan }[]
  log: ValidationLogEntry[]
  counts: { insert: number; update: number; skip: number; notSelected: number; parseError: number }
}

export function planOfflineImport(p: {
  rows: OfflineRow[]
  existing: Map<string, TipsterInsert> // by slug, platform 'bet2invest' only
  idSource: Bet2InvestIdSource
  allocateId: () => number // called ONLY for new rows that will be inserted
  capturedAt: Date
  runId: string
}): ImportPlan {
  const out: ImportPlan = { plans: [], log: [], counts: { insert: 0, update: 0, skip: 0, notSelected: 0, parseError: 0 } }
  const logIt = (slug: string, cls: string, reason: string) => out.log.push({ platform: 'bet2invest', slug, capturedAt: p.capturedAt.toISOString(), class: cls, reason, runId: p.runId })
  for (const r of p.rows) {
    if (r.status === 'not-selected') {
      out.counts.notSelected++
      logIt(r.slug, 'bankroll-no-vinculado', r.reason)
      continue
    }
    if (r.status === 'parse-error') {
      out.counts.parseError++
      logIt(r.slug, 'parse-error', r.reason)
      continue
    }
    if (r.status === 'quarantine') {
      const plan = planBet2InvestUpsert(p.existing.get(r.slug) ?? null, { ok: false, reason: r.reason })
      out.plans.push({ slug: r.slug, plan })
      out.counts.skip++
      logIt(r.slug, /cuarentena\[([^\]]+)\]/.exec(r.reason)?.[1] ?? 'cuarentena', r.reason)
      continue
    }
    if (r.status !== 'row') continue // unreachable: narrows the union
    assertBet2InvestRealImportProvenance(p.idSource, r.slug) // throws for isolated-fixture ids
    const existing = p.existing.get(r.slug) ?? null
    // The id is only taken for a genuinely new row; an existing row keeps its own id (mergeBet2InvestUpdate).
    const insert = existing ? r.insert : { ...r.insert, id: p.allocateId() }
    const plan = planBet2InvestUpsert(existing, { ok: true, insert })
    out.plans.push({ slug: r.slug, plan })
    if (plan.action === 'insert') out.counts.insert++
    else if (plan.action === 'update') out.counts.update++
    else {
      out.counts.skip++
      logIt(r.slug, 'frescura', plan.reason)
    }
  }
  return out
}
