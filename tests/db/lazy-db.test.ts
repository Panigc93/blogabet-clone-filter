import { describe, it, expect } from 'vitest'

// The db module must import cleanly without DATABASE_URL (isolated preview
// builds) and fail loudly only when a query is actually attempted.
describe('lazy db init', () => {
  it('import does not throw without DATABASE_URL; first use does', async () => {
    const original = process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    try {
      const { db } = await import('@/db')
      expect(db).toBeDefined()
      expect(() => db.select).toThrow('DATABASE_URL is not set')
    } finally {
      if (original !== undefined) process.env.DATABASE_URL = original
    }
  })
})
