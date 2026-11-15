// CLI: bounded dry run of the catalog listing. Reads nothing from the database and writes nothing.
// Required env: BLOGABET_COOKIE, DRY_RUN_DELAY_MS (>= 1000, no default on purpose).
// Optional: LAST_ACTIVE (default 1), DRY_RUN_MAX_PAGES (capped at 3).
import { runListingDryRun, nodeFetchPage, DRY_RUN_HARD_MAX_PAGES } from './dryRun'

async function main() {
  const cookie = process.env.BLOGABET_COOKIE
  if (!cookie) throw new Error('BLOGABET_COOKIE is not set')
  const delayMs = Number(process.env.DRY_RUN_DELAY_MS)
  if (!process.env.DRY_RUN_DELAY_MS || !Number.isFinite(delayMs)) throw new Error('DRY_RUN_DELAY_MS is required (>= 1000)')
  const report = await runListingDryRun({
    lastActive: Number(process.env.LAST_ACTIVE ?? '1'),
    fetchPage: nodeFetchPage(cookie),
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    maxPages: Number(process.env.DRY_RUN_MAX_PAGES ?? String(DRY_RUN_HARD_MAX_PAGES)),
    delayMs,
  })
  console.log(JSON.stringify(report, null, 2))
  if (report.stopReason !== 'completed') process.exitCode = 1
}
main().catch(err => { console.error(err.message); process.exit(1) })
