import { db } from './db'
import { tipsters } from './db/schema'
import { and, gte, isNotNull, eq, sql, count } from 'drizzle-orm'
const now = new Date()
const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())

// cuántos tienen lastPickAt != null
const [a] = await db.select({ n: count() }).from(tipsters).where(isNotNull(tipsters.lastPickAt))
console.log('Con lastPickAt:', a.n)

// cuántos free
const [b] = await db.select({ n: count() }).from(tipsters).where(eq(tipsters.isPaid, false))
console.log('Free:', b.n)

// cuántos free con lastPickAt reciente
const [c] = await db.select({ n: count() }).from(tipsters).where(and(
  eq(tipsters.isPaid, false),
  isNotNull(tipsters.lastPickAt),
  gte(tipsters.lastPickAt, oneMonthAgo)
))
console.log('Free + activo último mes:', c.n)

// cuántos free + activo + 500 picks
const [d] = await db.select({ n: count() }).from(tipsters).where(and(
  eq(tipsters.isPaid, false),
  isNotNull(tipsters.lastPickAt),
  gte(tipsters.lastPickAt, oneMonthAgo),
  gte(tipsters.picks, 500)
))
console.log('Free + activo + 500 picks:', d.n)

// almadawirtz
const r = await db.select({ slug: tipsters.slug, isPaid: tipsters.isPaid, picks: tipsters.picks, yld: tipsters.yield, lastPickAt: tipsters.lastPickAt })
  .from(tipsters).where(eq(tipsters.slug, 'almadawirtz'))
console.log('almadawirtz:', r[0] ?? 'NOT FOUND')

process.exit(0)
