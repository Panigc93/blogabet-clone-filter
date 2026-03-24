import * as cheerio from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { tipsters } from '../db/schema'
import { sql, gt, and, gte, lt, or, isNull } from 'drizzle-orm'
import { readFileSync, writeFileSync, existsSync } from 'fs'

// Load .env.local if vars aren't already set (avoids shell $ expansion issues)
const envPath = new URL('../.env.local', import.meta.url).pathname
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const eq = line.indexOf('=')
    if (eq > 0 && !line.startsWith('#')) {
      const key = line.slice(0, eq).trim()
      const val = line.slice(eq + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  }
}

// ─── Parser ──────────────────────────────────────────────────────────────────

interface MonthRow {
  ts: number   // Unix epoch (month start)
  picks: number
  yieldPct: number  // col[4]: yield% (e.g. 83 for "+83%") — more accurate than rounded profit
  stakeAvg: number
}

interface StatsResult {
  picks6mAvg: string | null
  yield3m: string | null
  yield6m: string | null
  yield12m: string | null
  picksFree3mAvg: string | null
  yieldFree3m: string | null
}

function parseArchiveTab($: CheerioAPI, scope: string): MonthRow[] {
  const rows: MonthRow[] = []

  $(`${scope} [data-stats="archive"] tbody tr`).each((_, tr) => {
    const tds = $(tr).find('td')
    if (tds.length < 7) return

    // Col 0: hidden span has Unix timestamp
    const tsText = $(tds[0]).find('.hidden').text().trim()
    const ts = parseInt(tsText, 10)
    if (isNaN(ts) || ts <= 0) return

    // Col 1: picks
    const picks = parseInt($(tds[1]).text().trim(), 10)
    if (isNaN(picks) || picks <= 0) return

    // Col 4: yield% (e.g. "+83%" or "-24%") — use this instead of col[3] profit (which is rounded)
    const yieldText = $(tds[4]).find('span').text().trim().replace(/[+%,\s]/g, '')
    const yieldPct = parseFloat(yieldText)
    if (isNaN(yieldPct)) return

    // Col 6: stake avg (e.g. "1.12")
    const stakeText = $(tds[6]).find('span').text().trim().replace(',', '.')
    const stakeAvg = parseFloat(stakeText)
    if (isNaN(stakeAvg) || stakeAvg <= 0) return

    rows.push({ ts, picks, yieldPct, stakeAvg })
  })

  rows.sort((a, b) => b.ts - a.ts)
  return rows
}

function computeYield(monthRows: MonthRow[]): string | null {
  if (monthRows.length === 0) return null
  // Reconstruct profit from yieldPct to avoid integer rounding errors in col[3]
  const totalProfit = monthRows.reduce((s, r) => s + (r.yieldPct / 100) * r.picks * r.stakeAvg, 0)
  const totalStakes = monthRows.reduce((s, r) => s + r.picks * r.stakeAvg, 0)
  if (totalStakes === 0) return null
  return (totalProfit / totalStakes * 100).toFixed(2)
}

