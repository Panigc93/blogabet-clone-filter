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
    if (process.env.USE_PGLITE === '1') {
      // Entorno aislado local: Postgres en proceso (PGlite) para validar la
      // integración sin tocar Neon. Solo cuando USE_PGLITE=1; nunca en prod.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PGlite } = require('@electric-sql/pglite')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { drizzle: drizzlePglite } = require('drizzle-orm/pglite')
      cached = drizzlePglite(new PGlite(process.env.PGLITE_DIR || '/tmp/pglite-data'), { schema }) as unknown as NeonHttpDatabase<typeof schema>
    } else {
      if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
      // cache: 'no-store' — Next.js patches fetch and would otherwise serve
      // STALE query results from Vercel's Data Cache, which is shared across
      // deployments of the project. Observed 2026-11-15: the combined-view
      // count(*) (identical SQL text to the pre-multiplatform homepage) came
      // back from a cache entry written by a morning deployment (11160 vs the
      // real 11265). Every page of this app is DB-driven; cached SQL is never
      // what we want.
      cached = drizzle(neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } }), { schema })
    }
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
