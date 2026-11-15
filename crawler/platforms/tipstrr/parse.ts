// Tipstrr parser: pure functions over their HTML. NO fetcher exists for
// Tipstrr on purpose: their terms (Acceptable Use, "Last updated: 4th August
// 2018") prohibit using the site or its information with "manual or automated
// techniques to monitor or replicate the Site, or any content it contains",
// their robots.txt disallows /api, and Cloudflare challenges datacenter
// traffic. Until the owner has written permission from Tipstrr Ltd, this
// module exists to validate the architecture with FABRICATED fixtures only.

import * as cheerio from 'cheerio'

export interface TipstrrDiscoverItem {
  platform: 'tipstrr'
  slug: string
  name: string
  profileUrl: string
  sportName: string | null
  roiPct: number | null // advised-stakes basis unless the page says otherwise
  avgOdds: number | null
  avgTipsPerWeek: number | null
  winRatePct: number | null
  profitLabel: string | null // currency varies; kept as displayed
}

export interface TipstrrBreakdownRow {
  label: string
  tips: number | null
  winRatePct: number | null
  profitLabel: string | null
  roiPct: number | null
  avgOdds: number | null
}

export interface TipstrrProfileStats {
  slug: string
  sinceLabel: string | null
  stakeBasisNote: string | null // verbatim note from the page, if present
  bySport: TipstrrBreakdownRow[]
}

export class TipstrrParseError extends Error {}

function pct(text: string): number | null {
  const m = text.replace(/,/g, '').match(/(-?\d+(?:\.\d+)?)\s*%/)
  return m ? parseFloat(m[1]) : null
}

function num(text: string): number | null {
  const m = text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

// Discover/sport page cards: <a href="/tipster/<slug>"> inside list items that
// carry ROI / Avg. odds / Avg. Tips/week / Win rate / Profit definition lists.
export function parseDiscoverPage(html: string): TipstrrDiscoverItem[] {
  const $ = cheerio.load(html)
  const items: TipstrrDiscoverItem[] = []
  $('li').each((_, li) => {
    const link = $(li).find('a[href*="/tipster/"]').first()
    const href = link.attr('href') ?? ''
    const slugMatch = href.match(/\/tipster\/([a-z0-9-]+)/)
    if (!slugMatch) return
    const name = link.text().trim()
    if (!name) return

    const item: TipstrrDiscoverItem = {
      platform: 'tipstrr',
      slug: slugMatch[1],
      name,
      profileUrl: `https://tipstrr.com/tipster/${slugMatch[1]}`,
      sportName: null,
      roiPct: null,
      avgOdds: null,
      avgTipsPerWeek: null,
      winRatePct: null,
      profitLabel: null,
    }
    $(li)
      .find('dl')
      .each((__, dl) => {
        const term = $(dl).find('dt').text().trim().toLowerCase()
        const value = $(dl).find('dd').text().trim()
        if (term === 'roi') item.roiPct = pct(value)
        else if (term.startsWith('avg. odds')) item.avgOdds = num(value)
        else if (term.startsWith('avg. tips')) item.avgTipsPerWeek = num(value)
        else if (term === 'win rate') item.winRatePct = pct(value)
        else if (term === 'profit') item.profitLabel = value || null
      })
    items.push(item)
  })
  return items
}

// Profile /stats tables: rows of Label | Tips | Win rate | Profit | ROI | Avg. odds
export function parseBreakdownTable(html: string, tableHeading: string): TipstrrBreakdownRow[] {
  const $ = cheerio.load(html)
  const rows: TipstrrBreakdownRow[] = []
  $('table').each((_, table) => {
    const headers = $(table)
      .find('th')
      .map((__, th) => $(th).text().trim().toLowerCase())
      .get()
    if (!headers.some((h) => h.startsWith(tableHeading.toLowerCase()))) return
    if (!headers.includes('roi') || !headers.some((h) => h.startsWith('tips'))) return
    $(table)
      .find('tr')
      .each((__, tr) => {
        const cells = $(tr)
          .find('td, th[scope="row"]')
          .map((___, c) => $(c).text().trim())
          .get()
        if (cells.length < 6 || cells[0].toLowerCase() === tableHeading.toLowerCase()) return
        rows.push({
          label: cells[0],
          tips: num(cells[1]),
          winRatePct: pct(cells[2]),
          profitLabel: cells[3] || null,
          roiPct: pct(cells[4]),
          avgOdds: num(cells[5]),
        })
      })
  })
  return rows
}
