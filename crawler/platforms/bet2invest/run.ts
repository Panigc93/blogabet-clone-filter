// Bet2Invest crawl RUNNER (preparatory; NOT executed against the web, no DB,
// no workflow/cron). Combines pause check + selectDue + crawlProfiles +
// per-outcome local persistence. Every parameter is explicit: there are no
// defaults for the refresh policy, the store directory or the id mapping.
import { crawlProfiles, type CrawlDeps, type CrawlReport } from './crawl'
import {
  assertValidPolicy, readPause, loadState, recordOutcome, selectDue, type RefreshPolicy, type GlobalPause, type SlugState,
} from './capture-store'

export interface RunParams {
  dir: string // local store directory chosen by the caller
  slugs: string[] // candidate slugs (e.g. from the sitemap)
  policy: RefreshPolicy // REQUIRED, no default
  deps: CrawlDeps // injected fetch/sleep/clock
  mapId: (slug: string) => number
}

export type RunResult =
  | { status: 'paused'; pause: GlobalPause; requests: 0 } // no request made
  | { status: 'nothing-due'; requests: 0 }
  | { status: 'completed' | 'stopped'; report: CrawlReport; stoppedAt?: string }

export async function runCrawl(p: RunParams): Promise<RunResult> {
  assertValidPolicy(p.policy) // before the pause check, any store read or any fetch
  const pause = readPause(p.dir)
  if (pause) return { status: 'paused', pause, requests: 0 }
  const now = p.deps.now()
  const states = new Map<string, SlugState>(p.slugs.map((s) => [s, loadState(p.dir, s)]))
  const due = selectDue(p.slugs, states, now, p.policy)
  if (due.length === 0) return { status: 'nothing-due', requests: 0 }
  const report = await crawlProfiles(due, p.deps, p.mapId, (o) => {
    recordOutcome(p.dir, o, p.deps.now())
  })
  if (report.stoppedEarly) {
    const last = report.outcomes[report.outcomes.length - 1]
    return { status: 'stopped', report, stoppedAt: last.slug }
  }
  return { status: 'completed', report }
}
