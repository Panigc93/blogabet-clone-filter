// Local CLI for the manual/authorized import path.
//
//   npx tsx crawler/import-local.ts path/to/import.json [--out out.jsonl]
//
// The JSON file must follow the ImportInput shape (see manual-import.ts):
// a mandatory sourceNote saying where the dataset came from and why we may
// hold it, plus tipster records. This tool never fetches anything; it only
// reformats data the owner already holds. It prints one MYS evaluation line
// per record and a summary, and can write normalized records as JSONL.

import { readFileSync, writeFileSync } from 'node:fs'
import { normalizeImport, parseImportFile, ManualImportError } from './platforms/manual-import'
import { evaluateMys } from './platforms/mys'

function main() {
  const args = process.argv.slice(2)
  const file = args[0]
  const outIdx = args.indexOf('--out')
  const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined
  if (!file || file.startsWith('--')) {
    console.error('usage: tsx crawler/import-local.ts <import.json> [--out out.jsonl]')
    process.exit(2)
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    console.error(`cannot read/parse ${file}: ${(e as Error).message}`)
    process.exit(2)
  }
  try {
    const input = parseImportFile(raw)
    const normalized = normalizeImport(input)
    let passMY = 0
    let unknownMY = 0
    for (const t of normalized) {
      const sample = t.samples[0] ?? { picks: null, yieldPct: null }
      const mys = evaluateMys(sample)
      if (mys.passesMY === true) passMY++
      if (mys.passesMY === null) unknownMY++
      const fmt = (b: boolean | null) => (b === null ? '?' : b ? 'SÍ' : 'no')
      console.log(
        `${t.platform}/${t.username}: muestra>=100 ${fmt(mys.muestra)} | ` +
          `yield/ROI>=11 ${fmt(mys.yield)} (basis: ${sample.yieldBasis}) | ` +
          `MY ${fmt(mys.passesMY)} | S: sin evaluar`,
      )
    }
    console.log(
      `\n${normalized.length} records | MY pass ${passMY} | MY unknown ${unknownMY} | ` +
        `source: ${input.sourceNote}`,
    )
    if (outPath) {
      writeFileSync(outPath, normalized.map((t) => JSON.stringify(t)).join('\n') + '\n')
      console.log(`wrote ${outPath}`)
    }
  } catch (e) {
    if (e instanceof ManualImportError) {
      console.error(`invalid import file: ${e.message}`)
      process.exit(1)
    }
    throw e
  }
}

main()
