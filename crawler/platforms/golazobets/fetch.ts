// Local prototype fetcher for Golazobets public pages.
//
// Scope: LOCAL, SMALL-SCALE validation of the parser only. Their terms
// (golazobets.com/legal, section 13) prohibit "uso automatizado no autorizado",
// so any recurring or full-catalog run needs the platform's authorization
// first. Do not wire this into GitHub Actions or Neon without that approval.
//
// Usage: npx tsx crawler/platforms/golazobets/fetch.ts --pages 2 --out /tmp/gz.jsonl
// Output: one JSON line per tipster (listing shape). Emails are never read
// by the parser, so they never reach the output.

import { writeFileSync } from 'fs'
import { parseListingPage } from './parse'

const BASE = 'https://golazobets.com/tipsters'
const DELAY_MS = 3000
const USER_AGENT =
  'Mozilla/5.0 (compatible; superblogabet-prototype/0.1; +https://github.com/Panigc93/blogabet-clone-filter)'

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null
}

async function main() {
  const pages = Math.max(1, Math.min(5, parseInt(argValue('--pages') ?? '1', 10) || 1))
  const out = argValue('--out')
  const seen = new Set<number>()
  const lines: string[] = []

  for (let page = 1; page <= pages; page++) {
    const res = await fetch(`${BASE}?page=${page}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    })
    if (!res.ok) {
      console.error(`page ${page}: HTTP ${res.status} — stopping`)
      break
    }
    const html = await res.text()
    const listing = parseListingPage(html)
    console.error(
      `page ${listing.currentPage}/${listing.lastPage}: ${listing.items.length} tipsters (total ${listing.total})`,
    )
    for (const item of listing.items) {
      if (seen.has(item.platformId)) continue
      seen.add(item.platformId)
      lines.push(JSON.stringify(item))
    }
    if (page < pages) await new Promise((r) => setTimeout(r, DELAY_MS))
  }

  if (out) {
    writeFileSync(out, lines.join('\n') + (lines.length ? '\n' : ''))
    console.error(`wrote ${lines.length} records to ${out}`)
  } else {
    process.stdout.write(lines.join('\n') + '\n')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
