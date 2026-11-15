import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { tipsters } from '../db/schema'
import type { TipsterInsert } from '../db/schema'
import { parseBlocks, blogabetUrl, CATALOG_ORDER, COMMON_HEADERS } from './listing'
export { parseBlocks, blogabetUrl, CATALOG_ORDER }
import { sql, inArray, notInArray, and } from 'drizzle-orm'
import { CoverageTracker, formatCoverage } from './coverage'
import { appendFileSync } from 'fs'
import type { BrowserContext, Browser } from 'playwright'

// ─── Retry helper ────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 8): Promise<T> {
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

  const coverage = new CoverageTracker()
  const delayMs = Number(process.env.CRAWL_DELAY_MS ?? '1000')
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new Error('CRAWL_DELAY_MS must be a number >= 0')
  try {
  while (true) {
    console.log(`Fetching page start=${start}`)
    const fetch = usePlaywright && pwCtx
      ? () => fetchPagePlaywright(lastActive, start, cookie, pwCtx!)
      : () => fetchPage(lastActive, start, cookie)
    let records: TipsterInsert[]
    try {
      records = await withRetry(fetch, `fetchPage(${start})`)
    } catch (err) {
      coverage.finish('error')
      throw err
    }

    if (records.length === 0) {
      coverage.finish('empty_page')
      console.log('Empty page — crawl complete')
      break
    }

    let newCount = 0
    await withRetry(async () => {
      // Remove stale records: same slug but different id (tipster reset their account)
      const slugs = records.map(r => r.slug)
      const ids = records.map(r => r.id!)
      await db.delete(tipsters).where(and(inArray(tipsters.slug, slugs), notInArray(tipsters.id, ids)))

      const written = await db
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
          isVerified:  sql`excluded.is_verified`,
          followers:   sql`excluded.followers`,
          lastPickAt:  sql`COALESCE(excluded.last_pick_at, tipsters.last_pick_at)`,
          resetCount:  sql`excluded.reset_count`,
          lastResetAt: sql`excluded.last_reset_at`,
          updatedAt:   sql`NOW()`,
        },
      })
        .returning({ inserted: sql<boolean>`(xmax = 0)` })
      newCount = written.filter(w => w.inserted).length
    }, `upsert(start=${start})`)

    coverage.addPage(records.map(r => ({ id: r.id!, followers: r.followers ?? 0 })), newCount)
    total += records.length
    start += records.length
    saveCheckpoint(lastActive, start, total)
    console.log(`Upserted ${records.length} tipsters (total: ${total})`)

    await new Promise(r => setTimeout(r, delayMs))
  }

  clearCheckpoint(lastActive)
  console.log(`Crawl finished. Total upserted: ${total}`)
  } finally {
    const text = formatCoverage(coverage.summary())
    console.log(text)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n')
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
