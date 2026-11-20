// Regresión REAL de la ruta de import Apuestes (PGlite aislada, disco local):
// no basta "dos pasadas idénticas" para probar la semántica de actualización.
//
// 1. Pre-siembra filas de OTRAS plataformas con ids de ambos espacios
//    (blogabet positivo 12345; tipstrr negativo -221629 estilo -portfolioId).
// 2. Importa la captura completa DOS veces: estado idéntico, y las filas
//    preexistentes quedan byte a byte igual (sin colisión de PK ni tocadas).
// 3. Ids asignados por tipsters_internal_id_seq: todos <= -2.000.000.000,
//    distintos entre sí y disjuntos de los preexistentes.
// 4. Captura simulada MODIFICADA sobre un tipster (Avatarr, id origen 31968):
//    a. ventana 3m poblada -> vacía (totalPicks 0): yield_3m debe pasar a NULL
//       (vacío verdadero sobrescribe; NO se conserva el valor antiguo) y el
//       profit cambiado debe aplicarse, con id/plataforma/slug inmutables.
//    b. ventana 3m vacía -> poblada: el nuevo yield debe aplicarse.
// 5. Los holds (discrepancia, rango, cuarentena) nunca existen en tipsters.
//
// Uso: npx tsx scripts/apuestes-import-regression.ts
import { readFileSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { tipsters, importValidationLog } from '../db/schema'
import { planApuestesImport, executeApuestesImport } from '../crawler/platforms/apuestes/import'

const DIR = '/tmp/pglite-apuestes-regression'
const JSONL = new URL('../data/apuestes/profiles.jsonl', import.meta.url).pathname
const URLS = new URL('../data/apuestes/profile-urls.json', import.meta.url).pathname
const MIGRATIONS = [
  '0000_sudden_jazinda.sql', '0001_add_last_reset_at.sql', '0002_add_is_verified.sql',
  '0003_naive_dormammu.sql', '0004_multi_platform.sql', '0005_tipstrr_internal_pk.sql',
  '0006_apuestes_source_url.sql',
]

let failures = 0
const check = (label: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`)
  if (!cond) failures++
}

async function apChecksum(pg: PGlite): Promise<string> {
  const r = await pg.query<{ h: string }>(
    `SELECT md5(string_agg(md5(t::text), '' ORDER BY id)) AS h
     FROM (SELECT * FROM tipsters WHERE platform='apuestes') t`
  )
  return r.rows[0].h
}

async function main() {
  rmSync(DIR, { recursive: true, force: true })
  const pg = new PGlite(DIR)
  const db = drizzle(pg, { schema: { tipsters, importValidationLog } })
  for (const file of MIGRATIONS) {
    const sqlText = readFileSync(join(__dirname, '../drizzle', file), 'utf8')
    for (const stmt of sqlText.split('--> statement-breakpoint')) {
      const s = stmt.trim()
      if (s) await pg.exec(s)
    }
  }

  // 1. Filas preexistentes de otras plataformas (ambos espacios de ids)
  await pg.exec(`
    INSERT INTO tipsters (id, platform, slug, name, picks, profit, yield) VALUES
      (12345, 'blogabet', 'bb-probe', 'BB Probe', 111, '12.5', '5.50'),
      (-221629, 'tipstrr', 'tr-probe', 'TR Probe', 222, '361.815', '8.25');
  `)

  const plan = planApuestesImport(JSONL, URLS)
  console.log(`plan: ${plan.rows} filas -> ${plan.inserts.length} inserts + ${plan.holds.length} holds`)

  // 2. Doble import: idempotencia byte a byte
  await executeApuestesImport(db, plan, 'ap-reg-run1')
  const h1 = await apChecksum(pg)
  await executeApuestesImport(db, plan, 'ap-reg-run2')
  const h2 = await apChecksum(pg)
  check('doble import idempotente (hash de filas apuestes)', h1 === h2)

  const cnt = await pg.query<{ n: string }>(`SELECT count(*)::text n FROM tipsters WHERE platform='apuestes'`)
  check('3659 filas apuestes', cnt.rows[0].n === '3659', cnt.rows[0].n)

  // 3. Estrategia PK: secuencia interna, sin colisiones
  const ids = await pg.query<{ bad: string; distinctn: string; overlap: string }>(`
    SELECT count(*) FILTER (WHERE id > -2000000000)::text AS bad,
           count(DISTINCT id)::text AS distinctn,
           count(*) FILTER (WHERE id IN (12345, -221629))::text AS overlap
    FROM tipsters WHERE platform='apuestes'`)
  check('ids apuestes todos <= -2000000000 (rango secuencia)', ids.rows[0].bad === '0')
  check('ids apuestes distintos', ids.rows[0].distinctn === '3659')
  check('sin colisión con ids preexistentes', ids.rows[0].overlap === '0')

  const others = await pg.query<{ platform: string; picks: number; profit: string | null; yield: string | null }>(
    `SELECT platform, picks, profit, yield FROM tipsters WHERE platform IN ('blogabet','tipstrr') ORDER BY id`)
  const bb = others.rows.find(r => r.platform === 'blogabet')
  const tr = others.rows.find(r => r.platform === 'tipstrr')
  check('fila blogabet intacta', !!bb && bb.picks === 111 && bb.profit === '12.500' && bb.yield === '5.50', JSON.stringify(bb))
  check('fila tipstrr intacta', !!tr && tr.picks === 222 && tr.profit === '361.815' && tr.yield === '8.25', JSON.stringify(tr))

  // 4a. Transición poblado -> vacío verdadero + cambio de profit
  const before = await pg.query<{ id: number; yield_3m: string | null; profit: string | null }>(
    `SELECT id, yield_3m, profit FROM tipsters WHERE platform='apuestes' AND slug='avatarr'`)
  check('avatarr existe con 3m poblado', before.rows.length === 1 && before.rows[0].yield_3m === '28.74', JSON.stringify(before.rows[0]))
  const avId = before.rows[0].id

  const lines = readFileSync(JSONL, 'utf8').trim().split('\n')
  const avLine = lines.map(l => JSON.parse(l)).find(d => d.id === 31968)
  const tmp = mkdtempSync(join(tmpdir(), 'ap-reg-'))
  const emptied = { ...avLine, m3: { ...avLine.m3, totalPicks: 0, yield: null, totalProfit: 0 },
    hist: { ...avLine.hist, totalProfit: 99.5 } }
  const f1 = join(tmp, 'empty.jsonl'); writeFileSync(f1, JSON.stringify(emptied) + '\n')
  await executeApuestesImport(db, planApuestesImport(f1, URLS), 'ap-reg-run3')

  const afterEmpty = await pg.query<{ id: number; yield_3m: string | null; profit: string | null; slug: string; platform: string }>(
    `SELECT id, yield_3m, profit, slug, platform FROM tipsters WHERE platform='apuestes' AND slug='avatarr'`)
  const ae = afterEmpty.rows[0]
  check('poblado->vacío: yield_3m pasa a NULL', ae.yield_3m === null, JSON.stringify(ae))
  check('cambio real aplicado: profit 99.5', ae.profit === '99.500', String(ae.profit))
  check('identidad inmutable (id)', ae.id === avId)
  check('identidad inmutable (slug/platform)', ae.slug === 'avatarr' && ae.platform === 'apuestes')

  // 4b. Vacío -> poblado
  const refilled = { ...avLine, m3: { ...avLine.m3, totalPicks: 10, yield: 15.5, totalProfit: 3.1 } }
  const f2 = join(tmp, 'refill.jsonl'); writeFileSync(f2, JSON.stringify(refilled) + '\n')
  await executeApuestesImport(db, planApuestesImport(f2, URLS), 'ap-reg-run4')
  const afterRefill = await pg.query<{ id: number; yield_3m: string | null }>(
    `SELECT id, yield_3m FROM tipsters WHERE platform='apuestes' AND slug='avatarr'`)
  check('vacío->poblado: yield_3m 15.50 aplicado', afterRefill.rows[0].yield_3m === '15.50', String(afterRefill.rows[0].yield_3m))
  check('id sigue inmutable', afterRefill.rows[0].id === avId)

  // 5. Holds jamás en tipsters (slugs concretos; 'apuestes-alegre' es un
  // tipster legítimo, no un hold).
  const held = await pg.query<{ n: string }>(
    `SELECT count(*)::text n FROM tipsters WHERE platform='apuestes'
     AND slug IN ('brabender','goldeoro','surfonly','nhlpick','jorgejota','luiscale')`)
  check('holds ausentes de tipsters', held.rows[0].n === '0', held.rows[0].n)

  const total = await pg.query<{ n: string }>(`SELECT count(*)::text n FROM tipsters`)
  check('total tabla = 2 preexistentes + 3659', total.rows[0].n === '3661', total.rows[0].n)

  // 6. Atomicidad: un fallo en el segundo lote revierte TODA la ejecución
  // (filas de tipsters y log de holds), no deja escritura parcial.
  const rbInserts = plan.inserts.slice(0, 201).map(v => ({ ...v, slug: `rb-${v.slug}` }))
  const rbPlan = {
    rows: 201,
    inserts: [...rbInserts.slice(0, 200), { ...rbInserts[200], name: null }], // NOT NULL violado en lote 2
    holds: [{ platform: 'apuestes', slug: 'rb-hold', klass: 'cuarentena[rollback-probe]',
      reason: 'rollback probe' }],
  }
  let threw = false
  try {
    await executeApuestesImport(db, rbPlan as any, 'ap-reg-rollback')
  } catch { threw = true }
  check('fallo en lote 2 hace throw', threw)
  const rb = await pg.query<{ rows: string; logs: string }>(
    `SELECT (SELECT count(*) FROM tipsters WHERE slug LIKE 'rb-%')::text AS rows,
            (SELECT count(*) FROM import_validation_log WHERE run_id='ap-reg-rollback')::text AS logs`)
  check('rollback: 0 filas del lote 1 confirmadas', rb.rows[0].rows === '0', rb.rows[0].rows)
  check('rollback: 0 holds del run confirmados', rb.rows[0].logs === '0', rb.rows[0].logs)
  const total2 = await pg.query<{ n: string }>(`SELECT count(*)::text n FROM tipsters`)
  check('tabla intacta tras rollback', total2.rows[0].n === '3661', total2.rows[0].n)

  console.log(failures === 0 ? 'REGRESSION OK' : `REGRESSION FAILURES: ${failures}`)
  await pg.close()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
