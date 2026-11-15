// Lector de los desgloses publicos de /blog/stats (categorias/ligas, casas,
// cuotas, antelacion...). Funcion pura: no toca base de datos ni red.
//
// Que son estos datos: cifras que Blogabet publica por tipster (autograduadas
// salvo blogs verificados). Una categoria es "Deporte-Liga". No prueban liquidez,
// cuota disponible ni que el pick pudiera seguirse a tiempo: "hours_to_event" es
// la distribucion historica de antelacion, no prueba de recepcion a tiempo.
import * as cheerio from 'cheerio'

export type BreakdownSection =
  | 'sports' | 'categories' | 'pick_types' | 'stakes' | 'bookies'
  | 'odds_range' | 'hour_of_the_day' | 'hours_to_event'

export const BREAKDOWN_SECTIONS: BreakdownSection[] = [
  'sports', 'categories', 'pick_types', 'stakes', 'bookies',
  'odds_range', 'hour_of_the_day', 'hours_to_event',
]

// Clasificacion de una categoria de Blogabet. La categoria original se conserva
// siempre en key. 'unclassified' = puede ser competicion, pais o region: no se
// sabe sin verificar, y no se etiqueta como liga.
export type CategoryKind = 'live_aggregate' | 'combo_aggregate' | 'unclassified'

export interface BreakdownRow {
  key: string          // categories: "Football-Spa. Primera"; otros: etiqueta visible
  sport?: string       // solo categories
  category?: string    // solo categories: segunda parte tal cual (competicion, pais o agregado)
  categoryKind?: CategoryKind  // solo categories
  picks: number
  winRate: number | null   // %
  profit: number | null    // unidades
  yieldPct: number | null  // %
  oddsAvg: number | null
  stakeAvg: number | null
}

export type StatsBreakdown = Partial<Record<BreakdownSection, BreakdownRow[]>>

// "Livebet" y "Combo pick" son agregados por tipo de apuesta, no competiciones.
export function classifyCategory(sport: string, category: string): CategoryKind {
  const c = category.replace(/\s+/g, '').toLowerCase()
  if (c === 'livebet') return 'live_aggregate'
  if (c === 'combopick' || sport.replace(/\s+/g, '').toLowerCase() === 'combopick') return 'combo_aggregate'
  return 'unclassified'
}

