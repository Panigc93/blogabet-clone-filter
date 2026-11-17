// Inert deployment-ready transaction adapter. Does not construct a client,
// read env, connect, or import database drivers. Caller owns one PINNED client,
// its explicit configuration, authority, cancellation and lifecycle.
import type { ImportDatabase, ImportTransaction } from './execute-offline-import'
export class TransactionOutcomeUnknown extends Error {}
export interface PinnedClient extends ImportTransaction {
  // Must close/destroy the pinned connection when rollback fails.
  discard: () => Promise<void>
}
export function transactionAdapter(client: PinnedClient, config: {
  statementMs: number; idleMs: number; budgetMs: number
  signal?: AbortSignal
}): ImportDatabase {
  for (const n of [config.statementMs, config.idleMs, config.budgetMs]) {
    if (!Number.isSafeInteger(n) || n < 1 || n > 60000) throw new Error('explicit timeout must be 1..60000 ms')
  }
  let busy = false
  return { transaction: async (work) => {
    if (busy) throw new Error('pinned client already in transaction')
    busy = true
    const started = performance.now()
    const check = () => {
      if (config.signal?.aborted) throw new Error('import cancelled')
      if (performance.now() - started >= config.budgetMs) throw new Error('transaction budget exceeded')
    }
    let began = false
    let committing = false
    try {
      check()
      await client.query('BEGIN'); began = true
      await client.query("SELECT set_config('statement_timeout', $1, true), set_config('idle_in_transaction_session_timeout', $2, true)", [String(config.statementMs), String(config.idleMs)])
      const tx: ImportTransaction = { query: async <T extends Record<string, unknown>>(text: string, params?: unknown[]) => {
        check()
        const result = await client.query<T>(text, params)
        check()
        return result
      } }
      const result = await work(tx)
      check()
      committing = true
      await client.query('COMMIT'); began = false; committing = false
      return result
    } catch (error) {
      if (committing) {
        await client.discard()
        throw new TransactionOutcomeUnknown('commit acknowledgement missing; reconcile before any retry')
      }
      if (began) {
        try { await client.query('ROLLBACK') } catch { await client.discard() }
      }
      throw error
    } finally { busy = false }
  } }
}
// Cancellation and budget checks are cooperative between SQL calls. The
// configured server statement_timeout bounds in-flight SQL, not a JS timer.
// No claim of hard total deadline or interrupted-COMMIT certainty is made.
