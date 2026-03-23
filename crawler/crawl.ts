import * as cheerio from 'cheerio'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { tipsters, TipsterInsert } from '../db/schema'
import { sql, inArray, notInArray, and } from 'drizzle-orm'
import type { BrowserContext, Browser } from 'playwright'

// ─── HTML parser ─────────────────────────────────────────────────────────────

function parseNum(text: string): string | null {
  if (!text || text === '—') return null
  const clean = text.replace(/[+%,\s]/g, '').replace(/,/g, '.')
  const n = parseFloat(clean)
  return isNaN(n) ? null : String(n)
}

export function parseBlocks(html: string, lastActive = 12): TipsterInsert[] {
  const $ = cheerio.load(html)
  const results: TipsterInsert[] = []

  $('.tipster-block').each((_, el) => {
    try {
      const $el = $(el)

      // ID from onclick="tipsters.showFollowBox('637581')"
      const onclick = $el.find('[onclick*="showFollowBox"]').attr('onclick') ?? ''
      const idMatch = onclick.match(/showFollowBox\('(\d+)'\)/)
      if (!idMatch) return
      const id = parseInt(idMatch[1], 10)

      // Slug from https://criteriofutbol.blogabet.com
      const href = $el.find('.avatar a').attr('href') ?? ''
      const slugMatch = href.match(/https?:\/\/([^.]+)\.blogabet\.com/)
      if (!slugMatch) return
      const slug = slugMatch[1]

      // Name
      const name = $el.find('h3.name-t strong').text().trim()
        || $el.find('.avatar a').attr('title') || slug

      // Avatar
      const avatarUrl = $el.find('.avatar img.img-circle').attr('src') ?? null

      // Flag (img inside .icons that is NOT inside a fa-stack)
      const flagUrl = $el.find('.icons > img').attr('src') ?? null

      // Stats — 6 .number spans: Since, Picks, Profit, Yield, Verified%, Followers
      const nums = $el.find('.pins .number').map((_, n) => $(n).text().trim()).get()
      const sinceYear  = nums[0] ? parseInt(nums[0], 10) : null
      const picks      = nums[1] ? parseInt(nums[1], 10) : 0
      const profit     = parseNum(nums[2] ?? '')
      const yieldVal   = parseNum((nums[3] ?? '').replace('%', ''))
      const verifiedPct = parseNum((nums[4] ?? '').replace('%', ''))
      const followers  = nums[5] ? parseInt(nums[5], 10) : 0

      // Reset count + last reset date — tooltip: "Blog stats have been reset 3 times. Last reset on 25 Nov 2023."
      const resetTitle = $el.find('[data-original-title*="reset"]').attr('data-original-title') ?? ''
      const resetMatch = resetTitle.match(/reset\s+(\d+)\s+time/i)
      const resetCount = resetMatch ? parseInt(resetMatch[1], 10) : 0

      // Try to parse a date from the reset tooltip (various formats blogabet may use)
      let lastResetAt: Date | null = null
      const dateMatch = resetTitle.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{4})/i)
        ?? resetTitle.match(/(\d{4})-(\d{2})-(\d{2})/)
        ?? resetTitle.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
      if (dateMatch) {
        const parsed = new Date(dateMatch[0])
        if (!isNaN(parsed.getTime())) lastResetAt = parsed
      }

      // isPaid + price — look for subscribe button with price text
      const subscribeText = $el.find('.subscribe-btns').text()
      const priceMatch = subscribeText.match(/(\d+(?:[.,]\d+)?)\s*€/)
      const isPaid = !!priceMatch
      const price = priceMatch ? priceMatch[1].replace(',', '.') : null

      results.push({
        id,
        slug,
        name,
        avatarUrl,
        flagUrl,
        countryCode: null,
        isPaid,
        price,
        sinceYear:   !sinceYear || isNaN(sinceYear) ? null : sinceYear,
        picks:       isNaN(picks) ? 0 : picks,
        profit,
        yield:       yieldVal,
        verifiedPct,
        followers:   isNaN(followers) ? 0 : followers,
        lastPickAt:  lastActive <= 1 ? new Date() : null, // only set for monthly-active crawl
        resetCount:  isNaN(resetCount) ? 0 : resetCount,
        lastResetAt,
        updatedAt:   new Date(),
      })
    } catch (err) {
      console.error('Error parsing block:', err)
    }
  })

  return results
}

// ─── Retry helper ────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 4): Promise<T> {
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

// ─── Build Blogabet URL ───────────────────────────────────────────────────────

function blogabetUrl(lastActive: number, start: number): string {
  const url = new URL('https://blogabet.com/tipsters/')
  url.searchParams.set('f[language]', 'all')
  url.searchParams.set('f[pickType]', 'all')
  url.searchParams.set('f[sport]', 'all')
  url.searchParams.set('f[leagues]', 'all')
  url.searchParams.set('f[picksOver]', '0')
  url.searchParams.set('f[lastActive]', String(lastActive))
  url.searchParams.set('f[bookiesUsed]', 'null')
  url.searchParams.set('f[order]', 'yield')
  url.searchParams.set('f[start]', String(start))
  return url.toString()
}

const COMMON_HEADERS = {
  'accept': '*/*',
  'accept-language': 'en,es-ES;q=0.9,es;q=0.8',
  'cache-control': 'no-cache',
  'pragma': 'no-cache',
  'referer': 'https://blogabet.com/tipsters',
  'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Linux"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  'x-requested-with': 'XMLHttpRequest',
}

// ─── Fetch one page (Node fetch) ─────────────────────────────────────────────

