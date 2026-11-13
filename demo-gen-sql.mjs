// Genera db/demo-sql.ts: DDL + seed sintetico determinista para la rama demo
import { writeFileSync } from 'fs'
import { readFileSync } from 'fs'

const REPO = new URL('.', import.meta.url).pathname

// PRNG determinista (mulberry32) para que el demo sea identico en cada build
let s = 42
const rand = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const rnd = (a, b) => a + rand() * (b - a)
const ri = (a, b) => Math.floor(rnd(a, b + 1))
const pick = (arr) => arr[ri(0, arr.length - 1)]
const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString()

const NOMBRES = ['Toro','Lince','Cobra','Halcon','Bizon','Puma','Condor','Jabali','Lechuza','Galgo','Mustang','Orca','Dragon','Fenix','Bufalo','Coyote','Aguila','Pantera','Lobo','Chacal','Vibora','Buitre','Tigre','Zorro']
const APELLIDOS = ['Picks','Bets','Value','Stats','Cuotas','Trading','Tips','Analisis','Pro','Gold','Prime','Lab']
const PAISES = ['ES','GB','DE','IT','FR','PT','AR','MX','BR','NL']

const rows = []
let id = 1
const used = new Set()
function mkName() { let n; do { n = `${pick(NOMBRES)}${pick(APELLIDOS)}${ri(1, 999)}` } while (used.has(n)); used.add(n); return n }
function addRow(o) {
  rows.push({
    id: id++, slug: o.name.toLowerCase(), name: o.name,
    country_code: pick(PAISES), is_paid: o.isPaid ?? false,
    price: o.isPaid ? rnd(9, 79).toFixed(2) : null,
    since_year: o.sinceYear ?? ri(2015, 2024),
    picks: o.picks, profit: o.profit?.toFixed(2) ?? null, yield: o.yield?.toFixed(2) ?? null,
    verified_pct: o.verifiedPct?.toFixed(2) ?? rnd(85, 100).toFixed(2),
    is_verified: o.isVerified ?? false, followers: o.followers ?? ri(5, 4000),
    last_pick_at: daysAgo(o.lastPickDaysAgo ?? ri(0, 30)),
    reset_count: o.resetCount ?? 0, last_reset_at: o.resetCount ? daysAgo(ri(60, 400)) : null,
    picks_6m_avg: o.picks6mAvg?.toFixed(2) ?? null,
    yield_3m: o.yield3m?.toFixed(2) ?? null, yield_6m: o.yield6m?.toFixed(2) ?? null, yield_12m: o.yield12m?.toFixed(2) ?? null,
    picks_free_3m_avg: o.picksFree3mAvg?.toFixed(2) ?? null, yield_free_3m: o.yieldFree3m?.toFixed(2) ?? null,
    stats_updated_at: daysAgo(ri(0, 2)),
  })
}
for (let i = 0; i < 15; i++) { const y = rnd(11.5, 24), p = ri(600, 2400)
  addRow({ name: mkName(), picks: p, yield: y, profit: +(p * y / 100 * rnd(0.8, 1.2)).toFixed(0), lastPickDaysAgo: ri(0, 2), picks6mAvg: rnd(28, 90), yield3m: rnd(8, 22), yield6m: y + rnd(-3, 3), yield12m: y + rnd(-4, 4), isVerified: i % 3 === 0, verifiedPct: rnd(90, 100), followers: ri(200, 5000) }) }
for (let i = 0; i < 25; i++) { const y = rnd(2, 11), p = ri(150, 900)
  addRow({ name: mkName(), picks: p, yield: y, profit: +(p * y / 100).toFixed(0), lastPickDaysAgo: ri(0, 10), picks6mAvg: rnd(8, 30), yield3m: y + rnd(-5, 5), yield6m: y + rnd(-3, 3), yield12m: y + rnd(-4, 4), isVerified: rand() < 0.2 }) }
