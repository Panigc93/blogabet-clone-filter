// One-off local check: run the Tipstrr parsers over a captured live page
// bundle (not committed). Usage: npx tsx scripts/ficha-statmind.ts <page.html>
import { readFileSync } from 'node:fs'
import { parseOverview, parseStakeBands, parseMonthlyBreakdown, computePeriodStats, parseProfileHeader, assessTipstrrMys } from '../crawler/platforms/tipstrr/stats-state'
const html = readFileSync(process.argv[2], 'utf8')
const o = parseOverview(html)!
const bands = parseStakeBands(html)
const months = parseMonthlyBreakdown(html)
const header = parseProfileHeader(html)
const period = computePeriodStats(months, new Date('2026-11-15T12:00:00Z'))
const mys = assessTipstrrMys(o, bands)
console.log(JSON.stringify({ header, overview: o, bands, months, period, mys }, null, 1))