export function parseStatsHtml(html: string): StatsResult | null {
  const $ = cheerio.load(html)

  // Scope to #alltimeStatsTab for paid tipsters; fall back to unscoped for free tipsters
  let alltimeRows = parseArchiveTab($, '#alltimeStatsTab')
  if (alltimeRows.length === 0) {
    alltimeRows = parseArchiveTab($, '')  // free tipster: no tab wrapper
  }
  if (alltimeRows.length === 0) return null

  // Only use closed months (exclude current in-progress month)
  const now = new Date()
  const currentMonthTs = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000)
  const closedRows = alltimeRows.filter(r => r.ts < currentMonthTs)

  // Filter by real calendar windows, not just "last N rows" (which would pick old inactive months)
  const cutoff3m  = Math.floor(new Date(now.getFullYear(), now.getMonth() - 3,  1).getTime() / 1000)
  const cutoff6m  = Math.floor(new Date(now.getFullYear(), now.getMonth() - 6,  1).getTime() / 1000)
  const cutoff12m = Math.floor(new Date(now.getFullYear(), now.getMonth() - 12, 1).getTime() / 1000)

  const last3  = closedRows.filter(r => r.ts >= cutoff3m)
  const last6  = closedRows.filter(r => r.ts >= cutoff6m)
  const last12 = closedRows.filter(r => r.ts >= cutoff12m)

  const picks6mAvg = last6.length > 0
    ? (last6.reduce((s, r) => s + r.picks, 0) / last6.length).toFixed(2)
    : null

  // Free picks stats: alltime - paid (only for paid tipsters with a paid tab)
  let picksFree3mAvg: string | null = null
  let yieldFree3m: string | null = null

  const paidRows = parseArchiveTab($, '#paidStatsTab')
  if (paidRows.length > 0) {
    const closedPaidRows = paidRows.filter(r => r.ts < currentMonthTs)
    const paidMap = new Map(closedPaidRows.map(r => [r.ts, r]))

    // Build free rows for the last 3 closed alltime months
    const freeRows = last3.map(a => {
      const p = paidMap.get(a.ts)
      const freePickCount   = p ? a.picks - p.picks : a.picks
      const alltimeProfit   = (a.yieldPct / 100) * a.picks * a.stakeAvg
      const paidProfit      = p ? (p.yieldPct / 100) * p.picks * p.stakeAvg : 0
      const freeProfit      = alltimeProfit - paidProfit
      const freeStakes      = p
        ? a.picks * a.stakeAvg - p.picks * p.stakeAvg
        : a.picks * a.stakeAvg
      return { picks: freePickCount, profit: freeProfit, stakes: freeStakes }
    }).filter(r => r.picks > 0)

    if (freeRows.length > 0) {
      picksFree3mAvg = (freeRows.reduce((s, r) => s + r.picks, 0) / freeRows.length).toFixed(2)
      const totalFreeStakes = freeRows.reduce((s, r) => s + r.stakes, 0)
      if (totalFreeStakes > 0) {
        yieldFree3m = (freeRows.reduce((s, r) => s + r.profit, 0) / totalFreeStakes * 100).toFixed(2)
      }
    }
  }

  return {
    picks6mAvg,
    yield3m:  computeYield(last3),
    yield6m:  computeYield(last6),
    yield12m: computeYield(last12),
    picksFree3mAvg,
    yieldFree3m,
  }
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

function statsUrl(slug: string): string {
  return `https://${slug}.blogabet.com/blog/stats?_=${Date.now()}`
}

const STATS_HEADERS = {
  'accept': '*/*',
  'accept-language': 'en,es-ES;q=0.9,es;q=0.8',
  'cache-control': 'no-cache',
  'pragma': 'no-cache',
  'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Linux"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  'x-requested-with': 'XMLHttpRequest',  // required — endpoint is XHR-only
}

async function fetchStats(slug: string, cookie: string): Promise<string> {
  const res = await fetch(statsUrl(slug), {
    headers: { ...STATS_HEADERS, 'referer': `https://${slug}.blogabet.com/blog`, 'Cookie': cookie },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return res.text()
}

// ─── Retry ────────────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxAttempts) throw err
      const wait = attempt * 2000
      console.warn(`${label} failed (attempt ${attempt}/${maxAttempts}), retrying in ${wait / 1000}s... ${(err as Error).message}`)
      await new Promise(r => setTimeout(r, wait))
    }
  }
  throw new Error('unreachable')
}

// ─── Checkpoint ───────────────────────────────────────────────────────────────

const CHECKPOINT_PATH = './crawler/.checkpoint-stats'

function readCheckpoint(): { offset: number; done: number; errors: number } {
  if (!existsSync(CHECKPOINT_PATH)) return { offset: 0, done: 0, errors: 0 }
  try {
    return JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf8'))
  } catch {
    return { offset: 0, done: 0, errors: 0 }
  }
}

