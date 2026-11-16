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
// - A 'stopped' outcome (403/429/challenge/reset/timeout) is a SITE signal:
//   it leaves the slug state untouched (no failure counted, no attempt that
//   could pass for a capture) and instead writes a persistent GLOBAL PAUSE.
//   The pause is never lifted by time or backoff: only resume(), an
//   explicit decision with a named decider and a note, removes it.
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
  if (outcome.kind === 'stopped') return state // site-level: not this profile's failure
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

// No default policy exists: every value is an explicit decision by whoever
// runs the crawl (none has been authorized yet).
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
  policy: RefreshPolicy,
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
// Per-slug files live in <dir>/captures/; the pause lives apart in
// <dir>/pause.json so no slug can collide with it.
const capturesDir = (dir: string) => path.join(dir, 'captures')
const fileFor = (dir: string, slug: string) =>
  path.join(capturesDir(dir), `${encodeURIComponent(slug)}.json`)

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
  writeAtomic(fileFor(dir, state.slug), JSON.stringify(state, null, 1))
}

function writeAtomic(f: string, text: string): void {
  fs.mkdirSync(path.dirname(f), { recursive: true })
  const tmp = `${f}.${process.pid}.tmp`
  fs.writeFileSync(tmp, text)
  fs.renameSync(tmp, f)
}

// ---- global pause -------------------------------------------------------
export interface GlobalPause {
  pausedAt: string // ISO
  reason: string
  triggerSlug: string // profile being requested when the signal appeared (not at fault)
}

export interface PauseResolution extends GlobalPause {
  resumedAt: string
  decidedBy: string
  note: string
}

const pauseFile = (dir: string) => path.join(dir, 'pause.json')
const pauseLog = (dir: string) => path.join(dir, 'pause-log.json')

export function readPause(dir: string): GlobalPause | null {
  const f = pauseFile(dir)
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as GlobalPause) : null
}

// Keeps the FIRST pause: later signals never overwrite its origin.
export function writePause(dir: string, outcome: CrawlOutcome, at: Date): GlobalPause {
  const existing = readPause(dir)
  if (existing) return existing
  if (outcome.kind !== 'stopped') throw new Error('pause requires a stopped outcome')
  const pause: GlobalPause = { pausedAt: at.toISOString(), reason: outcome.reason, triggerSlug: outcome.slug }
  writeAtomic(pauseFile(dir), JSON.stringify(pause, null, 1))
  return pause
}

// The ONLY way out of a pause. Needs a named decider and a note; nothing in
// the crawl or the refresh policy calls it.
export function resume(dir: string, decision: { decidedBy: string; note: string }, at: Date): PauseResolution {
  const pause = readPause(dir)
  if (!pause) throw new Error('no pause to resume')
  if (!decision.decidedBy.trim() || !decision.note.trim()) {
    throw new Error('resume requires decidedBy and note (explicit decision)')
  }
  const resolution: PauseResolution = { ...pause, resumedAt: at.toISOString(), decidedBy: decision.decidedBy.trim(), note: decision.note.trim() }
  const log = fs.existsSync(pauseLog(dir)) ? (JSON.parse(fs.readFileSync(pauseLog(dir), 'utf8')) as PauseResolution[]) : []
  writeAtomic(pauseLog(dir), JSON.stringify([...log, resolution], null, 1))
  fs.rmSync(pauseFile(dir))
  return resolution
}

export function recordOutcome(dir: string, outcome: CrawlOutcome, attemptedAt: Date): SlugState {
  if (outcome.kind === 'stopped') {
    writePause(dir, outcome, attemptedAt)
    return loadState(dir, outcome.slug) // unchanged
  }
  const next = applyOutcome(loadState(dir, outcome.slug), outcome, attemptedAt)
  saveState(dir, next)
  return next
}
