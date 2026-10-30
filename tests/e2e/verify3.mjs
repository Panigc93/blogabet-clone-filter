import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'

function chromePath() {
  if (process.env.PLAYWRIGHT_CHROME_PATH) return process.env.PLAYWRIGHT_CHROME_PATH
  for (const c of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    try { execSync(`test -x ${c}`); return c } catch { /* next */ }
  }
  return undefined
}

const BASE = process.env.E2E_BASE ?? 'http://localhost:3100'
const SHOTS = process.env.E2E_SHOTS ?? 'tests/e2e/shots'
fs.mkdirSync(SHOTS, { recursive: true })
const results = []
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); if (!cond) process.exitCode = 1 }

const token = crypto.createHmac('sha256', 'test').update('test').digest('hex')
const browser = await chromium.launch({ executablePath: chromePath(), headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addCookies([{ name: 'auth_token', value: token, url: BASE }])
const page = await ctx.newPage()
page.on('pageerror', e => { results.push(['FAIL', 'JS exception', String(e)]); process.exitCode = 1 })

// 1. /top-mys con los 11 fixtures: pool MYS global = alpha-free, lopez-free, epsilon-free
await page.goto(BASE + '/top-mys', { waitUntil: 'networkidle', timeout: 90000 })
await page.waitForSelector('table tbody tr', { timeout: 60000 })
const slugs = await page.$$eval('table tbody tr', trs => trs.map(tr => tr.getAttribute('data-slug')))
ok('top-mys pool exacto (3 candidatos)', slugs.length === 3, slugs.join(','))
ok('top-mys orden por puntuacion', slugs.join(',') === 'alpha-free,lopez-free,epsilon-free', slugs.join(','))
const bodyText = await page.textContent('body')
ok('excluye de pago (gamma-paid)', !bodyText.includes('gamma-paid') && !bodyText.includes('Gamma Paid'))
ok('excluye <100 picks (zeta-free)', !slugs.includes('zeta-free'))
ok('excluye yield<11 (kappa-free, theta-free)', !slugs.includes('kappa-free') && !slugs.includes('theta-free'))
ok('metodologia visible', bodyText.includes('100') && bodyText.includes('11%') && bodyText.includes('15%'))
ok('caveats visibles', bodyText.includes('no certifican rendimiento futuro') && bodyText.includes('categoria o liga'))
ok('cabeceras de tabla', bodyText.includes('Puntuacion') && bodyText.includes('Picks/mes') && bodyText.includes('Verif.'))
// Los tres comparten last_pick_at en el mock: alpha debe puntuar primero por yield/muestra/volumen
const firstScore = await page.$eval('table tbody tr:first-child td:last-child', td => td.textContent)
ok('puntuacion visible y numerica', /^\d+\.\d{3}$/.test(firstScore.trim()), firstScore)
await page.screenshot({ path: SHOTS + '/30-top-mys.png', fullPage: true })

// 2. Enlace Top MYS desde el listado
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await page.waitForSelector('.tipster-block')
const topLink = await page.$('a[href="/top-mys"]')
ok('enlace Top MYS en el listado', !!topLink)
await page.click('a[href="/top-mys"]')
await page.waitForURL(u => u.pathname === '/top-mys', { timeout: 30000 })
await page.waitForSelector('table tbody tr')
ok('navegacion listado -> top-mys', true)

// 3. Vista movil: la tabla es usable (scroll horizontal contenido en la pagina)
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(BASE + '/top-mys', { waitUntil: 'networkidle' })
await page.waitForSelector('table tbody tr')
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
ok('sin desborde horizontal de pagina a 390px', overflow <= 1, `overflow=${overflow}px`)
const tableScroll = await page.evaluate(() => {
  const w = document.querySelector('table')?.parentElement
  if (!w) return { ok: false }
  const style = getComputedStyle(w)
  return { ok: style.overflowX === 'auto' && w.scrollWidth > w.clientWidth, sw: w.scrollWidth, cw: w.clientWidth }
})
ok('tabla alcanzable a 390px (scroll en contenedor)', tableScroll.ok, JSON.stringify(tableScroll))
const kb = await page.evaluate(async () => {
  const w = document.querySelector('table')?.parentElement
  if (!w) return { ok: false, why: 'no wrapper' }
  w.focus()
  w.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
  w.scrollLeft = w.scrollWidth // mismo destino que End en un contenedor enfocable
  await new Promise(r => requestAnimationFrame(r))
  const ths = [...w.querySelectorAll('th')]
  const last = ths[ths.length - 1]
  const wr = w.getBoundingClientRect(), tr = last.getBoundingClientRect()
  return { ok: w.scrollLeft > 0 && tr.right <= wr.right + 1 && tr.left >= wr.left - 1, scrollLeft: w.scrollLeft, thRight: tr.right, wRight: wr.right, lastTh: last.textContent }
})
ok('columna final (Puntuacion) alcanzable con scroll/teclado', kb.ok, JSON.stringify(kb))
const acc = await page.evaluate(() => {
  const w = document.querySelector('table')?.parentElement
  return { ok: !!w && w.getAttribute('tabindex') === '0' && w.getAttribute('role') === 'region' && !!w.getAttribute('aria-label') }
})
ok('contenedor con tabindex/role/aria-label para teclado y lector', acc.ok, JSON.stringify(acc))
const hint = await page.locator('text=Desliza la tabla').count()
ok('pista de deslizamiento visible', hint === 1, `count=${hint}`)
await page.screenshot({ path: SHOTS + '/31-top-mys-390.png', fullPage: true })

await browser.close()
const passed = results.filter(r => r[0] === 'PASS').length
const failed = results.filter(r => r[0] === 'FAIL').length
for (const r of results) console.log(`${r[0]} ${r[1]}${r[2] ? ' — ' + r[2] : ''}`)
console.log(`verify3: ${passed} PASS, ${failed} FAIL`)
