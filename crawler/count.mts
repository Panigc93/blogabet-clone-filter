import { readFileSync, existsSync } from 'fs'
const envPath = new URL('../.env.local', import.meta.url).pathname
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const eq = line.indexOf('=')
    if (eq > 0 && !line.startsWith('#')) {
      const key = line.slice(0, eq).trim(); const val = line.slice(eq + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  }
}
import { neon } from '@neondatabase/serverless'
const sql = neon(process.env.DATABASE_URL_DIRECT!)
const now = new Date()
const t12 = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate())
const t1  = new Date(now.getFullYear(), now.getMonth() - 1,  now.getDate())
const [r1] = await sql`SELECT count(*) FROM tipsters WHERE is_paid=true AND last_pick_at >= ${t12}`
const [r2] = await sql`SELECT count(*) FROM tipsters WHERE is_paid=true AND last_pick_at >= ${t1}`
const [r3] = await sql`SELECT count(*) FROM tipsters WHERE is_paid=true`
const [r4] = await sql`SELECT count(*) FROM tipsters WHERE is_paid=true AND stats_updated_at IS NOT NULL`
console.log('Pago total:', r3.count)
console.log('Activos 12m:', r1.count, '<- crawlearíamos con el nuevo filtro')
console.log('Activos 1m: ', r2.count, '<- filtro anterior')
console.log('Ya tienen stats:', r4.count, '<- stats existentes que pueden ser incorrectos')
