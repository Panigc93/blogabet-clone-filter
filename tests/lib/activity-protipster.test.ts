import { describe, expect, it } from 'vitest'
import { activityCondition } from '@/lib/activity-query'
import { PgDialect } from 'drizzle-orm/pg-core'

// ProTipster activity evidence = its captured yield windows (same shape as
// Apuestes): 3m/6m are the site's rolling windows at capture, 12m the 12
// complete calendar months before capture (user-approved 2026-11-20). The
// import stores NULL for a window with 0 picks or a held capture, so a
// non-NULL yield column means picks inside that exact window.
describe('ProTipster activity maps to its captured 3/6/12-month windows', () => {
  const dialect = new PgDialect()
  it('matches each exact window on its own non-NULL yield column', () => {
    const q3 = dialect.sqlToQuery(activityCondition(3, false, []))
    const q6 = dialect.sqlToQuery(activityCondition(6, false, []))
    const q12 = dialect.sqlToQuery(activityCondition(12, false, []))
    expect(q3.sql).toContain('yield_3m')
    expect(q6.sql).toContain('yield_6m')
    expect(q12.sql).toContain('yield_12m')
    for (const q of [q3, q6, q12]) expect(q.params).toContain('protipster')
  })
  it('never widens other month filters into a ProTipster window', () => {
    const q1 = dialect.sqlToQuery(activityCondition(1, false, []))
    expect(q1.params).not.toContain('protipster')
    const q2 = dialect.sqlToQuery(activityCondition(2, false, []))
    expect(q2.params).not.toContain('protipster')
    const q9 = dialect.sqlToQuery(activityCondition(9, false, []))
    expect(q9.params).not.toContain('protipster')
  })
})
