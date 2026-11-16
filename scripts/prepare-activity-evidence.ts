// Offline preparation only. Reads allowlisted collector JSONL, writes reviewed
// evidence JSON. No HTTP, credentials, database, deploy, or recurring schedule.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { observedPublicationBounds, validEvidence, ActivityEvidence } from '../lib/activity'

const input = process.argv[2]
const output = process.argv[3]
if (!input || !output) throw new Error('Usage: npx tsx scripts/prepare-activity-evidence.ts input.jsonl output.json')
const rows = readFileSync(input, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
const evidence: ActivityEvidence[] = []
const seen = new Set<string>()
const allowed = new Set(readdirSync('crawler/platforms/golazobets/captures/2026-11-15-profiles').filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)))
let withoutPublication = 0
for (const r of rows) {
  if (typeof r.slug !== 'string' || r.slug.includes('@') || seen.has(r.slug) || !allowed.has(r.slug)) throw new Error('Invalid or duplicate slug')
  seen.add(r.slug)
  const source = new URL(r.sourceUrl)
  if (source.origin !== 'https://golazobets.com' || decodeURIComponent(source.pathname) !== '/tipster/' + r.slug || source.search || source.hash) throw new Error('Source URL/slug mismatch')
  const publications = (r.observedPicks ?? r.picks ?? [])
    .map((p: { created_at?: string }) => observedPublicationBounds(p.created_at, r.capturedAt))
    .filter((b: ReturnType<typeof observedPublicationBounds>) => b !== null)
    .sort((a: { lower: string }, b: { lower: string }) => b.lower.localeCompare(a.lower))
  if (!publications.length) { withoutPublication++; continue }
  const e: ActivityEvidence = {
    platform: 'golazobets', slug: r.slug, sourceUrl: r.sourceUrl, capturedAt: r.capturedAt,
    publishedLower: publications[0].lower, publishedUpper: publications[0].upper,
    precision: 'timezone-unknown', coverage: 'first-page'
  }
  if (!validEvidence(e)) throw new Error('Invalid source/date evidence')
  evidence.push(e)
}
// Keep independently captured Tipstrr proof without making new blocked requests.
const tipstrr: ActivityEvidence = {
  platform: 'tipstrr', slug: 'the-least-expected', sourceUrl: 'https://tipstrr.com/tipster/the-least-expected/results',
  capturedAt: '2026-11-15T14:05:00Z', publishedLower: '2026-11-13T07:05:04Z',
  publishedUpper: '2026-11-13T07:05:04Z', precision: 'utc', coverage: 'sample'
}
writeFileSync(output, JSON.stringify([...evidence, tipstrr], null, 2) + '\n')
console.log(JSON.stringify({ profilesRead: rows.length, golazobetsEvidence: evidence.length, withoutPublication, tipstrrEvidence: 1 }))
