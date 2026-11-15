// Vista diagnostica AISLADA (HTML estatico). No usa DB, ni red, ni la UI de la app.
// Uso: npx tsx scripts/diagnostic/build-scope-view.mts <salida.html>
// Lee capturas HTML ya descargadas (rutas fijas abajo) y las pasa por el parser.
import { readFileSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
import * as Mod from '../../crawler/statsBreakdown.ts'
import type { StatsTab, StatsBreakdown, ScopeCheck } from '../../crawler/statsBreakdown.ts'
// tsx expone el modulo TS bajo .default segun el modo; se acepta cualquiera.
const M: typeof Mod = (Mod as any).default ?? Mod
const {
  parseStatsBreakdown, availableStatsTabs, checkMuestraYield, liveShare, dominantLeadBucket,
  reconcileTotals, MYS_SCOPE_MIN_PICKS, MYS_SCOPE_MIN_YIELD,
} = M

interface Capture { slug: string; file: string; capturedAt: string; access: string; verified: string }
const CAPTURES: Capture[] = [
  { slug: 'greimancook', file: '/tmp/st_greimancook.html', capturedAt: '2026-11-15 12:14 CET', access: 'De pago, 99 €/mes (catálogo Neon, lectura)', verified: 'Verificado (catálogo)' },
  { slug: 'yugovalue', file: '/tmp/st_yugovalue.html', capturedAt: '2026-11-15 12:14 CET', access: 'Gratis (catálogo Neon, lectura)', verified: 'Verificado (catálogo)' },
  { slug: 'criteriofutbol', file: '/tmp/stats.html', capturedAt: '2026-11-15 12:11 CET', access: 'Gratis (según la propia página)', verified: 'No verificado (según la propia página)' },
]
const TAB_LABEL: Record<StatsTab, string> = {
  alltime: 'Todos los picks (alltime)',
  paid: 'Solo picks de pago (paid)',
  private: 'Solo picks privados (private)',
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const n = (v: number | null, d = 0) => v === null ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: d, useGrouping: 'always' })
const KIND: Record<string, string> = {
  live_aggregate: 'Agregado de apuestas en directo (no es una liga)',
  combo_aggregate: 'Agregado de combinadas (no es una liga)',
  unclassified: 'Categoría original de Blogabet: país o competición, sin verificar',
}

function scopeRows(checks: ScopeCheck[], kind: 'sport' | 'category') {
  const rows = checks.filter(c => c.scope === kind).sort((a, b) => b.picks - a.picks)
  const evaluable = rows.filter(c => c.sampleOk)
  const small = rows.length - evaluable.length
  const html = evaluable.map(c => {
    const label = c.muestraYYieldCumplen ? '<span class="ok">Muestra y yield cumplen</span>'
      : c.yieldOk ? '' : '<span class="no">Yield &lt; 11%</span>'
    const kindTxt = kind === 'category' && c.categoryKind ? `<div class="kind ${c.categoryKind}">${KIND[c.categoryKind]}</div>` : ''
    return `<tr class="${c.muestraYYieldCumplen ? 'hit' : ''}"><td>${esc(c.key)}${kindTxt}</td><td class="r">${n(c.picks)}</td><td class="r">${n(c.yieldPct, 1)}%</td><td>${label}</td></tr>`
  }).join('')
  return { html, small, evaluableCount: evaluable.length }
}

function tabBlock(slug: string, tab: StatsTab, b: StatsBreakdown): string {
  const checks = checkMuestraYield(b)
  const sports = scopeRows(checks, 'sport'), cats = scopeRows(checks, 'category')
  const live = liveShare(b), lead = dominantLeadBucket(b), rec = reconcileTotals(b)
  const bookies = (b.bookies ?? []).slice().sort((x, y) => y.picks - x.picks).slice(0, 4)
    .map(r => `${esc(r.key)} ${n(r.picks)}`).join(' · ') || 'sin dato'
  const table = (rows: ReturnType<typeof scopeRows>, title: string) => rows.evaluableCount === 0
    ? `<p class="muted">${title}: ningún ámbito llega a ${MYS_SCOPE_MIN_PICKS} picks por sí solo (${rows.small} con menos de ${MYS_SCOPE_MIN_PICKS}; no se suman entre sí).</p>`
    : `<table><thead><tr><th>${title}</th><th class="r">Picks</th><th class="r">Yield</th><th>Resultado</th></tr></thead><tbody>${rows.html}</tbody></table>` +
      (rows.small ? `<p class="muted">Además ${rows.small} con menos de ${MYS_SCOPE_MIN_PICKS} picks: no evaluables como ámbito.</p>` : '')
  return `<section class="tab"><h3>${TAB_LABEL[tab]}</h3>
  <p class="denom">Denominador de esta pestaña: <b>${n(rec.sportsPicks)}</b> picks${rec.consistent === true ? ' (deportes, categorías y antelación cuadran)' : rec.consistent === false ? ' (¡los totales no cuadran!)' : ''}. No se suma con otras pestañas.</p>
  ${table(sports, 'Deporte')}${table(cats, 'Categoría')}
  <div class="signals"><b>Indicios de seguibilidad</b> (no es una comprobación)
  <ul>
   <li>Picks en directo: ${live ? `<b>${n(live.livePicks)} de ${n(live.totalPicks)} (${n(live.pct, 1)}%)</b>` : 'sin dato'}. Un seguidor no recibe un pick en directo con la misma ventana que uno previo al partido.</li>
   <li>Tramo de antelación más frecuente: ${lead ? `<b>${esc(lead.bucket)}</b> (${n(lead.sharePct, 1)}% de los picks)` : 'sin dato'}.</li>
   <li>Casas publicadas (picks): ${bookies}.</li>
   <li class="muted">Estado: <b>seguibilidad sin comprobar</b>. Casa y antelación son datos autodeclarados: no prueban cuota disponible, liquidez ni que el pick llegara a tiempo.</li>
  </ul></div></section>`
}

