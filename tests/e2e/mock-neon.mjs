// Mock of the Neon HTTP /sql endpoint with a small fixture dataset.
// Evaluates the exact drizzle SQL shapes used by the app (listing, count, compare).
import http from 'node:http'

const now = new Date('2026-10-25T00:00:00Z')
const iso = d => d.toISOString()
const daysAgo = n => new Date(now.getTime() - n * 864e5)
const monthsAgo = n => new Date(now.getFullYear(), now.getMonth() - n, now.getDate())

const F = [
  { id: 1, slug: 'alpha-free', name: 'Alpha Free', is_paid: false, price: null, since_year: 2015, picks: 1500, profit: '3200.00', yield: '12.50', verified_pct: '97.00', is_verified: true, followers: 300, picks_6m_avg: '22.00', yield_3m: '9.10', yield_6m: '10.20', yield_12m: '11.00', picks_free_3m_avg: null, yield_free_3m: null, reset_count: 0, last_reset_at: null },
  { id: 2, slug: 'beta-free', name: 'Beta Free', is_paid: false, price: null, since_year: 2020, picks: 80, profit: '150.00', yield: '15.00', verified_pct: '90.00', is_verified: false, followers: 45, picks_6m_avg: '12.00', yield_3m: '14.00', yield_6m: '15.00', yield_12m: null, picks_free_3m_avg: null, yield_free_3m: null, reset_count: 0, last_reset_at: null },
  { id: 3, slug: 'gamma-paid', name: 'Gamma Paid', is_paid: true, price: '29.99', since_year: 2018, picks: 3000, profit: '5400.00', yield: '8.00', verified_pct: '99.00', is_verified: true, followers: 800, picks_6m_avg: '35.00', yield_3m: '6.00', yield_6m: '7.50', yield_12m: '8.10', picks_free_3m_avg: '5.00', yield_free_3m: '3.20', reset_count: 1, last_reset_at: iso(monthsAgo(2)) },
  { id: 4, slug: 'delta-paid', name: 'Delta Paid', is_paid: true, price: '9.99', since_year: 2023, picks: 200, profit: '-300.00', yield: '-4.00', verified_pct: '85.00', is_verified: false, followers: 60, picks_6m_avg: '18.00', yield_3m: '-5.00', yield_6m: '-4.50', yield_12m: '-4.00', picks_free_3m_avg: null, yield_free_3m: null, reset_count: 0, last_reset_at: null },
  { id: 5, slug: 'epsilon-free', name: 'Epsilon Free', is_paid: false, price: null, since_year: 2019, picks: 120, profit: '640.00', yield: '11.00', verified_pct: '96.00', is_verified: true, followers: 120, picks_6m_avg: '10.00', yield_3m: '10.00', yield_6m: '11.00', yield_12m: '11.00', picks_free_3m_avg: null, yield_free_3m: null, reset_count: 0, last_reset_at: null },
  { id: 6, slug: 'zeta-free', name: 'Zeta Free', is_paid: false, price: null, since_year: 2024, picks: 99, profit: '500.00', yield: '20.00', verified_pct: '88.00', is_verified: false, followers: 30, picks_6m_avg: '16.00', yield_3m: '22.00', yield_6m: '20.00', yield_12m: null, picks_free_3m_avg: null, yield_free_3m: null, reset_count: 0, last_reset_at: null },
  { id: 7, slug: 'eta-paid', name: 'Eta Paid', is_paid: true, price: '49.00', since_year: 2016, picks: 500, profit: '2100.00', yield: '22.00', verified_pct: '93.00', is_verified: true, followers: 410, picks_6m_avg: '8.00', yield_3m: '18.00', yield_6m: '20.00', yield_12m: '21.00', picks_free_3m_avg: '2.00', yield_free_3m: '5.00', reset_count: 2, last_reset_at: iso(monthsAgo(8)) },
  { id: 8, slug: 'theta-free', name: 'Theta Free', is_paid: false, price: null, since_year: 2017, picks: 2000, profit: '-900.00', yield: '-1.50', verified_pct: '91.00', is_verified: true, followers: 210, picks_6m_avg: '30.00', yield_3m: '-2.00', yield_6m: '-1.80', yield_12m: '-1.60', picks_free_3m_avg: null, yield_free_3m: null, reset_count: 0, last_reset_at: null },
  { id: 9, slug: 'iota-paid', name: 'Iota Paid', is_paid: true, price: '15.00', since_year: 2021, picks: 640, profit: '700.00', yield: '6.50', verified_pct: '95.00', is_verified: true, followers: 150, picks_6m_avg: '21.00', yield_3m: '6.00', yield_6m: '6.40', yield_12m: '6.50', picks_free_3m_avg: '1.00', yield_free_3m: '1.50', reset_count: 0, last_reset_at: null },
  { id: 10, slug: 'kappa-free', name: 'Kappa Free', is_paid: false, price: null, since_year: 2022, picks: 300, profit: '410.00', yield: '9.90', verified_pct: null, is_verified: false, followers: 75, picks_6m_avg: null, yield_3m: null, yield_6m: null, yield_12m: null, picks_free_3m_avg: null, yield_free_3m: null, reset_count: 0, last_reset_at: null },
  { id: 11, slug: 'lopez-free', name: 'López, "El" Mejor', is_paid: false, price: null, since_year: 2014, picks: 110, profit: '380.00', yield: '11.50', verified_pct: '99.50', is_verified: true, followers: 500, picks_6m_avg: '9.00', yield_3m: '12.00', yield_6m: '11.50', yield_12m: '11.50', picks_free_3m_avg: null, yield_free_3m: null, reset_count: 0, last_reset_at: null },
]

