import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

// Pooled HTTP connection — for Next.js serverless functions.
// Lazy: neon() validates the connection-string format at construction, which
// made `next build` fail in environments without DATABASE_URL (e.g. isolated
// previews). Defer construction until the first actual query; a request that
// hits the DB without DATABASE_URL still fails loudly at request time.
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'

let cached: NeonHttpDatabase<typeof schema> | null = null

function getDb(): NeonHttpDatabase<typeof schema> {
  if (!cached) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
    cached = drizzle(neon(process.env.DATABASE_URL), { schema })
  }
  return cached
}

export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop) {
    const real = getDb()
    const v = real[prop as keyof NeonHttpDatabase<typeof schema>]
    return typeof v === 'function' ? (v as (...args: unknown[]) => unknown).bind(real) : v
  },
})

// Direct connection — for crawler (long-lived Node process)
// Used by crawler/crawl.ts via DATABASE_URL_DIRECT
