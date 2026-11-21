// Bet2Earn import runner. PREPARATION CODE: it changes nothing unless called
// with --execute --confirm-escritura-remota and DATABASE_URL_DIRECT set.
//
//   Dry-run (default, no DB, no writes anywhere):
//     npx tsx scripts/bet2earn-import-run.ts [ruta-jsonl]
//   Remote execution (requires Juan's explicit approval, one transaction):
//     DATABASE_URL_DIRECT=... npx tsx scripts/bet2earn-import-run.ts [ruta-jsonl] --execute --confirm-escritura-remota
//
// The dry-run prints the plan counters and checks them against the approved
// v4 scope (1,800 rows -> 171 inserts + 1,629 holds). Any difference is a
// discrepancy to report, never something to "fix" silently.

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { planBet2earnImport, executeBet2earnImport } from '../crawler/platforms/bet2earn/import'

const EXPECTED_V4 = { rows: 1800, inserts: 171, holds: 1629 }

async function main() {
  const args = process.argv.slice(2)
  const execute = args.includes('--execute')
  const confirm = args.includes('--confirm-escritura-remota')
  const jsonlPath = args.find((a) => !a.startsWith('--'))
    ?? new URL('../data/bet2earn/profiles.jsonl', import.meta.url).pathname

  const raw = readFileSync(jsonlPath, 'utf8')
  const inputSha256 = createHash('sha256').update(raw).digest('hex')
  const codeRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  const plan = planBet2earnImport(jsonlPath)
  const holdsByReason: Record<string, number> = {}
  for (const h of plan.holds) holdsByReason[h.reason] = (holdsByReason[h.reason] ?? 0) + 1
  const scopeMatches =
    plan.rows === EXPECTED_V4.rows &&
    plan.inserts.length === EXPECTED_V4.inserts &&
    plan.holds.length === EXPECTED_V4.holds

  const report = {
    modo: execute ? 'EJECUCION' : 'dry-run',
    jsonl: jsonlPath,
    inputSha256,
    codeRevision,
    rows: plan.rows,
    inserts: plan.inserts.length,
    holds: plan.holds.length,
    holdsByReason,
    alcanceV4Esperado: EXPECTED_V4,
    alcanceCoincide: scopeMatches,
  }
  console.log(JSON.stringify(report, null, 2))

  if (!scopeMatches) {
    console.error('DISCREPANCIA DE ALCANCE: el payload no coincide con la validacion v4. Informar antes de cualquier ejecucion.')
    process.exit(2)
  }
  if (!execute) {
    console.log('Dry-run completo. Sin escrituras. Para ejecutar: --execute --confirm-escritura-remota con DATABASE_URL_DIRECT.')
    return
  }
  if (!confirm) throw new Error('--execute requiere --confirm-escritura-remota (aprobacion expresa del propietario).')
  const dbUrl = process.env.DATABASE_URL_DIRECT
  if (!dbUrl) throw new Error('DATABASE_URL_DIRECT no encontrado; sin el no hay ejecucion.')

  const { neon } = await import('@neondatabase/serverless')
  const { drizzle } = await import('drizzle-orm/neon-http')
  const schema = await import('../db/schema')
  const db = drizzle(neon(dbUrl, { fetchOptions: { cache: 'no-store' } }), { schema })

  const runId = `bet2earn-${new Date().toISOString()}`
  const result = await executeBet2earnImport(db, plan, runId)
  const count = await db.execute(
    (await import('drizzle-orm')).sql`SELECT count(*)::int AS n FROM tipsters WHERE platform = 'bet2earn'`,
  )
  console.log(JSON.stringify({ runId, ...result, bet2earnRowsEnRemoto: (count.rows[0] as { n: number }).n }, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
