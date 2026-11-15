import { describe, it, expect } from 'vitest'
import { parseDiscoverPage, parseBreakdownTable } from '@/crawler/platforms/tipstrr/parse'
import { evaluateMys } from '@/crawler/platforms/mys'

// FABRICATED fixtures. These HTML fragments are invented for tests: fictional
// tipsters ("Demo Rovers Tips", "Fake Gallop") with synthetic numbers that
// only mimic the STRUCTURE observed on tipstrr.com. They are not captured
// data and must never be presented as real platform figures.

const DISCOVER_HTML = `
<ul>
  <li>
    <a href="https://tipstrr.com/tipster/demo-rovers-tips">Demo Rovers Tips</a>
    <dl><dt>ROI</dt><dd>14.20%</dd></dl>
    <dl><dt>Avg. odds</dt><dd>2.85</dd></dl>
    <dl><dt>Avg. Tips/week</dt><dd>9</dd></dl>
    <dl><dt>Win rate</dt><dd>41%</dd></dl>
    <dl><dt>Profit</dt><dd>£1,234.50</dd></dl>
  </li>
  <li>
    <a href="https://tipstrr.com/tipster/fake-gallop">Fake Gallop</a>
    <dl><dt>ROI</dt><dd>-3.4%</dd></dl>
    <dl><dt>Avg. odds</dt><dd>7.10</dd></dl>
    <dl><dt>Avg. Tips/week</dt><dd>4</dd></dl>
    <dl><dt>Win rate</dt><dd>22%</dd></dl>
    <dl><dt>Profit</dt><dd>-£89.10</dd></dl>
  </li>
</ul>`

const STATS_TABLE_HTML = `
<h2 id="sports">What sports betting tips does Demo Rovers Tips provide?</h2>
<table>
  <thead><tr><th>Sport</th><th>Tips</th><th>Win rate</th><th>Profit</th><th>ROI</th><th>Avg. odds</th></tr></thead>
  <tbody>
    <tr><td>Football</td><td>132</td><td>41%</td><td>£980.00</td><td>14.2%</td><td>2.85</td></tr>
    <tr><td>Tennis</td><td>40</td><td>55%</td><td>£254.50</td><td>8.1%</td><td>1.95</td></tr>
  </tbody>
</table>`

describe('parseDiscoverPage (fabricated fixtures)', () => {
  it('extracts cards with their displayed metrics', () => {
    const items = parseDiscoverPage(DISCOVER_HTML)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      platform: 'tipstrr',
      slug: 'demo-rovers-tips',
      name: 'Demo Rovers Tips',
      profileUrl: 'https://tipstrr.com/tipster/demo-rovers-tips',
      roiPct: 14.2,
      avgOdds: 2.85,
      avgTipsPerWeek: 9,
      winRatePct: 41,
      profitLabel: '£1,234.50',
    })
    expect(items[1].roiPct).toBe(-3.4)
  })

  it('ignores list items without a tipster link', () => {
    expect(parseDiscoverPage('<ul><li>no link here</li></ul>')).toHaveLength(0)
  })
})

describe('parseBreakdownTable (fabricated fixtures)', () => {
  it('reads per-sport rows with sample size and ROI from the same sample', () => {
    const rows = parseBreakdownTable(STATS_TABLE_HTML, 'sport')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ label: 'Football', tips: 132, roiPct: 14.2 })
    expect(rows[1]).toMatchObject({ label: 'Tennis', tips: 40, roiPct: 8.1 })
  })

  it('MYS per sport: football passes MY, tennis fails muestra', () => {
    const rows = parseBreakdownTable(STATS_TABLE_HTML, 'sport')
    const football = rows.find((r) => r.label === 'Football')!
    const tennis = rows.find((r) => r.label === 'Tennis')!
    expect(evaluateMys({ picks: football.tips, yieldPct: football.roiPct }).passesMY).toBe(true)
    expect(evaluateMys({ picks: tennis.tips, yieldPct: tennis.roiPct }).passesMY).toBe(false)
  })
})
