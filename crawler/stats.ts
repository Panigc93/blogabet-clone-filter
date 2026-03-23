import * as cheerio from 'cheerio'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { tipsters } from '../db/schema'
import { sql, gt } from 'drizzle-orm'
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
  profit: number
  stakeAvg: number
}

interface StatsResult {
  picks6mAvg: string | null
  yield3m: string | null
  yield6m: string | null
  yield12m: string | null
}

export function parseStatsHtml(html: string): StatsResult | null {
  const $ = cheerio.load(html)

  const rows: MonthRow[] = []

  // Archive table: div[data-stats="archive"] tbody tr
  $('[data-stats="archive"] tbody tr').each((_, tr) => {
    const tds = $(tr).find('td')
    if (tds.length < 7) return

    // Col 0: hidden span has Unix timestamp
    const tsText = $(tds[0]).find('.hidden').text().trim()
    const ts = parseInt(tsText, 10)
    if (isNaN(ts) || ts <= 0) return

    // Col 1: picks
    const picks = parseInt($(tds[1]).text().trim(), 10)
    if (isNaN(picks) || picks <= 0) return

    // Col 3: profit (span with +/- prefix, e.g. "+8" or "-6")
    const profitText = $(tds[3]).find('span').text().trim().replace(/[+,\s]/g, '')
    const profit = parseFloat(profitText)
    if (isNaN(profit)) return

    // Col 6: stake avg (e.g. "1.12")
    const stakeText = $(tds[6]).find('span').text().trim().replace(',', '.')
    const stakeAvg = parseFloat(stakeText)
    if (isNaN(stakeAvg) || stakeAvg <= 0) return

    rows.push({ ts, picks, profit, stakeAvg })
  })

  if (rows.length === 0) return null

  // Sort newest first
  rows.sort((a, b) => b.ts - a.ts)

  function computeYield(monthRows: MonthRow[]): string | null {
    if (monthRows.length === 0) return null
    const totalProfit = monthRows.reduce((s, r) => s + r.profit, 0)
    const totalStakes = monthRows.reduce((s, r) => s + r.picks * r.stakeAvg, 0)
    if (totalStakes === 0) return null
    return (totalProfit / totalStakes * 100).toFixed(2)
  }

  const last3  = rows.slice(0, 3)
  const last6  = rows.slice(0, 6)
  const last12 = rows.slice(0, 12)

  const picks6mAvg = last6.length > 0
    ? (last6.reduce((s, r) => s + r.picks, 0) / last6.length).toFixed(2)
    : null

  return {
    picks6mAvg,
    yield3m:  computeYield(last3),
    yield6m:  computeYield(last6),
    yield12m: computeYield(last12),
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

  console.log(`Loading tipsters from DB (minPicks=${minPicks})...`)
  const allTipsters = await db.select({ id: tipsters.id, slug: tipsters.slug })
    .from(tipsters)
    .where(minPicks > 0 ? gt(tipsters.picks, minPicks) : undefined)
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
            picks6mAvg:     result!.picks6mAvg,
            yield3m:        result!.yield3m,
            yield6m:        result!.yield6m,
            yield12m:       result!.yield12m,
            statsUpdatedAt: new Date(),
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
}

// Only run when executed directly
import { fileURLToPath } from 'url'
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  crawlStats().catch((err) => {
    console.error('Stats crawl failed:', err)
    process.exit(1)
  })
}
