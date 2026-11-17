import { describe, it, expect } from 'vitest'
import { transactionAdapter, TransactionOutcomeUnknown, type PinnedClient } from '@/crawler/platforms/bet2invest/transaction-adapter'
function fake(fail: string | null = null) {
  const calls: string[] = []
  let discarded = false
  const client: PinnedClient = {
    query: async <T extends Record<string, unknown>>(q: string) => {
      calls.push(q)
      if (q === fail) throw new Error('synthetic connection failure')
      return { rows: [] as T[] }
    },
    discard: async () => { discarded = true },
  }
  return { client, calls, discarded: () => discarded }
}
const cfg = { statementMs: 100, idleMs: 200, budgetMs: 500 }
describe('inert explicit pinned adapter', () => {
  it('constructs without connecting; commits callback only after all awaited writes', async () => {
    const f = fake(); const db = transactionAdapter(f.client, cfg)
    expect(f.calls).toEqual([])
    await db.transaction(async (tx) => { await tx.query('SELECT 1') })
    expect(f.calls[0]).toBe('BEGIN'); expect(f.calls.at(-1)).toBe('COMMIT')
  })
  it('cancel before start has no database effects; cancel during callback rolls back', async () => {
    const f = fake(); const ctrl = new AbortController(); ctrl.abort()
    await expect(transactionAdapter(f.client, { ...cfg, signal: ctrl.signal }).transaction(async () => 0)).rejects.toThrow('cancelled')
    expect(f.calls).toHaveLength(0)
    const second = new AbortController()
    await expect(transactionAdapter(f.client, { ...cfg, signal: second.signal }).transaction(async (tx) => { second.abort(); await tx.query('never') })).rejects.toThrow('cancelled')
    expect(f.calls.at(-1)).toBe('ROLLBACK'); expect(f.calls).not.toContain('never')
  })
  it('lost commit acknowledgement is unknown and discards connection, not automatic retry', async () => {
    const f = fake('COMMIT')
    await expect(transactionAdapter(f.client, cfg).transaction(async () => 1)).rejects.toBeInstanceOf(TransactionOutcomeUnknown)
    expect(f.discarded()).toBe(true)
  })
})
