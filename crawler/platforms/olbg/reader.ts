// Offline-only OLBG adapter. No networking, database imports or side effects.
// Source ROI and LSP are independent series. Neither is silently recomputed.
import { createHash } from 'node:crypto'

export interface OlbgSource {
  url: string
  capturedAt: string
  httpDate: string | null
  sha256: string
  bytes: number
}
export interface OlbgMetric {
  tips: number
  levelStakeProfit: number
  competitionProfit: number
  roiPct: number | null
  strikePct: number | null
}
export interface OlbgMonth extends OlbgMetric {
  month: string
  currentMonth: boolean
}
export interface OlbgTable extends OlbgMetric {
  name: string
  // A named competition can overlap with a sport's All Tips table.
  scope: 'sport-all-tips' | 'competition'
  closedMonths: 6 | 12
  fromMonth: string
  throughMonth: string
}
export interface OlbgPerformance {
  platform: 'olbg'
  profileId: number
  username: string
  profileUrl: string
  source: OlbgSource
  months: OlbgMonth[]
  tables: OlbgTable[]
  globalYieldPct: null
  allTime: null
}
export interface OlbgDiscovery {
  id: number
  username: string
  tableId: number
  view: 1 | 6 | 12
  month: string
  source: OlbgSource
}

type Obj = Record<string, unknown>
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function object(x: unknown): Obj {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error('Expected object')
  return x as Obj
}
function text(x: unknown): string {
  if (typeof x !== 'string' || !x.trim() || x.length > 300) throw new Error('Expected bounded text')
  return x.trim()
}
function id(x: unknown): number {
  if (typeof x !== 'number' || !Number.isSafeInteger(x) || x <= 0) throw new Error('Invalid numeric identity')
  return x
}
function number(x: unknown, integer = false): number {
  if (typeof x === 'number') {
    if (!Number.isFinite(x) || (integer && !Number.isSafeInteger(x))) throw new Error('Invalid number')
    return x
  }
  if (typeof x !== 'string' || !/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(x)) throw new Error('Invalid number')
  const n = Number(x.replaceAll(',', '').replace(/%$/, ''))
  if (!Number.isFinite(n) || (integer && !Number.isSafeInteger(n))) throw new Error('Invalid number')
  return n
}
function percent(x: unknown, strike = false): number | null {
  if (x === null || x === undefined || x === '-' || x === '') return null
  const n = number(typeof x === 'string' ? x.replace(/%$/, '') : x)
  if ((strike && (n < 0 || n > 100)) || Math.abs(n) > 1_000_000) throw new Error('Invalid percent')
  return n
}
function metric(x: unknown): OlbgMetric {
  const row = object(x)
  const tips = number(row.tips, true)
  if (tips < 0) throw new Error('Negative tips')
  return {
    tips, levelStakeProfit: number(row.lsp), competitionProfit: number(row.profit),
    // Source zero percentages on empty samples are undefined, not proof of 0%.
    roiPct: tips === 0 ? null : percent(row.roi),
    strikePct: tips === 0 ? null : percent(row.strike, true),
  }
}
function array(x: unknown, max = 500): unknown[] {
  if (!Array.isArray(x) || x.length > max) throw new Error('Expected bounded array')
  return x
}
function utcMonth(d: Date): string { return d.toISOString().slice(0, 7) }
function shiftMonth(anchor: string, delta: number): string {
  const d = new Date(anchor + '-01T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + delta)
  return utcMonth(d)
}
function captureMonth(source: OlbgSource): string {
  if (!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(source.capturedAt)) throw new Error('Explicit capture timezone required')
  const d = new Date(source.capturedAt)
  if (!Number.isFinite(d.getTime())) throw new Error('Invalid capturedAt')
  return utcMonth(d)
}
function parseMonth(value: unknown): string {
  const m = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})$/.exec(text(value))
  if (!m) throw new Error('Unknown month label')
  return `${m[2]}-${String(months.indexOf(m[1]) + 1).padStart(2, '0')}`
}
function sourceUrl(source: OlbgSource): URL {
  const u = new URL(source.url)
  if (u.origin !== 'https://www.olbg.com' || u.username || u.password || u.hash) throw new Error('Untrusted source URL')
  if (!/^[a-f0-9]{64}$/.test(source.sha256) || !Number.isSafeInteger(source.bytes) || source.bytes <= 0) throw new Error('Invalid capture receipt')
  captureMonth(source)
  return u
}

// Decode a public Svelte data node as data only. Never eval page scripts.
// Resolve only requested fields: incidental account/prize/avatar metadata is omitted.
export function readOlbgNodeField(node: unknown, field: string): unknown {
  const a = array(object(node).data, 20_000)
  const root = object(a[0])
  if (!(field in root)) return undefined
  const active = new Set<number>()
  let budget = 30_000
  function resolve(ref: unknown, depth = 0): unknown {
    if (--budget < 0 || depth > 30 || !Number.isInteger(ref)) throw new Error('Malformed reference graph')
    const i = ref as number
    if (i === -1) return undefined
    if (i < 0 || i >= a.length || active.has(i)) throw new Error('Invalid or cyclic reference')
    const value = a[i]
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
    active.add(i)
    let out: unknown
    if (Array.isArray(value)) {
      // Svelte special tags (Date, Set, Map, etc.) are deliberately not executable.
      if (typeof value[0] === 'string') throw new Error('Unsupported tagged value')
      out = value.map(v => resolve(v, depth + 1))
    } else {
      const result: Obj = Object.create(null)
      for (const [key, refValue] of Object.entries(object(value))) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe property')
        result[key] = resolve(refValue, depth + 1)
      }
      out = result
    }
    active.delete(i)
    return out
  }
  return resolve(root[field])
}

