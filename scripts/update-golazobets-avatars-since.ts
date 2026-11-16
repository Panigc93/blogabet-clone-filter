// UPDATE acotado Golazobets: avatar_url + since_year de las 284 filas.
//
// AUTORIDAD (2026-11-16): Juan aprueba guardar fotos en los perfiles
// Golazobets y el Since desde la primera apuesta (original WhatsApp
// 10:58:09 wamid.HBgLMzQ2MDgxODE0MzQVAgASGBYzRUIwQ0I0NzZFRDhBNUY3NDU4QkFDAA==).
// Solo platform='golazobets'; BB y Tipstrr deben quedar byte a byte intactos
// (huella postcheck). since_year = año del primer mes con total_picks>0 del
// histórico all-time (precisión año, no fecha de alta ni día).
//
//   DATABASE_URL=<cadena> npx tsx scripts/update-golazobets-avatars-since.ts          # dry-run
//   DATABASE_URL=<cadena> npx tsx scripts/update-golazobets-avatars-since.ts --apply
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { neon } from '@neondatabase/serverless'

const APPLY = process.argv.includes('--apply')
const RUN_ID = `golazobets-avatars-since-20261116-${APPLY ? 'apply' : 'dryrun'}-${Date.now()}`
const CAP_DIR = 'crawler/platforms/golazobets/captures/2026-11-15-profiles'
const HUELLA_OTROS = `SELECT md5(string_agg(t::text, '|' ORDER BY id)) AS h, count(*)::text AS n FROM tipsters t WHERE platform <> 'golazobets'`

interface Cap { avatar_url?: string | null; since_year_first_pick?: number | null }

async function main() {
  const url = process.env.DATABASE_URL
  if (!url || url.includes('dummy')) throw new Error('DATABASE_URL ausente o dummy')
  const sql = neon(url, { fetchOptions: { cache: 'no-store' } })

  const caps = new Map<string, Cap>()
  for (const f of readdirSync(CAP_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'))) {
    caps.set(f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(CAP_DIR, f), 'utf8')) as Cap)
  }
  const incompletos = Array.from(caps.entries()).filter(([, c]) => c.avatar_url === undefined)
  console.log(`capturas: ${caps.size} | sin avatar recogido aún: ${incompletos.length}${incompletos.length ? ' -> ' + incompletos.map(([s]) => s).join(', ') : ''}`)
  if (APPLY && incompletos.length > 0) throw new Error('APPLY rechazado: hay perfiles sin avatar recogido; termina la captura antes')

  const pre = (await sql.query(HUELLA_OTROS)) as { h: string; n: string }[]
  const gzbPre = (await sql.query(
    `SELECT count(*)::text AS n,
            count(*) FILTER (WHERE avatar_url IS NOT NULL)::text AS con_avatar,
            count(*) FILTER (WHERE since_year IS NOT NULL)::text AS con_since
     FROM tipsters WHERE platform = 'golazobets'`
  )) as { n: string; con_avatar: string; con_since: string }[]
  console.log(`BB+Tipstrr antes: ${pre[0].n} filas | huella ${pre[0].h}`)
  console.log(`golazobets antes: ${gzbPre[0].n} filas, con avatar ${gzbPre[0].con_avatar}, con since ${gzbPre[0].con_since}`)

  const plan: { slug: string; avatar: string | null; since: number | null }[] = []
  for (const [slug, c] of Array.from(caps.entries())) plan.push({ slug, avatar: c.avatar_url ?? null, since: c.since_year_first_pick ?? null })
  console.log(`plan: ${plan.length} updates | avatar no-null ${plan.filter((p) => p.avatar !== null).length} | since no-null ${plan.filter((p) => p.since !== null).length} | años ${Math.min(...plan.map((p) => p.since ?? 9999))}-${Math.max(...plan.map((p) => p.since ?? 0))}`)
  if (!APPLY) { console.log(JSON.stringify({ runId: RUN_ID, apply: false })); return }

  const results = (await sql.transaction((txn) => [
    ...plan.map((p) =>
      txn.query(
        `UPDATE tipsters SET avatar_url = $2, since_year = $3 WHERE platform = 'golazobets' AND slug = $4 RETURNING id`,
        [p.avatar, p.since, p.slug]
      )
    ),
    txn.query(
      `INSERT INTO import_validation_log (platform, slug, captured_at, class, reason, run_id) VALUES ('golazobets', '_lote-avatars-since', '2026-11-16', 'actualizado[avatar+since]', $1, $2)`,
      [`UPDATE acotado 284 filas golazobets: avatar_url de profile_picture (captura 2026-11-16) y since_year = año del primer mes con total_picks>0 del histórico all-time (decisión usuario 2026-11-16 10:58 CET)`, RUN_ID]
    ),
  ])) as unknown[][]
  const updated = results.slice(0, plan.length).filter((r) => Array.isArray(r) && r.length === 1).length
  if (updated !== plan.length) throw new Error(`updates tocados ${updated} != ${plan.length}`)

  const post = (await sql.query(HUELLA_OTROS)) as { h: string; n: string }[]
  const gzbPost = (await sql.query(
    `SELECT count(*)::text AS n,
            count(*) FILTER (WHERE avatar_url IS NOT NULL)::text AS con_avatar,
            count(*) FILTER (WHERE since_year IS NOT NULL)::text AS con_since
     FROM tipsters WHERE platform = 'golazobets'`
  )) as { n: string; con_avatar: string; con_since: string }[]
  console.log(JSON.stringify({ runId: RUN_ID, apply: true, updated, bbTipstrrAntes: pre[0], bbTipstrrDespues: post[0], golazobetsDespues: gzbPost[0] }, null, 1))
  if (post[0].h !== pre[0].h || post[0].n !== pre[0].n) throw new Error('POST-UPDATE: BB/Tipstrr cambiaron')
  if (Number(gzbPost[0].n) !== 284) throw new Error('POST-UPDATE: recuento golazobets != 284')
}

main().catch((e) => { console.error(e); process.exit(1) })