const blocks = CAPTURES.map(c => {
  const html = readFileSync(c.file, 'utf8')
  const sha = createHash('sha256').update(html).digest('hex').slice(0, 16)
  const tabs = availableStatsTabs(html)
  const missing = (['alltime', 'paid', 'private'] as StatsTab[]).filter(t => !tabs.includes(t))
  const body = tabs.map(t => tabBlock(c.slug, t, parseStatsBreakdown(html, t)!)).join('')
  return `<article><h2>${esc(c.slug)}</h2>
  <div class="meta"><span class="chip">${esc(c.access)}</span><span class="chip">${esc(c.verified)}</span></div>
  <p class="src">Fuente: https://${esc(c.slug)}.blogabet.com/blog/stats · lectura pública sin sesión · ${esc(c.capturedAt)} · huella ${sha} · pestañas presentes: ${tabs.join(', ')}${missing.length ? ` (no hay: ${missing.join(', ')})` : ''}</p>${body}</article>`
}).join('\n')

const page = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Diagnóstico: muestra, yield e indicios de seguibilidad por ámbito</title>
<style>
body{font:15px/1.45 system-ui,sans-serif;max-width:980px;margin:0 auto;padding:16px;color:#1c1f23;background:#f6f7f9}
h1{font-size:22px;margin:0 0 6px}h2{font-size:19px;margin:0}h3{font-size:16px;margin:18px 0 4px}
.banner{background:#fff3cd;border:1px solid #e0c36a;padding:10px 12px;border-radius:6px;margin:10px 0}
article{background:#fff;border:1px solid #dde1e6;border-radius:8px;padding:14px 16px;margin:16px 0}
.chip{display:inline-block;background:#eef1f5;border-radius:12px;padding:2px 10px;margin:4px 6px 0 0;font-size:13px}
.src,.muted{color:#5b6570;font-size:13px}.denom{margin:4px 0 8px}
table{border-collapse:collapse;width:100%;margin:6px 0;background:#fff}th,td{border-bottom:1px solid #e6e9ed;padding:5px 8px;text-align:left;vertical-align:top}
th{background:#f1f3f6;font-size:13px}.r{text-align:right;white-space:nowrap}
tr.hit{background:#eaf6ee}.ok{color:#17692f;font-weight:600}.no{color:#8a4b00}
.kind{font-size:12px;color:#5b6570}.kind.live_aggregate,.kind.combo_aggregate{color:#9a3412}
.signals{background:#f6f8fb;border-left:3px solid #7d8da1;padding:8px 12px;margin-top:10px}.signals ul{margin:6px 0 0 18px;padding:0}
.limits li{margin:3px 0}
</style></head><body>
<h1>Cómo acotamos muestra, yield y seguibilidad por ámbito</h1>
<div class="banner"><b>Vista diagnóstica aislada, no integrada.</b> Usa 3 páginas públicas de estadísticas descargadas el 15-nov-2026. No toca la base de datos ni la app, y no es una selección de tipsters ni una recomendación de apuesta.</div>
<p>Para cada tipster se muestra, por pestaña y ámbito, si <b>muestra (≥ ${MYS_SCOPE_MIN_PICKS} picks)</b> y <b>yield (≥ ${MYS_SCOPE_MIN_YIELD}%)</b> se cumplen en la propia fila. Eso es solo M e Y, no el MYS completo: la seguibilidad queda como «sin comprobar», con indicios aparte. El tipo de acceso (gratis o de pago) se muestra como dato, no como filtro.</p>
${blocks}
<article class="limits"><h2>Límites</h2><ul>
<li>Las pestañas alltime, paid y private son conjuntos de picks distintos: no se suman ni se atribuyen entre sí.</li>
<li>«Livebet» y «Combo pick» son agregados por tipo de apuesta, no ligas: cumplir M e Y ahí no acredita ninguna competición.</li>
<li>Una categoría original (por ejemplo «Greece» o «Spa. Primera») puede ser un país o una competición; no se ha verificado.</li>
<li>No hay cruce categoría × directo en estos datos: solo el porcentaje en directo de toda la pestaña.</li>
<li>Una categoría solo cuenta con sus propios picks: no se suman categorías pequeñas para llegar a ${MYS_SCOPE_MIN_PICKS}.</li>
<li>Cifras publicadas por Blogabet y autograduadas salvo blogs verificados; antelación y casas no prueban liquidez ni rentabilidad ejecutable.</li>
<li>Solo 3 blogs: no es una muestra del catálogo.</li></ul></article>
</body></html>`
writeFileSync(process.argv[2] ?? 'docs/diagnostic/mys-ambitos-diagnostico.html', page)
console.log('ok', page.length)