function num(text: string): number | null {
  const t = text.replace(/\u00a0/g, ' ').replace(/[+%\s]/g, '').replace(',', '.')
  if (t === '' || t === '—' || t === '-') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function clean(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

// Pestanas de la pagina /blog/stats. Cada una es un conjunto de picks distinto
// (alltime = todos; paid = solo picks de pago; private = solo privados). Nunca se
// suman entre si y no hay lectura "de toda la pagina": hay que elegir una.
export type StatsTab = 'alltime' | 'paid' | 'private'
const TAB_SELECTOR: Record<StatsTab, string> = {
  alltime: '#alltimeStatsTab',
  paid: '#paidStatsTab',
  private: '#privateStatsTab',
}

export function availableStatsTabs(html: string): StatsTab[] {
  const $ = cheerio.load(html)
  return (Object.keys(TAB_SELECTOR) as StatsTab[]).filter(t => $(TAB_SELECTOR[t]).length > 0)
}

// Devuelve null si la pestana no existe en la pagina (no hay datos, no ceros).
// Un tab sin secciones reconocibles devuelve {} con la pestana presente.
export function parseStatsBreakdown(html: string, tab: StatsTab): StatsBreakdown | null {
  const $ = cheerio.load(html)
  const sel = TAB_SELECTOR[tab]
  if (!sel || $(sel).length === 0) return null
  const root = $(sel)
  const out: StatsBreakdown = {}

  for (const section of BREAKDOWN_SECTIONS) {
    const rows: BreakdownRow[] = []
    root.find(`[data-stats="${section}"] tbody tr`).each((_, tr) => {
      const tds = $(tr).find('td')
      if (tds.length < 7) return
      const metrics = tds.slice(tds.length - 6).map((_, td) => clean($(td).text())).get()
      const picks = parseInt(metrics[0], 10)
      if (!Number.isFinite(picks) || picks <= 0) return

      const labelCells = tds.slice(0, tds.length - 6)
      let key = ''
      if (section === 'categories') {
        key = clean($(labelCells[0]).find('.hidden').first().text())
      }
      if (!key) {
        // etiqueta visible: ultima celda de texto no vacia sin el indice oculto
        const parts = labelCells.map((_, td) => {
          const c = $(td).clone()
          if (section !== 'categories') c.find('.hidden').remove()
          return clean(c.text())
        }).get().filter(p => p !== '' && !/^\d+$/.test(p))
        key = parts[parts.length - 1] ?? ''
      }
      if (!key) return

      const row: BreakdownRow = {
        key,
        picks,
        winRate: num(metrics[1]),
        profit: num(metrics[2]),
        yieldPct: num(metrics[3]),
        oddsAvg: num(metrics[4]),
        stakeAvg: num(metrics[5]),
      }
      if (section === 'categories') {
        const dash = key.indexOf('-')
        if (dash > 0) {
          row.sport = key.slice(0, dash).trim()
          row.category = key.slice(dash + 1).trim()
          row.categoryKind = classifyCategory(row.sport, row.category)
        }
      }
      rows.push(row)
    })
    if (rows.length > 0) out[section] = rows
  }
  return out
}

// Elegibilidad estadistica por ambito (Muestra y Yield del metodo MYS).
// Cada categoria se evalua SOLO con sus propios picks: nunca se suman ligas
// pequenas para llegar a 100. Un ambito deporte es una fila aparte ('sports').
// Esto NO acredita seguibilidad ni cumplimiento completo de MYS.
export const MYS_SCOPE_MIN_PICKS = 100
export const MYS_SCOPE_MIN_YIELD = 11

export interface ScopeCheck {
  scope: 'sport' | 'category'
  key: string
  // 'live_aggregate' / 'combo_aggregate': agregado por tipo de apuesta, no acredita ninguna
  // competicion concreta. 'unclassified': categoria original, competicion o pais sin verificar.
  categoryKind?: CategoryKind
  picks: number
  yieldPct: number | null
  sampleOk: boolean
  yieldOk: boolean
  muestraYYieldCumplen: boolean
}

export function checkMuestraYield(b: StatsBreakdown): ScopeCheck[] {
  const mk = (scope: 'sport' | 'category', r: BreakdownRow): ScopeCheck => {
    const sampleOk = r.picks >= MYS_SCOPE_MIN_PICKS
    const yieldOk = r.yieldPct !== null && r.yieldPct >= MYS_SCOPE_MIN_YIELD
    return { scope, key: r.key, categoryKind: r.categoryKind, picks: r.picks, yieldPct: r.yieldPct, sampleOk, yieldOk, muestraYYieldCumplen: sampleOk && yieldOk }
  }
  return [
    ...(b.sports ?? []).map(r => mk('sport', r)),
    ...(b.categories ?? []).map(r => mk('category', r)),
  ]
}

// Antelacion publicada: tramo con mas picks (puede ser LIVE). Distribucion historica autodeclarada.
export function dominantLeadBucket(b: StatsBreakdown): { bucket: string; sharePct: number } | null {
  const rows = b.hours_to_event
  if (!rows || rows.length === 0) return null
  const total = rows.reduce((s, r) => s + r.picks, 0)
  if (total === 0) return null
  const top = rows.reduce((a, r) => (r.picks > a.picks ? r : a))
  return { bucket: top.key, sharePct: Math.round((top.picks / total) * 1000) / 10 }
}

// Parte de picks publicada como LIVE, con numerador y denominador de la MISMA
// pestana. null si la pagina no trae la seccion hours_to_event (no se rellena con 0).
// Distribucion historica autodeclarada: no dice nada de ejecucion ni se puede cruzar
// con ligas (no hay cruce liga x LIVE en estos datos, solo dos marginales).
export interface LiveShare { livePicks: number; totalPicks: number; pct: number }
export function liveShare(b: StatsBreakdown): LiveShare | null {
  const rows = b.hours_to_event
  if (!rows || rows.length === 0) return null
  const totalPicks = rows.reduce((s, r) => s + r.picks, 0)
  if (totalPicks === 0) return null
  const livePicks = rows.filter(r => r.key.trim().toUpperCase() === 'LIVE').reduce((s, r) => s + r.picks, 0)
  return { livePicks, totalPicks, pct: Math.round((livePicks / totalPicks) * 1000) / 10 }
}

// Cuadre de totales dentro de una pestana: suma de sports vs suma de categories vs
// suma de hours_to_event. Si difieren, los denominadores no son intercambiables.
export interface Reconcile {
  sportsPicks: number | null
  categoriesPicks: number | null
  hoursToEventPicks: number | null
  consistent: boolean | null   // null si falta alguna seccion
}
export function reconcileTotals(b: StatsBreakdown): Reconcile {
  const sum = (r?: BreakdownRow[]) => (r && r.length > 0 ? r.reduce((s, x) => s + x.picks, 0) : null)
  const sportsPicks = sum(b.sports), categoriesPicks = sum(b.categories), hoursToEventPicks = sum(b.hours_to_event)
  const vals = [sportsPicks, categoriesPicks, hoursToEventPicks]
  const consistent = vals.some(v => v === null) ? null : new Set(vals).size === 1
  return { sportsPicks, categoriesPicks, hoursToEventPicks, consistent }
}
