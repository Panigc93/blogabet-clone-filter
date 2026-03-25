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
  const dbUrl = process.env.DATABASE_URL_DIRECT
  if (!dbUrl) throw new Error('DATABASE_URL_DIRECT no encontrado')
  const sql = neon(dbUrl)
  const res = await sql`
    SELECT
      COUNT(*) FILTER (WHERE last_pick_at >= NOW() - INTERVAL '1 month' AND yield_6m IS NOT NULL) as activos_con_yield6m,
      COUNT(*) FILTER (WHERE last_pick_at >= NOW() - INTERVAL '1 month' AND yield_6m IS NULL) as activos_sin_yield6m,
      COUNT(*) FILTER (WHERE (last_pick_at IS NULL OR last_pick_at < NOW() - INTERVAL '1 month') AND yield_6m IS NOT NULL) as inactivos_con_yield6m
    FROM tipsters
  `
  console.log(res[0])
}

main().catch(e => { console.error(e); process.exit(1) })
