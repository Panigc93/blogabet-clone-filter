import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { tipsters, TipsterInsert } from '../db/schema'
import { sql } from 'drizzle-orm'

// ─── Field transform ────────────────────────────────────────────────────────

export function transformTipster(raw: any): TipsterInsert {
  const price = raw.subscription?.price
  const isPaid = price !== null && price !== undefined && Number(price) > 0
  return {
    id:          raw.id,
    slug:        raw.slug,
    name:        raw.name,
    avatarUrl:   raw.avatar ?? null,
    flagUrl:     raw.country?.flag ?? null,
    countryCode: raw.country?.code ?? null,
    isPaid,
    price:       isPaid ? String(price) : null,
    sinceYear:   raw.memberSince ? new Date(raw.memberSince).getFullYear() : null,
    picks:       raw.picks ?? 0,
    profit:      raw.profit != null ? String(raw.profit) : null,
    yield:       raw.yield != null ? String(raw.yield) : null,
    verifiedPct: raw.verifiedPercent != null ? String(raw.verifiedPercent) : null,
    followers:   raw.followers ?? 0,
    lastPickAt:  raw.lastPickDate ? new Date(raw.lastPickDate) : null,
    resetCount:  raw.resetCount ?? 0,
    updatedAt:   new Date(),
  }
}

// ─── Fetch one page ──────────────────────────────────────────────────────────

async function fetchPage(lastActive: number, start: number, cookie: string): Promise<any[]> {
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

  const res = await fetch(url.toString(), {
    headers: { Cookie: cookie },
  })

  if (!res.ok) {
    throw new Error(`Blogabet API error: ${res.status} ${res.statusText}`)
  }

  const json = await res.json()
  return json.data ?? []
}

// ─── Main crawl loop ─────────────────────────────────────────────────────────

async function crawl() {
  const cookie = process.env.BLOGABET_COOKIE
  if (!cookie) throw new Error('BLOGABET_COOKIE is not set')

  const dbUrl = process.env.DATABASE_URL_DIRECT
  if (!dbUrl) throw new Error('DATABASE_URL_DIRECT is not set')

  const lastActive = Number(process.env.LAST_ACTIVE ?? '1')
  const db = drizzle(neon(dbUrl), { schema: { tipsters } })

  console.log(`Starting crawl: lastActive=${lastActive}`)
  let start = 0
  let total = 0

  while (true) {
    console.log(`Fetching page start=${start}`)
    const rows = await fetchPage(lastActive, start, cookie)

    if (rows.length === 0) {
      console.log('Empty page — crawl complete')
      break
    }

    const records = rows.map(transformTipster)

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
          countryCode: sql`excluded.country_code`,
          isPaid:      sql`excluded.is_paid`,
          price:       sql`excluded.price`,
          sinceYear:   sql`excluded.since_year`,
          picks:       sql`excluded.picks`,
          profit:      sql`excluded.profit`,
          yield:       sql`excluded.yield`,
          verifiedPct: sql`excluded.verified_pct`,
          followers:   sql`excluded.followers`,
          lastPickAt:  sql`excluded.last_pick_at`,
          resetCount:  sql`excluded.reset_count`,
          updatedAt:   sql`NOW()`,
        },
      })

    total += records.length
    console.log(`Upserted ${records.length} tipsters (total: ${total})`)
    start += 25

    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`Crawl finished. Total upserted: ${total}`)
}

// Only run when executed directly (not when imported by tests)
import { fileURLToPath } from 'url'
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  crawl().catch((err) => {
    console.error('Crawl failed:', err)
    process.exit(1)
  })
}
