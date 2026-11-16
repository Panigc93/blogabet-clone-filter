// Bet2Invest local capture store + refresh policy (preparatory). Plain JSON
// files in a directory the CALLER chooses: no DB, no production tables, no
// default path. Pure state transitions are separate from the file adapter.
//
// Invariants:
// - capturedAt = when a VALID capture was taken; attemptedAt = when a
//   fetch was tried. They are stored separately and never conflated.
// - Only an 'ok' outcome (passed parse + gate) can replace the last valid
//   capture. Quarantine, parse-failed and stopped outcomes only update the
//   attempt record; the previous valid capture is kept untouched.
// - A valid capture never moves backwards in time (older capturedAt does
//   not replace a newer one).
import fs from 'fs'
import path from 'path'
import type { CrawlOutcome } from './crawl'
import type { TipsterInsert } from '@/db/schema'

export interface AttemptRecord {
  attemptedAt: string // ISO
  kind: CrawlOutcome['kind']
  reason: string | null
}

export interface ValidCapture {
  capturedAt: string // ISO, real capture time
  insert: Omit<TipsterInsert, 'capturedAt'> // plain JSON-safe fields
}

export interface SlugState {
  slug: string
  lastAttempt: AttemptRecord | null
  lastValid: ValidCapture | null
  consecutiveFailures: number // attempts since the last 'ok' (any non-ok kind)
}

export const emptyState = (slug: string): SlugState => ({
  slug,
  lastAttempt: null,
  lastValid: null,
  consecutiveFailures: 0,
})

export function applyOutcome(state: SlugState, outcome: CrawlOutcome, attemptedAt: Date): SlugState {
  const attempt: AttemptRecord = {
    attemptedAt: attemptedAt.toISOString(),
    kind: outcome.kind,
    reason: outcome.kind === 'ok' ? null : outcome.reason,
  }
  if (outcome.kind !== 'ok') {
    return { ...state, lastAttempt: attempt, consecutiveFailures: state.consecutiveFailures + 1 }
  }
  const capturedIso = outcome.capturedAt.toISOString()
  const keepOld = state.lastValid !== null && state.lastValid.capturedAt > capturedIso
  const { capturedAt: _drop, ...insert } = outcome.mapping.insert
  void _drop
  return {
    slug: state.slug,
    lastAttempt: attempt,
    lastValid: keepOld ? state.lastValid : { capturedAt: capturedIso, insert },
    consecutiveFailures: 0,
  }
}

export interface RefreshPolicy {
  refreshAfterMs: number // a valid capture older than this is due
  backoffBaseMs: number // after a failure, wait base * 2^(failures-1)...
  backoffMaxMs: number // ...capped here
  batchSize: number // max profiles per run
}

// PROPOSAL, not a verified platform requirement: weekly refresh, 1 h base
// backoff capped at 24 h, 30 profiles per run (~5 min of pacing alone).
export const DEFAULT_POLICY: RefreshPolicy = {
  refreshAfterMs: 7 * 24 * 3600_000,
  backoffBaseMs: 3600_000,
  backoffMaxMs: 24 * 3600_000,
  batchSize: 30,
}

export function backoffMs(failures: number, p: RefreshPolicy): number {
  if (failures <= 0) return 0
  return Math.min(p.backoffBaseMs * 2 ** (failures - 1), p.backoffMaxMs)
}

// Slugs to fetch now. Order: never captured first, then oldest valid
// capture. Excluded: not yet due, or inside failure backoff (measured from
// the last ATTEMPT, so a failing profile does not look freshly captured).
export function selectDue(
  slugs: string[],
  states: Map<string, SlugState>,
  now: Date,
  policy: RefreshPolicy = DEFAULT_POLICY,
): string[] {
  const t = now.getTime()
  const due: { slug: string; key: number }[] = []
  for (const slug of slugs) {
    const s = states.get(slug) ?? emptyState(slug)
    if (s.lastAttempt && s.consecutiveFailures > 0) {
      if (t < Date.parse(s.lastAttempt.attemptedAt) + backoffMs(s.consecutiveFailures, policy)) continue
    }
    if (!s.lastValid) {
      due.push({ slug, key: -Infinity })
    } else {
      const cap = Date.parse(s.lastValid.capturedAt)
      if (t - cap >= policy.refreshAfterMs) due.push({ slug, key: cap })
    }
  }
  due.sort((a, b) => (a.key === b.key ? a.slug.localeCompare(b.slug) : a.key < b.key ? -1 : 1))
  return due.slice(0, policy.batchSize).map((d) => d.slug)
}

// ---- file adapter -------------------------------------------------------
const fileFor = (dir: string, slug: string) =>
  path.join(dir, `${encodeURIComponent(slug)}.json`)

export function loadState(dir: string, slug: string): SlugState {
  const f = fileFor(dir, slug)
  if (!fs.existsSync(f)) return emptyState(slug)
  const parsed = JSON.parse(fs.readFileSync(f, 'utf8')) as SlugState
  if (parsed.slug !== slug) throw new Error(`capture file slug mismatch: ${parsed.slug} != ${slug}`)
  return parsed
}

// Atomic: write a temp file then rename, so a crash never leaves a torn
// record that could replace a valid one.
export function saveState(dir: string, state: SlugState): void {
  fs.mkdirSync(dir, { recursive: true })
  const f = fileFor(dir, state.slug)
  const tmp = `${f}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1))
  fs.renameSync(tmp, f)
}

export function recordOutcome(dir: string, outcome: CrawlOutcome, attemptedAt: Date): SlugState {
  const next = applyOutcome(loadState(dir, outcome.slug), outcome, attemptedAt)
  saveState(dir, next)
  return next
}
