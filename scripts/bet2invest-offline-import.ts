// Dry run: reads captures already on disk and writes a JSON report. No network, no DB, no Neon.
// Usage: npx tsx scripts/bet2invest-offline-import.ts <captureDir> <capturedAtISO> <reportPath>
// <captureDir> holds ssr/<slug>.html and api/<slug>.json. Rows are NOT persisted anywhere.
import { writeFileSync } from 'fs'
import { simulateImport } from '../crawler/platforms/bet2invest/offline-import'

const [dir, at, out] = process.argv.slice(2)
if (!dir || !at || !out || !Number.isFinite(new Date(at).getTime())) {
  console.error('usage: bet2invest-offline-import <captureDir> <capturedAtISO> <reportPath>')
  process.exit(2)
}
const { report, rows } = simulateImport(dir, new Date(at))
const detail = rows.map((r) =>
  r.status === 'row' ? { slug: r.slug, status: r.status, basis: r.basis, yield: r.insert.yield, yield3m: r.insert.yield3m, yield6m: r.insert.yield6m, yield12m: r.insert.yield12m, windowReasons: Object.fromEntries(([3, 6, 12] as const).map((n) => [`${n}m`, r.windows[n].reason])) } : r,
)
writeFileSync(out, JSON.stringify({ report, detail }, null, 1))
console.log(JSON.stringify(report))