for (let i = 0; i < 20; i++) { const y = rnd(3, 18), p = ri(300, 3000)
  addRow({ name: mkName(), isPaid: true, picks: p, yield: y, profit: +(p * y / 100).toFixed(0), lastPickDaysAgo: ri(0, 5), picks6mAvg: rnd(10, 60), yield3m: y + rnd(-4, 4), yield6m: y + rnd(-3, 3), yield12m: y + rnd(-4, 4), picksFree3mAvg: rnd(0, 6), yieldFree3m: rnd(-10, 15), isVerified: rand() < 0.4, followers: ri(500, 9000) }) }
for (let i = 0; i < 20; i++) { const y = rnd(-5, 12), p = ri(100, 2000)
  addRow({ name: mkName(), isPaid: rand() < 0.3, picks: p, yield: y, profit: +(p * y / 100).toFixed(0), lastPickDaysAgo: ri(45, 300), picks6mAvg: rnd(0, 3), yield6m: y + rnd(-4, 4), yield12m: y + rnd(-4, 4), resetCount: rand() < 0.3 ? ri(1, 3) : 0 }) }
for (let i = 0; i < 20; i++) { const y = rnd(-20, 40), p = ri(5, 90)
  addRow({ name: mkName(), picks: p, yield: y, profit: +(p * y / 100).toFixed(0), lastPickDaysAgo: ri(0, 20), picks6mAvg: rnd(2, 15), yield3m: y + rnd(-6, 6), sinceYear: ri(2024, 2026) }) }
for (let i = 0; i < 10; i++) { const y = rnd(-15, -1), p = ri(200, 1500)
  addRow({ name: mkName(), isPaid: rand() < 0.5, picks: p, yield: y, profit: +(p * y / 100).toFixed(0), lastPickDaysAgo: ri(0, 15), picks6mAvg: rnd(5, 25), yield3m: y + rnd(-3, 3), yield6m: y + rnd(-3, 3), yield12m: y + rnd(-3, 3) }) }

const ddl = [
  readFileSync(`${REPO}/drizzle/0000_sudden_jazinda.sql`, 'utf8'),
  readFileSync(`${REPO}/drizzle/0001_add_last_reset_at.sql`, 'utf8'),
  readFileSync(`${REPO}/drizzle/0002_add_is_verified.sql`, 'utf8'),
  `ALTER TABLE "tipsters" ADD COLUMN IF NOT EXISTS "picks_6m_avg" numeric(7,2), ADD COLUMN IF NOT EXISTS "yield_3m" numeric(6,2), ADD COLUMN IF NOT EXISTS "yield_6m" numeric(6,2), ADD COLUMN IF NOT EXISTS "yield_12m" numeric(6,2), ADD COLUMN IF NOT EXISTS "picks_free_3m_avg" numeric(7,2), ADD COLUMN IF NOT EXISTS "yield_free_3m" numeric(6,2), ADD COLUMN IF NOT EXISTS "stats_updated_at" timestamp with time zone;`,
].join('\n').replace(/--> statement-breakpoint/g, '')

const cols = Object.keys(rows[0])
const esc = (v) => v === null || v === undefined ? 'NULL' : typeof v === 'boolean' ? (v ? 'true' : 'false') : typeof v === 'number' ? String(v) : `'${String(v).replaceAll("'", "''")}'`
const inserts = rows.map(r => `INSERT INTO tipsters (${cols.map(c => `"${c}"`).join(',')}) VALUES (${cols.map(c => esc(r[c])).join(',')});`).join('\n')

const sql = ddl + '\n' + inserts
writeFileSync(`${REPO}/db/demo-sql.ts`, `// GENERADO por demo-gen-sql.mjs (rama demo, datos 100% sinteticos)\nexport const DEMO_SQL = ${JSON.stringify(sql)}\n`)
console.log('rows:', rows.length, 'bytes:', sql.length)
