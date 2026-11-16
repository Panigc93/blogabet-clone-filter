// Offline preparation only. Reads allowlisted collector JSONL, writes reviewed
// evidence JSON. No HTTP, credentials, database, deploy, or recurring schedule.
import { readFileSync, writeFileSync } from 'node:fs'
import { golazobetsPublicationBounds, validEvidence, ActivityEvidence } from '../lib/activity'

const input = process.argv[2]
const output = process.argv[3]
if (!input || !output) throw new Error('Usage: npx tsx scripts/prepare-activity-evidence.ts input.jsonl output.json')
const rows = readFileSync(input, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
const evidence: ActivityEvidence[] = []
const seen = new Set<string>()
let withoutPublication = 0
for (const r of rows) {
  if (typeof r.slug !== 'string' || r.slug.includes('@') || seen.has(r.slug)) throw new Error('Invalid or duplicate slug')
  seen.add(r.slug)
  const publications = (r.observedPicks ?? r.picks ?? [])
    .map((p: { created_at?: string }) => golazobetsPublicationBounds(p.created_at))
    .filter((b: ReturnType<typeof golazobetsPublicationBounds>) => b !== null)
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
