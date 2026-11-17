import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { mergeOlbgDiscovery, parseOlbgDiscovery, parseOlbgPerformance } from '../crawler/platforms/olbg/reader'
import { prepareOlbgProfile } from '../crawler/platforms/olbg/prepare'

// Explicit, offline input/output only. Does not import the DB or credentials.
// Input is the private structured capture envelope, not instructions to fetch.
const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Usage: tsx scripts/prepare-olbg-local.ts CAPTURE_DIRECTORY OUTPUT_JSON')
const captures = readdirSync(input).filter(x => /^table-\d+-(?:current|view6|view12)\.json$/.test(x)).sort()
const inventory = captures.map(name => {
  const path = resolve(input, name)
  const raw = readFileSync(path, 'utf8')
  const envelope = JSON.parse(raw)
  const entries = parseOlbgDiscovery(envelope.data, envelope.meta)
  return { file: basename(path), storedSha256: createHash('sha256').update(raw).digest('hex'), entries,
    rowCount: entries.length, source: envelope.meta }
})
const discovered = mergeOlbgDiscovery(inventory.map(x => x.entries))
const profiles = []
const pilotIds = readdirSync(input).filter(x => /^profile-\d+-month\.json$/.test(x)).map(x => Number(x.split('-')[1]))
for (const id of pilotIds) {
  const load = (mode: string) => {
    const f = JSON.parse(readFileSync(resolve(input, `profile-${id}-${mode}.json`), 'utf8'))
    // Pilot anchors independently confirmed by directory monthYear on same day.
    const anchors = Array.from(new Set(inventory.filter(x => x.entries.some(e => e.id === id)).flatMap(x => x.entries.map(e => e.month))))
    if (anchors.length !== 1) throw new Error('No unambiguous directory period anchor')
    return parseOlbgPerformance(f.node, f.meta, id, anchors[0])
  }
  profiles.push(prepareOlbgProfile(load('month'), load('table-1'), load('table-2')))
}
writeFileSync(output, JSON.stringify({
  schemaVersion: 1, offlineOnly: true, databaseReady: false,
  coverage: { tablesCaptured: inventory.length, tableRows: inventory.reduce((n, x) => n + x.rowCount, 0),
    uniqueProfilesDiscovered: discovered.length, profilesPrepared: profiles.length,
    completeCatalog: false, caveats: ['Top 100 per table/view', '6m/12m minimum-pick cutoffs', 'Official tables exclude accounts not accessed in 90 days'] },
  evidenceNote: 'Response hashes in source metadata were recorded at download. Original response bytes were not retained; storedSha256 authenticates the retained structured envelope, not the original HTTP bytes.',
  inventory: inventory.map(({ entries, ...x }) => x), discovered, profiles,
}, null, 2) + '\n')
console.log(JSON.stringify({ tables: inventory.length, uniqueIds: discovered.length, pilotProfiles: profiles.length }))