async function fetchPage(lastActive: number, start: number, cookie: string): Promise<TipsterInsert[]> {
  const res = await fetch(blogabetUrl(lastActive, start), {
    headers: { ...COMMON_HEADERS, Cookie: cookie },
  })

  if (!res.ok) throw new Error(`Blogabet HTTP ${res.status} ${res.statusText}`)

  const html = await res.text()
  return parseBlocks(html, lastActive)
}

// ─── Fetch one page (Playwright / real Chrome) ───────────────────────────────

async function fetchPagePlaywright(lastActive: number, start: number, cookie: string, ctx: BrowserContext): Promise<TipsterInsert[]> {
  const res = await ctx.request.get(blogabetUrl(lastActive, start), {
    headers: COMMON_HEADERS,
  })

  if (!res.ok()) throw new Error(`Blogabet HTTP ${res.status()} ${res.statusText()}`)

  const html = await res.text()
  return parseBlocks(html, lastActive)
}

// ─── Checkpoint helpers ───────────────────────────────────────────────────────

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs'

function checkpointPath(lastActive: number) {
  return `./crawler/.checkpoint-${lastActive}`
}

function readCheckpoint(lastActive: number): { start: number; total: number } {
  const path = checkpointPath(lastActive)
  if (!existsSync(path)) return { start: 0, total: 0 }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return { start: 0, total: 0 }
  }
}

function saveCheckpoint(lastActive: number, start: number, total: number) {
  writeFileSync(checkpointPath(lastActive), JSON.stringify({ start, total }))
}

function clearCheckpoint(lastActive: number) {
  const path = checkpointPath(lastActive)
  if (existsSync(path)) unlinkSync(path)
}

// ─── Main crawl loop ─────────────────────────────────────────────────────────

async function crawl() {
  const cookie = process.env.BLOGABET_COOKIE
  if (!cookie) throw new Error('BLOGABET_COOKIE is not set')

  const dbUrl = process.env.DATABASE_URL_DIRECT
  if (!dbUrl) throw new Error('DATABASE_URL_DIRECT is not set')

  const lastActive = Number(process.env.LAST_ACTIVE ?? '1')
  const usePlaywright = process.env.USE_PLAYWRIGHT === '1'
  const db = drizzle(neon(dbUrl), { schema: { tipsters } })

  // Launch Playwright browser if needed
  const { chromium } = await import('playwright')
  let browser: Browser | null = null
  let pwCtx: BrowserContext | null = null
  if (usePlaywright) {
    console.log('Using Playwright (real Chrome) for requests')
    browser = await chromium.launch({ headless: true })
    pwCtx = await browser.newContext()
    // Inject cookies into the Playwright context
    const cookiePairs = cookie.split(';').map(s => s.trim()).filter(Boolean)
    await pwCtx.addCookies(cookiePairs.map(pair => {
      const [name, ...rest] = pair.split('=')
      return { name: name.trim(), value: rest.join('=').trim(), domain: 'blogabet.com', path: '/' }
    }))
  }

  const checkpoint = readCheckpoint(lastActive)
  let start = checkpoint.start
  let total = checkpoint.total

  if (start > 0) {
    console.log(`Resuming crawl from checkpoint: lastActive=${lastActive}, start=${start}, total=${total}`)
  } else {
    console.log(`Starting crawl: lastActive=${lastActive}`)
  }

  try {
  while (true) {
    console.log(`Fetching page start=${start}`)
    const fetch = usePlaywright && pwCtx
      ? () => fetchPagePlaywright(lastActive, start, cookie, pwCtx!)
      : () => fetchPage(lastActive, start, cookie)
    const records = await withRetry(fetch, `fetchPage(${start})`)

    if (records.length === 0) {
      console.log('Empty page — crawl complete')
      break
    }

    await withRetry(async () => {
      // Remove stale records: same slug but different id (tipster reset their account)
      const slugs = records.map(r => r.slug)
      const ids = records.map(r => r.id!)
      await db.delete(tipsters).where(and(inArray(tipsters.slug, slugs), notInArray(tipsters.id, ids)))

      await db
        .insert(tipsters)
        .values(records)
        .onConflictDoUpdate({
        target: tipsters.id,
        set: {
          slug:        sql`excluded.slug`,
          name:        sql`excluded.name`,
          avatarUrl:   sql`excluded.avatar_url`,
          flagUrl:     sql`excluded.flag_url`,
          isPaid:      sql`excluded.is_paid`,
          price:       sql`excluded.price`,
          sinceYear:   sql`excluded.since_year`,
          picks:       sql`excluded.picks`,
          profit:      sql`excluded.profit`,
          yield:       sql`excluded.yield`,
          verifiedPct: sql`excluded.verified_pct`,
          followers:   sql`excluded.followers`,
          lastPickAt:  sql`COALESCE(excluded.last_pick_at, tipsters.last_pick_at)`,
          resetCount:  sql`excluded.reset_count`,
          lastResetAt: sql`excluded.last_reset_at`,
          updatedAt:   sql`NOW()`,
        },
      })
    }, `upsert(start=${start})`)

    total += records.length
    start += records.length
    saveCheckpoint(lastActive, start, total)
    console.log(`Upserted ${records.length} tipsters (total: ${total})`)

    await new Promise(r => setTimeout(r, 300))
  }

  clearCheckpoint(lastActive)
  console.log(`Crawl finished. Total upserted: ${total}`)
  } finally {
    await browser?.close()
  }
}

// Only run when executed directly (not when imported by tests)
import { fileURLToPath } from 'url'
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  crawl().catch((err) => {
    console.error('Crawl failed:', err)
    process.exit(1)
  })
}