const COLS = ['id','slug','name','avatar_url','flag_url','country_code','is_paid','price','since_year','picks','profit','yield','verified_pct','is_verified','followers','last_pick_at','reset_count','last_reset_at','updated_at','picks_6m_avg','yield_3m','yield_6m','yield_12m','picks_free_3m_avg','yield_free_3m','stats_updated_at']
const INT_COLS = new Set(['id','since_year','picks','followers','reset_count'])
const BOOL_COLS = new Set(['is_paid','is_verified'])
const TS_COLS = new Set(['last_pick_at','last_reset_at','updated_at','stats_updated_at'])
const NUMERIC_COLS = new Set(['price','profit','yield','verified_pct','picks_6m_avg','yield_3m','yield_6m','yield_12m','picks_free_3m_avg','yield_free_3m'])
function oidOf(col) {
  if (BOOL_COLS.has(col)) return 16
  if (INT_COLS.has(col)) return 23
  if (TS_COLS.has(col)) return 1184
  if (NUMERIC_COLS.has(col)) return 1700
  return 25
}

function fullRow(f) {
  const r = { avatar_url: null, flag_url: null, country_code: null, last_pick_at: iso(daysAgo(3)), updated_at: iso(now), stats_updated_at: f.picks_6m_avg != null ? iso(daysAgo(1)) : null, ...f }
  return r
}

let DATA = F.map(fullRow)
if (process.env.MOCK_BIG === '1') {
  const gen = []
  for (let i = 0; i < 1200; i++) {
    gen.push(fullRow({
      id: 100 + i,
      slug: `gen-${String(i).padStart(4, '0')}`,
      name: i === 5 ? '=HYPERLINK("http://evil.example","x")' : `Generado Con Un Nombre Bastante Largo ${i}`,
      is_paid: i % 5 === 0,
      price: i % 5 === 0 ? '19.99' : null,
      since_year: 2010 + (i % 15),
      picks: 50 + i,
      profit: String((i * 3 - 100) .toFixed(2)),
      yield: i === 5 ? '99.00' : String(((i % 40) - 10).toFixed(2)),
      verified_pct: String((70 + (i % 30)).toFixed(2)),
      is_verified: i % 2 === 0,
      followers: i,
      picks_6m_avg: '10.00', yield_3m: '5.00', yield_6m: '6.00', yield_12m: '7.00',
      picks_free_3m_avg: null, yield_free_3m: null, reset_count: 0, last_reset_at: null,
    }))
  }
  DATA = DATA.concat(gen)
}

