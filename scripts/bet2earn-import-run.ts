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
//
// Reversion acotada (igualdad exacta, NO LIKE):
//   DELETE FROM tipsters WHERE platform='bet2earn';
//   DELETE FROM import_validation_log WHERE run_id = 'bet2earn-prod-2026-11-21';
//   La secuencia tipsters_internal_id_seq no se revierte: ids subrogados,
//   los huecos son inocuos.

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

  // node-postgres: transacciones reales (neon-http no las soporta).
  const { default: pg } = await import('pg')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const schema = await import('../db/schema')
  const pool = new pg.Pool({ connectionString: dbUrl, max: 1 })
  const q = (text: string, params?: unknown[]) => pool.query(text, params as never[]).then((r) => r.rows)
  try {
    // Precondicion 1: 0006 aplicada.
    const col = await q(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='tipsters' AND column_name='source_url'`)
    if ((col[0] as { n: number }).n !== 1) throw new Error('Falta tipsters.source_url: aplica drizzle/0006 primero')
    // Precondicion 2: plataforma vacia (primera carga; si no, abortar).
    const pre = await q(`SELECT count(*)::int AS n FROM tipsters WHERE platform='bet2earn'`)
    if ((pre[0] as { n: number }).n !== 0) throw new Error(`platform='bet2earn' ya tiene ${(pre[0] as { n: number }).n} filas; abortando`)
    // Huella previa de otras plataformas para el chequeo post-carga.
    const before = await q(`SELECT platform, count(*)::int AS n FROM tipsters GROUP BY platform ORDER BY platform`)

    const db = drizzle(pool, { schema })
    const runId = `bet2earn-prod-${new Date().toISOString().slice(0, 10)}`
    const result = await executeBet2earnImport(db, plan, runId)

    const afterB2e = await q(`SELECT count(*)::int AS n, count(source_url)::int AS urls FROM tipsters WHERE platform='bet2earn'`)
    const holds = await q(`SELECT count(*)::int AS n FROM import_validation_log WHERE run_id = $1`, [runId])
    const after = await q(`SELECT platform, count(*)::int AS n FROM tipsters GROUP BY platform ORDER BY platform`)
    const intactas = (before as { platform: string; n: number }[]).every(
      (b) => (after as { platform: string; n: number }[]).some((a) => a.platform === b.platform && a.n === b.n),
    )
    console.log(JSON.stringify({ runId, ...result, bet2earn: afterB2e[0], holdsEnLog: (holds[0] as { n: number }).n, otrasPlataformasIntactas: intactas }, null, 2))
  } finally {
    await pool.end()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
