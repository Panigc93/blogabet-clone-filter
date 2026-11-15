import { pgTable, integer, text, boolean, numeric, smallint, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const tipsters = pgTable('tipsters', {
  id:          integer('id').primaryKey(),
  platform:    text('platform').notNull().default('blogabet'), // 'blogabet' | 'tipstrr' | ...
  slug:        text('slug').notNull(), // unique PER PLATFORM (ux_tipsters_platform_slug); a Tipstrr slug may collide with a BB one
  name:        text('name').notNull(),
  // Money semantics: `profit`/`price` are only comparable within the same
  // unit. BB stores EUR; Tipstrr stores UNITS (its "10/10" scale) and its
  // subscription price is GBP. Queries must not mix units (lib/query.ts).
  profitUnit:  text('profit_unit').notNull().default('eur'), // 'eur' | 'units'
  priceCurrency: text('price_currency').notNull().default('eur'), // 'eur' | 'gbp'
  avatarUrl:   text('avatar_url'),
  flagUrl:     text('flag_url'),
  countryCode: text('country_code'),
  isPaid:      boolean('is_paid').notNull().default(false),
  price:       numeric('price', { precision: 8, scale: 2 }),
  sinceYear:   smallint('since_year'),
  picks:       integer('picks').notNull().default(0),
  profit:      numeric('profit', { precision: 12, scale: 3 }), // scale 3: Tipstrr units carry 3 decimals (361.815); widening is lossless for BB EUR
  yield:       numeric('yield', { precision: 6, scale: 2 }),
  verifiedPct: numeric('verified_pct', { precision: 5, scale: 2 }),
  isVerified:  boolean('is_verified').notNull().default(false),
  followers:   integer('followers'), // null when the source does not expose it (never 0-as-absence)
  lastPickAt:     timestamp('last_pick_at', { withTimezone: true }),
  signupAt:       timestamp('signup_at', { withTimezone: true }), // account creation when the source exposes it (Tipstrr); BB keeps sinceYear
  capturedAt:     timestamp('captured_at', { withTimezone: true }), // snapshot instant for capture-based sources; null for live-crawled BB
  resetCount:     smallint('reset_count').notNull().default(0),
  lastResetAt:    timestamp('last_reset_at', { withTimezone: true }),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  // Per-tipster statistics fetched from {slug}.blogabet.com/blog/stats
  picks6mAvg:      numeric('picks_6m_avg', { precision: 7, scale: 2 }),
  yield3m:         numeric('yield_3m', { precision: 6, scale: 2 }),
  yield6m:         numeric('yield_6m', { precision: 6, scale: 2 }),
  yield12m:        numeric('yield_12m', { precision: 6, scale: 2 }),
  // Free picks stats for paid tipsters (alltime - paid per month)
  picksFree3mAvg:  numeric('picks_free_3m_avg', { precision: 7, scale: 2 }),
  yieldFree3m:     numeric('yield_free_3m', { precision: 6, scale: 2 }),
  statsUpdatedAt:  timestamp('stats_updated_at', { withTimezone: true }),
}, (t) => ({
  platformSlugUnique: uniqueIndex('ux_tipsters_platform_slug').on(t.platform, t.slug),
  platformIdx:   index('idx_tipsters_platform').on(t.platform),
  yieldIdx:      index('idx_tipsters_yield').on(t.yield),
  yield6mIdx:    index('idx_tipsters_yield_6m').on(t.yield6m),
  picks6mAvgIdx: index('idx_tipsters_picks_6m_avg').on(t.picks6mAvg),
  profitIdx:     index('idx_tipsters_profit').on(t.profit),
  picksIdx:      index('idx_tipsters_picks').on(t.picks),
  followersIdx:  index('idx_tipsters_followers').on(t.followers),
  sinceYearIdx:  index('idx_tipsters_since_year').on(t.sinceYear),
  lastPickIdx:   index('idx_tipsters_last_pick_at').on(t.lastPickAt),
  isPaidIdx:     index('idx_tipsters_is_paid').on(t.isPaid),
}))

export type Tipster = typeof tipsters.$inferSelect
export type TipsterInsert = typeof tipsters.$inferInsert