function applyWhere(rows, query, params) {
  const m = query.match(/ where (.*?)(?: order by | limit |$)/s)
  if (!m) return rows
  const w = m[1]
  const p = i => params[i - 1]
  let out = rows

  const ilike = w.match(/"tipsters"\."name" ilike \$(\d+)/)
  if (ilike) {
    const term = String(p(+ilike[1])).replace(/%/g, '').toLowerCase()
    out = out.filter(r => r.name.toLowerCase().includes(term) || r.slug.toLowerCase().includes(term))
  }
  for (const mm of w.matchAll(/"tipsters"\."(is_paid|is_verified)" = \$(\d+)/g)) {
    const val = p(+mm[2]) === true || p(+mm[2]) === 'true'
    out = out.filter(r => r[mm[1]] === val)
  }
  for (const mm of w.matchAll(/"tipsters"\."(yield|picks|price|since_year|picks_free_3m_avg)" (>=|<=|>) \$(\d+)/g)) {
    const [, col, op, pi] = mm
    const val = Number(p(+pi))
    out = out.filter(r => {
      const rv = r[col]
      if (rv == null) return false
      const n = Number(rv)
      return op === '>=' ? n >= val : op === '<=' ? n <= val : n > val
    })
  }
  if (/"tipsters"\."picks_free_3m_avg" is not null/i.test(w)) {
    out = out.filter(r => r.picks_free_3m_avg != null)
  }
  if (/last_reset_at" IS NULL OR "tipsters"\."last_reset_at" </.test(w)) {
    out = out.filter(r => r.last_reset_at == null || new Date(r.last_reset_at) < monthsAgo(6))
  }
  if (/last_pick_at" >= NOW\(\) - make_interval\(months => \$(\d+)\)/.test(w)) {
    const months = Number(p(+w.match(/make_interval\(months => \$(\d+)\)/)[1]))
    out = out.filter(r => r.last_pick_at != null && new Date(r.last_pick_at) >= monthsAgo(months))
  }
  const inM = w.match(/"tipsters"\."slug" in \(([^)]+)\)/)
  if (inM) {
    const slugs = inM[1].match(/\$(\d+)/g).map(s => p(+s.slice(1)))
    out = out.filter(r => slugs.includes(r.slug))
  }
  return out
}

function applyOrder(rows, query) {
  const m = query.match(/ order by (.*?)(?: limit |$)/s)
  if (!m) return rows
  const parts = [...m[1].matchAll(/"tipsters"\."(\w+)" (ASC|DESC)/g)]
  const sorted = [...rows]
  sorted.sort((a, b) => {
    for (const [, col, dir] of parts) {
      const av = a[col], bv = b[col]
      if (av == null && bv == null) continue
      if (av == null) return 1   // NULLS LAST
      if (bv == null) return -1
      const an = Number(av), bn = Number(bv)
      const cmp = (isNaN(an) || isNaN(bn)) ? String(av).localeCompare(String(bv)) : an - bn
      if (cmp !== 0) return dir === 'ASC' ? cmp : -cmp
    }
    return 0
  })
  return sorted
}

function applyLimitOffset(rows, query, params) {
  const lm = query.match(/ limit (?:\$(\d+)|(\d+))(?: offset (?:\$(\d+)|(\d+)))?/)
  if (!lm) return rows
  const limit = Number(lm[1] ? params[+lm[1] - 1] : lm[2])
  const offset = lm[3] || lm[4] ? Number(lm[3] ? params[+lm[3] - 1] : lm[4]) : 0
  return rows.slice(offset, offset + limit)
}

function toPg(row, col) {
  const v = row[col]
  if (v == null) return null
  if (INT_COLS.has(col)) return Number(v)
  if (BOOL_COLS.has(col)) return v ? 't' : 'f'
  return v
}

const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', c => body += c)
  req.on('end', () => {
    try {
      const { query, params = [] } = JSON.parse(body)
      console.log('SQL>', query.replace(/\s+/g, ' ').slice(0, 220), 'PARAMS', JSON.stringify(params))
      const isCount = /select count\(\*\)/.test(query)
      let rows = applyWhere(DATA, query, params)
      rows = applyOrder(rows, query)
      if (isCount) {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ command: 'SELECT', rowCount: 1, rows: [[rows.length]], fields: [{ name: 'count', dataTypeID: 20 }] }))
        return
      }
      rows = applyLimitOffset(rows, query, params)
      const out = rows.map(r => COLS.map(c => toPg(r, c)))
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ command: 'SELECT', rowCount: out.length, rows: out, fields: COLS.map(c => ({ name: c, dataTypeID: oidOf(c) })) }))
    } catch (e) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: String(e) }))
    }
  })
})
const PORT = Number(process.env.MOCK_PORT ?? 4400)
server.listen(PORT, () => console.log(`mock-neon on :${PORT}`))
