// Outcome policy for the stats crawl. Conservative by default: stats are never
// nulled unless explicitly requested. Freshness stays visible in stats_updated_at
// (rows that are not refreshed keep their old timestamp).

export interface StatsRunSummary {
  /** Tipsters selected for refresh (last_pick_at inside the activity window). */
  selected: number
  /** Tipsters that currently hold period stats (stats_updated_at not null). */
  withStats: number
  /** Selected tipsters processed without error in this run (includes pages with no stats data). */
  done: number
  /** Selected tipsters whose stats were parsed and written in this run (HTTP 200 with data). */
  refreshed: number
  /** Selected tipsters that failed in this run. */
  errors: number
  /** True only if the loop ran to the end (not cancelled or crashed). */
  completed: boolean
  /** Set when the run was aborted: block (401/403/429), challenge page, consecutive failures or time budget. */
  blocked?: string
  /** Explicit opt-in (CLEAR_INACTIVE_STATS=1). Default false. */
  clearRequested: boolean
}

export interface StatsOutcome {
  clear: boolean
  exitCode: 0 | 1
  messages: string[]
}

export function decideStatsOutcome(s: StatsRunSummary): StatsOutcome {
  const messages: string[] = []
  let exitCode: 0 | 1 = 0

  if (s.blocked) {
    messages.push(`Run aborted (${s.blocked}). No further requests or writes; previous stats kept.`)
    exitCode = 1
  } else if (s.selected === 0) {
    // No activity evidence at all (empty or fully stale catalog): nothing is refreshed
    // and nothing is deleted. Make it visible instead of a green no-op.
    messages.push(`No tipsters selected (last_pick_at has no activity inside the window). Nothing refreshed; ${s.withStats} rows keep their stats and old stats_updated_at.`)
    exitCode = 1
  } else {
    const notRefreshed = Math.max(0, s.withStats - s.done)
    if (notRefreshed > 0) {
      messages.push(`${notRefreshed} rows with stats were not refreshed in this run; they keep their values and old stats_updated_at.`)
    }
    if (s.errors > 0) {
      messages.push(`${s.errors} of ${s.selected} stats requests failed.`)
      if (s.errors === s.selected) exitCode = 1
    }
    if (s.errors < s.selected && s.refreshed === 0) {
      // HTTP 200 on every page but nothing parsed: an empty or changed response, not a success.
      messages.push(`0 of ${s.selected} selected tipsters returned parseable stats (empty or changed responses). Nothing was written.`)
      exitCode = 1
    }
  }

  let clear = false
  if (s.clearRequested) {
    if (!s.completed) messages.push('Clear skipped: run did not complete.')
    else if (s.selected === 0) messages.push('Clear skipped: no activity evidence.')
    else if (s.errors > 0) messages.push('Clear skipped: some requests failed.')
    else if (s.refreshed === 0) messages.push('Clear skipped: no stats were refreshed.')
    else clear = true
  }
  return { clear, exitCode, messages }
}