function saveCheckpoint(offset: number, done: number, errors: number) {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify({ offset, done, errors }))
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function crawlStats() {
  const cookie = process.env.BLOGABET_COOKIE
  if (!cookie) throw new Error('BLOGABET_COOKIE is not set')

  const dbUrl = process.env.DATABASE_URL_DIRECT
  if (!dbUrl) throw new Error('DATABASE_URL_DIRECT is not set')

  const minPicks = Number(process.env.MIN_PICKS ?? '0')
  const db = drizzle(neon(dbUrl), { schema: { tipsters } })

  // Crawl all tipsters active in the last month
  const oneMonthAgo = new Date()
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

  const conditions = [
    gte(tipsters.lastPickAt, oneMonthAgo),
    ...(minPicks > 0 ? [gt(tipsters.picks, minPicks)] : []),
  ]

  console.log(`Loading active tipsters from DB (minPicks=${minPicks})...`)
  const allTipsters = await db.select({ id: tipsters.id, slug: tipsters.slug })
    .from(tipsters)
    .where(and(...conditions))
    .orderBy(tipsters.id)

  console.log(`Found ${allTipsters.length} tipsters to process`)

  const cp = readCheckpoint()
  let offset = cp.offset
  let done = cp.done
  let errors = cp.errors

  if (offset > 0) {
    console.log(`Resuming from offset=${offset} (done=${done}, errors=${errors})`)
  }

  for (let i = offset; i < allTipsters.length; i++) {
    const { id, slug } = allTipsters[i]

    let result: StatsResult | null = null
    try {
      const html = await withRetry(() => fetchStats(slug, cookie), `stats(${slug})`)
      result = parseStatsHtml(html)
    } catch (err) {
      errors++
      console.error(`[${i + 1}/${allTipsters.length}] ERROR ${slug}: ${(err as Error).message}`)
      saveCheckpoint(i + 1, done, errors)
      await new Promise(r => setTimeout(r, 500))
      continue
    }

    if (result) {
      await withRetry(async () => {
        await db.update(tipsters)
          .set({
            picks6mAvg:      result!.picks6mAvg,
            yield3m:         result!.yield3m,
            yield6m:         result!.yield6m,
            yield12m:        result!.yield12m,
            picksFree3mAvg:  result!.picksFree3mAvg,
            yieldFree3m:     result!.yieldFree3m,
            statsUpdatedAt:  new Date(),
          })
          .where(sql`${tipsters.id} = ${id}`)
      }, `upsert(${slug})`)
    }

    done++
    if ((i + 1) % 100 === 0) {
      const last = result ? `y6m=${result.yield6m} p6m=${result.picks6mAvg}` : 'no-archive'
      console.log(`[${i + 1}/${allTipsters.length}] done=${done}, errors=${errors} | ${slug} ${last}`)
      saveCheckpoint(i + 1, done, errors)
    }

    await new Promise(r => setTimeout(r, 300))
  }

  saveCheckpoint(allTipsters.length, done, errors)
  console.log(`Stats crawl finished. Total done=${done}, errors=${errors}`)

  if (existsSync(CHECKPOINT_PATH) && errors === 0) {
    const { unlinkSync } = await import('fs')
    unlinkSync(CHECKPOINT_PATH)
  }

  // Null out stats for tipsters not active in the last month
  const cleared = await db.update(tipsters)
    .set({ yield3m: null, yield6m: null, yield12m: null, picks6mAvg: null,
           picksFree3mAvg: null, yieldFree3m: null, statsUpdatedAt: null })
    .where(or(isNull(tipsters.lastPickAt), lt(tipsters.lastPickAt, oneMonthAgo)))
  console.log(`Cleared stale stats for inactive tipsters.`)
}

// Only run when executed directly
import { fileURLToPath } from 'url'
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  crawlStats().catch((err) => {
    console.error('Stats crawl failed:', err)
    process.exit(1)
  })
}
