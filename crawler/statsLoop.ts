import { BlockedError, looksLikeChallenge } from './blockPolicy'

export interface StatsLoopDeps<R> {
  fetchHtml: (slug: string) => Promise<string>   // already wrapped in the retry policy
  parse: (html: string) => R | null
  write: (id: number, result: R) => Promise<void>
  sleep: (ms: number) => Promise<void>
  log?: (msg: string) => void
  /** Abort after this many consecutive FAILED tipsters (each already after its retries). Reset only by a refreshed tipster. */
  maxConsecutiveErrors?: number
  /** Abort after this many consecutive tipsters NOT refreshed for any reason (errors or 200 without data). Reset only by a refreshed tipster. */
  maxConsecutiveUnrefreshed?: number
  /** Abort when the run has lasted longer than this many ms. */
  maxRuntimeMs?: number
  now?: () => number
}

export interface StatsRunCounters {
  /** Completed items in this invocation only: refreshed + noData + requestErrors. */
  processed: number
  refreshed: number
  noData: number
  requestErrors: number
  checkpointOffset: number
  checkpointDone: number
  checkpointErrors: number
}

export interface StatsLoopResult {
  counters: StatsRunCounters
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
  let noData = 0
  let requestErrors = 0
  let refreshed = 0
  const counters = (): StatsRunCounters => ({
    processed: refreshed + noData + requestErrors, refreshed, noData, requestErrors,
    checkpointOffset: start.offset, checkpointDone: start.done, checkpointErrors: start.errors,
  })
  let consecutive = 0 // failed tipsters in a row
  let unrefreshed = 0 // not-refreshed tipsters in a row (errors + 200 without data)
  const now = d.now ?? Date.now
  const t0 = now()
  const log = d.log ?? (() => {})
  for (let i = start.offset; i < items.length; i++) {
    if (d.maxRuntimeMs !== undefined && now() - t0 > d.maxRuntimeMs) {
      const reason = `time budget of ${Math.round(d.maxRuntimeMs / 60000)} min exceeded`
      log(`[${i + 1}/${items.length}] STOP: ${reason}. Previous stats kept; checkpoint kept.`)
      return { counters: counters(), done, refreshed, errors, blocked: reason, next: i }
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
        return { counters: counters(), done, refreshed, errors, blocked: err.message, next: i }
      }
      errors++
      requestErrors++
      consecutive++
      unrefreshed++
      log(`[${i + 1}/${items.length}] ERROR ${slug}: ${(err as Error).message}`)
      onProgress?.(i + 1, done, errors)
      const tooManyUnrefreshed = d.maxConsecutiveUnrefreshed !== undefined && unrefreshed >= d.maxConsecutiveUnrefreshed
      if ((d.maxConsecutiveErrors !== undefined && consecutive >= d.maxConsecutiveErrors) || tooManyUnrefreshed) {
        const reason = tooManyUnrefreshed && !(d.maxConsecutiveErrors !== undefined && consecutive >= d.maxConsecutiveErrors)
          ? `${unrefreshed} consecutive tipsters not refreshed`
          : `${consecutive} consecutive failed tipsters`
        log(`STOP: ${reason}. Previous stats kept; checkpoint kept.`)
        return { counters: counters(), done, refreshed, errors, blocked: reason, next: i + 1 }
      }
      await d.sleep(500)
      continue
    }
    if (result) {
      await d.write(id, result)
      refreshed++
      consecutive = 0
      unrefreshed = 0
    } else {
      noData++
      // 200 without parseable data is NOT a refresh: it counts toward the unrefreshed streak.
      unrefreshed++
      if (d.maxConsecutiveUnrefreshed !== undefined && unrefreshed >= d.maxConsecutiveUnrefreshed) {
        const reason = `${unrefreshed} consecutive tipsters not refreshed`
        log(`STOP: ${reason}. Previous stats kept; checkpoint kept.`)
        done++
        return { counters: counters(), done, refreshed, errors, blocked: reason, next: i + 1 }
      }
    }
    done++
    if ((i + 1) % 100 === 0) onProgress?.(i + 1, done, errors)
    await d.sleep(300)
  }
  return { counters: counters(), done, refreshed, errors, next: items.length }
}
