import { neon } from '@neondatabase/serverless'
import { readFileSync, existsSync } from 'fs'

const envPath = new URL('../.env.local', import.meta.url).pathname
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const eq = line.indexOf('=')
    if (eq > 0 && !line.startsWith('#')) {
      const key = line.slice(0, eq).trim()
      const val = line.slice(eq + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  }
}

async function main() {
  const slug = process.argv[2]
  if (!slug) { console.error('Usage: tsx check-tipster.ts <slug>'); process.exit(1) }
  const dbUrl = process.env.DATABASE_URL_DIRECT
  if (!dbUrl) throw new Error('DATABASE_URL_DIRECT no encontrado')
  const sql = neon(dbUrl)
  const res = await sql`SELECT id, slug, name, last_pick_at, is_paid, yield_3m, yield_6m, yield_12m, picks_6m_avg, stats_updated_at FROM tipsters WHERE slug ILIKE ${'%' + slug + '%'} LIMIT 5`
  if (res.length === 0) { console.log('No encontrado'); return }
  for (const r of res) {
    console.log(JSON.stringify(r, null, 2))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
