// Blogabet profile-signal probe — PREPARED, NOT EXECUTED (2026-11-20).
//
// Bounded flow that reads profile home pages with the authorized crawler
// method (session cookie from BLOGABET_COOKIE, crawler headers, >=10s
// between requests, stop on any block/challenge) and turns each page into
// an access-signal update for the tri-state classification (migration
// 0007). It never touches /blog/picks. Dry-run by default: with --write it
// would upsert access_class/access_evidence/access_observed_at, which is a
// prod write and stays unapproved; this script has not been run at all.
//
// The pure mapping (signalToAccessUpdate) is what the tests exercise over
// the 13 fragment fixtures of the 2026-11-20 sample.

import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { tipsters } from '@/db/schema'
import { parseBlogabetProfile, type BlogabetProfileReading } from './blogabet-profile-signal'

const MIN_INTERVAL_MS = 10_000

export interface AccessUpdate {
  accessClass: 'free' | 'paid' | null
  accessEvidence: string
  accessObservedAt: Date
}

// Pure: profile reading -> stored signal. Every read stamps evidence and
// the observation date; 'not-found' and 'none' both store class NULL, so a
// stale listing boolean never resurrects a dead or signal-less profile.
export function signalToAccessUpdate(reading: BlogabetProfileReading, observedAt: Date): AccessUpdate {
  switch (reading.signal.kind) {
    case 'free-nonverified':
      return { accessClass: 'free', accessEvidence: reading.signal.evidence, accessObservedAt: observedAt }
    case 'paid-price':
      return { accessClass: 'paid', accessEvidence: `subscribe ${reading.signal.priceEur}€/MONTH`, accessObservedAt: observedAt }
    case 'paid-service-full':
      return { accessClass: 'paid', accessEvidence: 'SERVICE FULL (subscribe, no open slots, no parseable price)', accessObservedAt: observedAt }
    case 'not-found':
      return { accessClass: null, accessEvidence: 'blog-not-found', accessObservedAt: observedAt }
    case 'none':
      return { accessClass: null, accessEvidence: 'no-signal', accessObservedAt: observedAt }
  }
}

export function profileUrl(slug: string): string {
  return `https://${slug}.blogabet.com/`
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Bounded probe over explicit slugs. Stops at the first non-200 or
// challenge marker; never retries a denial. NOT executed as of 2026-11-20.
export async function probeProfiles(slugs: string[], opts: { write: boolean; fetchHtml?: (slug: string) => Promise<string>; intervalMs?: number }): Promise<AccessUpdate[]> {
  const fetchHtml = opts.fetchHtml ?? (async (slug: string) => {
    const cookie = process.env.BLOGABET_COOKIE
    if (!cookie) throw new Error('BLOGABET_COOKIE is not set')
    const res = await fetch(profileUrl(slug), {
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en,es-ES;q=0.9,es;q=0.8',
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
        'Cookie': cookie,
      },
      signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${slug}: stop, no retry of denials`)
    return res.text()
  })

  const intervalMs = opts.intervalMs ?? MIN_INTERVAL_MS
  const updates: AccessUpdate[] = []
  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i]!
    if (i > 0) await sleep(intervalMs)
    const html = await fetchHtml(slug)
    const observedAt = new Date()
    const update = signalToAccessUpdate(parseBlogabetProfile(html), observedAt)
    if (opts.write) {
      await db.update(tipsters).set(update)
        .where(and(eq(tipsters.platform, 'blogabet'), eq(tipsters.slug, slug)))
    }
    updates.push(update)
  }
  return updates
}
