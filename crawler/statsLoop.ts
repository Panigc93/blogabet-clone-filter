import { BlockedError, looksLikeChallenge } from './blockPolicy'

export interface StatsLoopDeps<R> {
  fetchHtml: (slug: string) => Promise<string>   // already wrapped in the retry policy
  parse: (html: string) => R | null
  write: (id: number, result: R) => Promise<void>
  sleep: (ms: number) => Promise<void>
  log?: (msg: string) => void
  /** Abort after this many consecutive tipsters failed (each already after its retries). */
  maxConsecutiveErrors?: number
  /** Abort when the run has lasted longer than this many ms. */
  maxRuntimeMs?: number
  now?: () => number
}

export interface StatsLoopResult {
  done: number
  refreshed: number
  errors: number
  /** Set when a block, challenge or circuit breaker (consecutive errors / time budget) stopped the run. Remaining tipsters were not requested or written. */
  blocked?: string
  /** Index of the next tipster to process (resume point). */
  next: number
}

export async function runStatsLoop<R>(
  items: { id: number; slug: string }[],
  start: { offset: number; done: number; errors: number },
  d: StatsLoopDeps<R>,
  onProgress?: (next: number, done: number, errors: number) => void,
): Promise<StatsLoopResult> {
  let { done, errors } = start
  let refreshed = 0
  let consecutive = 0
  const now = d.now ?? Date.now
  const t0 = now()
  const log = d.log ?? (() => {})
  for (let i = start.offset; i < items.length; i++) {
    if (d.maxRuntimeMs !== undefined && now() - t0 > d.maxRuntimeMs) {
      const reason = `time budget of ${Math.round(d.maxRuntimeMs / 60000)} min exceeded`
      log(`[${i + 1}/${items.length}] STOP: ${reason}. Previous stats kept; checkpoint kept.`)
      return { done, refreshed, errors, blocked: reason, next: i }
    }
    const { id, slug } = items[i]
    let result: R | null = null
    try {
      const html = await d.fetchHtml(slug)
      result = d.parse(html)
      // 200 with nothing parseable: stop only on explicit challenge markers; otherwise it is "no data".
      if (result === null && looksLikeChallenge(html)) throw new BlockedError('challenge page (HTTP 200 without data)')
    } catch (err) {
      if (err instanceof BlockedError) {
        log(`[${i + 1}/${items.length}] STOP ${slug}: ${err.message}. Run aborted; previous stats kept.`)
        return { done, refreshed, errors, blocked: err.message, next: i }
      }
      errors++
      consecutive++
      log(`[${i + 1}/${items.length}] ERROR ${slug}: ${(err as Error).message}`)
      onProgress?.(i + 1, done, errors)
      if (d.maxConsecutiveErrors !== undefined && consecutive >= d.maxConsecutiveErrors) {
        const reason = `${consecutive} consecutive failed tipsters`
        log(`STOP: ${reason}. Previous stats kept; checkpoint kept.`)
        return { done, refreshed, errors, blocked: reason, next: i + 1 }
      }
      await d.sleep(500)
      continue
    }
    consecutive = 0 // any HTTP-level success (even a page with no data) ends a failure streak
    if (result) {
      await d.write(id, result)
      refreshed++
    }
    done++
    if ((i + 1) % 100 === 0) onProgress?.(i + 1, done, errors)
    await d.sleep(300)
  }
  return { done, refreshed, errors, next: items.length }
}