export function makeOlbgSource(raw: string, url: string, capturedAt: string, httpDate: string | null = null): OlbgSource {
  if (Buffer.byteLength(raw) > 2 * 1024 * 1024) throw new Error('Capture exceeds 2 MiB')
  const source = { url, capturedAt, httpDate, sha256: createHash('sha256').update(raw).digest('hex'), bytes: Buffer.byteLength(raw) }
  sourceUrl(source)
  return source
}

export function parseOlbgPerformance(node: unknown, source: OlbgSource, expectedId: number, anchorMonth: string): OlbgPerformance {
  id(expectedId)
  const u = sourceUrl(source)
  const path = /^\/tipsters\/performance\/(month|table)\/(\d+)(?:\/__data\.json)?$/.exec(u.pathname)
  if (!path || Number(path[2]) !== expectedId) throw new Error('Profile URL mismatch')
  const get = (key: string) => readOlbgNodeField(node, key)
  if (id(get('effectiveTipsterId')) !== expectedId || get('mode') !== path[1]) throw new Error('Profile identity or mode mismatch')
  const username = text(get('tipsterUsername'))
  // Anchor comes from the contemporaneous source directory monthYear, not the
  // machine clock or a guess about OLBG's calendar timezone.
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(anchorMonth)) throw new Error('Source period anchor required')
  const anchor = anchorMonth
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  if (!array(get('sportPeriodOptions')).map(object).some(x => x.id === 0 && x.label === monthNames[Number(anchor.slice(5)) - 1])) throw new Error('Current period label mismatch')
  const out: OlbgPerformance = { platform: 'olbg', profileId: expectedId, username,
    profileUrl: `https://www.olbg.com/tipsters/about/${expectedId}`, source,
    months: [], tables: [], globalYieldPct: null, allTime: null }
  const seen = new Set<string>()
  if (path[1] === 'month') {
    if (get('monthFilterSelected') !== 60 || (u.searchParams.has('sp') && u.searchParams.get('sp') !== '60')) throw new Error('Not global All Tips')
    for (const raw of array(get('monthRows'), 120)) {
      const row = object(raw)
      const month = parseMonth(row.date)
      if (seen.has(month) || month > anchor) throw new Error('Duplicate or future month')
      seen.add(month)
      out.months.push({ ...metric(row), month, currentMonth: month === anchor })
    }
    out.months.sort((a, b) => b.month.localeCompare(a.month))
  } else {
    const period = get('sportPeriodSelected')
    if ((period !== 1 && period !== 2) || u.searchParams.get('p') !== String(period)) throw new Error('Explicit closed period required')
    const closedMonths = period === 1 ? 6 : 12
    const options = array(get('sportPeriodOptions')).map(object)
    const expectedLabel = period === 1 ? 'Previous Six Months' : 'Previous Twelve Months'
    if (!options.some(x => x.id === period && x.label === expectedLabel)) throw new Error('Period label changed')
    for (const raw of array(get('sportRows'))) {
      const row = object(raw)
      const name = text(row.tableName)
      if (seen.has(name)) throw new Error('Duplicate competition')
      seen.add(name)
      out.tables.push({ ...metric(row), name, scope: name.endsWith(' All Tips') ? 'sport-all-tips' : 'competition',
        closedMonths, fromMonth: shiftMonth(anchor, -closedMonths), throughMonth: shiftMonth(anchor, -1) })
    }
  }
  return out
}

export function parseOlbgDiscovery(body: unknown, source: OlbgSource): OlbgDiscovery[] {
  const u = sourceUrl(source)
  if (u.pathname !== '/tipsters/tables/data') throw new Error('Not a directory capture')
  const data = object(body)
  const tableId = id(data.tableId)
  const view = data.crtView
  if (data.tableType !== 't' || ![1, 6, 12].includes(view as number)) throw new Error('Not an All Tips table/view')
  if (u.searchParams.get('id') !== `t-${tableId}` || u.searchParams.get('v') !== String(view)) throw new Error('Directory scope mismatch')
  if (typeof data.monthYear !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(data.monthYear)) throw new Error('Missing directory month')
  const requestedMonth = u.searchParams.get('m')
  if (requestedMonth && data.monthYear !== requestedMonth) throw new Error('Directory month mismatch')
  if (!requestedMonth && data.monthYear !== captureMonth(source)) throw new Error('Stale directory anchor')
  if (data.pageReady !== true) throw new Error('Directory still loading')
  const seen = new Set<number>()
  return array(data.monthApplied ? data.pastTables : data.currentTables, 1000).map(raw => {
    const row = object(raw)
    const profileId = id(row.id)
    if (seen.has(profileId)) throw new Error('Duplicate directory identity')
    seen.add(profileId)
    return { id: profileId, username: text(row.tipster), tableId, view: view as 1 | 6 | 12, month: data.monthYear as string, source }
  })
}

export function mergeOlbgDiscovery(captures: OlbgDiscovery[][]): { id: number; usernames: string[]; appearances: OlbgDiscovery[] }[] {
  const found = new Map<number, { id: number; usernames: string[]; appearances: OlbgDiscovery[] }>()
  for (const entry of captures.flat()) {
    const item = found.get(entry.id) ?? { id: entry.id, usernames: [], appearances: [] }
    if (!item.usernames.includes(entry.username)) item.usernames.push(entry.username)
    item.appearances.push(entry)
    found.set(entry.id, item)
  }
  return Array.from(found.values()).sort((a, b) => a.id - b.id)
}
