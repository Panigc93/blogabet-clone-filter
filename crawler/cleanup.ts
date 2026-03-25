import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { tipsters } from '../db/schema'
import { lt, or, isNull } from 'drizzle-orm'
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

async function run() {
  const db = drizzle(neon(process.env.DATABASE_URL_DIRECT!), { schema: { tipsters } })
  const oneMonthAgo = new Date()
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
  console.log(`Nulling stats for tipsters with lastPickAt < ${oneMonthAgo.toISOString()}...`)

  await db.update(tipsters)
    .set({ yield3m: null, yield6m: null, yield12m: null, picks6mAvg: null,
           picksFree3mAvg: null, yieldFree3m: null, statsUpdatedAt: null })
    .where(or(isNull(tipsters.lastPickAt), lt(tipsters.lastPickAt, oneMonthAgo)))

  console.log('Done.')
}

run().catch(e => { console.error(e); process.exit(1) })
