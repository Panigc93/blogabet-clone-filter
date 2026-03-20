import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

// Pooled HTTP connection — for Next.js serverless functions
const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })

// Direct connection — for crawler (long-lived Node process)
// Used by crawler/crawl.ts via DATABASE_URL_DIRECT
