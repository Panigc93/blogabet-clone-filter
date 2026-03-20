import { pgTable, integer, text, boolean, numeric, smallint, timestamp, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const tipsters = pgTable('tipsters', {
  id:          integer('id').primaryKey(),
  slug:        text('slug').notNull().unique(),
  name:        text('name').notNull(),
  avatarUrl:   text('avatar_url'),
  flagUrl:     text('flag_url'),
  countryCode: text('country_code'),
  isPaid:      boolean('is_paid').notNull().default(false),
  price:       numeric('price', { precision: 8, scale: 2 }),
  sinceYear:   smallint('since_year'),
  picks:       integer('picks').notNull().default(0),
  profit:      numeric('profit', { precision: 10, scale: 2 }),
  yield:       numeric('yield', { precision: 6, scale: 2 }),
  verifiedPct: numeric('verified_pct', { precision: 5, scale: 2 }),
  followers:   integer('followers').notNull().default(0),
  lastPickAt:  timestamp('last_pick_at', { withTimezone: true }),
  resetCount:  smallint('reset_count').notNull().default(0),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().default(sql`NOW()`),
}, (t) => ({
  yieldIdx:      index('idx_tipsters_yield').on(t.yield),
  profitIdx:     index('idx_tipsters_profit').on(t.profit),
  picksIdx:      index('idx_tipsters_picks').on(t.picks),
  followersIdx:  index('idx_tipsters_followers').on(t.followers),
  sinceYearIdx:  index('idx_tipsters_since_year').on(t.sinceYear),
  lastPickIdx:   index('idx_tipsters_last_pick_at').on(t.lastPickAt),
  isPaidIdx:     index('idx_tipsters_is_paid').on(t.isPaid),
}))

export type Tipster = typeof tipsters.$inferSelect
export type TipsterInsert = typeof tipsters.$inferInsert
