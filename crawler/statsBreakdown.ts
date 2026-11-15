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

export interface BreakdownRow {
  key: string          // categories: "Football-Spa. Primera"; otros: etiqueta visible
  sport?: string       // solo categories
  category?: string    // solo categories (liga/competicion)
  picks: number
  winRate: number | null   // %
  profit: number | null    // unidades
  yieldPct: number | null  // %
  oddsAvg: number | null
  stakeAvg: number | null
}

export type StatsBreakdown = Partial<Record<BreakdownSection, BreakdownRow[]>>

function num(text: string): number | null {
  const t = text.replace(/\u00a0/g, ' ').replace(/[+%\s]/g, '').replace(',', '.')
  if (t === '' || t === '—' || t === '-') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function clean(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

// scope: '#alltimeStatsTab' (por defecto), '#paidStatsTab', o '' si la pagina no usa pestanas.
export function parseStatsBreakdown(html: string, scope = '#alltimeStatsTab'): StatsBreakdown {
  const $ = cheerio.load(html)
  const root = scope && $(scope).length > 0 ? $(scope) : $.root()
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
          row.sport = key.slice(0, dash)
          row.category = key.slice(dash + 1)
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
    return { scope, key: r.key, picks: r.picks, yieldPct: r.yieldPct, sampleOk, yieldOk, muestraYYieldCumplen: sampleOk && yieldOk }
  }
  return [
    ...(b.sports ?? []).map(r => mk('sport', r)),
    ...(b.categories ?? []).map(r => mk('category', r)),
  ]
}

// Antelacion publicada: tramo con mas picks. Distribucion historica autodeclarada.
export function dominantLeadBucket(b: StatsBreakdown): { bucket: string; sharePct: number } | null {
  const rows = b.hours_to_event
  if (!rows || rows.length === 0) return null
  const total = rows.reduce((s, r) => s + r.picks, 0)
  if (total === 0) return null
  const top = rows.reduce((a, r) => (r.picks > a.picks ? r : a))
  return { bucket: top.key, sharePct: Math.round((top.picks / total) * 1000) / 10 }
}
