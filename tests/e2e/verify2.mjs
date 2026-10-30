import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

// Chrome: PLAYWRIGHT_CHROME_PATH, else system google-chrome, else playwright's own chromium
function chromePath() {
  if (process.env.PLAYWRIGHT_CHROME_PATH) return process.env.PLAYWRIGHT_CHROME_PATH
  for (const c of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    try { execSync(`test -x ${c}`); return c } catch { /* next */ }
  }
  return undefined // playwright-managed chromium (npx playwright install chromium)
}
import crypto from 'node:crypto'

const BASE = process.env.E2E_BASE ?? 'http://localhost:3100'
const SHOTS = process.env.E2E_SHOTS ?? 'tests/e2e/shots'
const results = []
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); if (!cond) process.exitCode = 1 }
const token = crypto.createHmac('sha256', 'test').update('test').digest('hex')

const browser = await chromium.launch({ executablePath: chromePath(), headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addCookies([{ name: 'auth_token', value: token, url: BASE }])
const page = await ctx.newPage()

// 1. LoadMore conserva verified + dir + sort en las páginas siguientes (mock BIG: 1200 generados + 11)
const apiReqs = []
page.on('request', r => { if (r.url().includes('/api/tipsters')) apiReqs.push(r.url()) })
await page.goto(BASE + '/?verified=1&sort=followers&dir=asc', { waitUntil: 'networkidle', timeout: 90000 })
await page.waitForSelector('.tipster-block', { timeout: 60000 })
const initial = (await page.$$('.tipster-block')).length
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForFunction(n => document.querySelectorAll('.tipster-block').length > n, initial, { timeout: 30000 })
const after1 = (await page.$$('.tipster-block')).length
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForFunction(n => document.querySelectorAll('.tipster-block').length > n, after1, { timeout: 30000 })
const after2 = (await page.$$('.tipster-block')).length
ok('loadmore añade filas (50 -> 100 -> 150)', initial === 50 && after1 === 100 && after2 === 150, `${initial}/${after1}/${after2}`)
const pageUrls = apiReqs.filter(u => u.includes('page='))
ok('loadmore emite page=1 y page=2', pageUrls.some(u => u.includes('page=1')) && pageUrls.some(u => u.includes('page=2')), pageUrls.join(' | '))
ok('loadmore conserva verified=1&sort=followers&dir=asc', pageUrls.every(u => {
  const q = new URL(u).searchParams
  return q.get('verified') === '1' && q.get('sort') === 'followers' && q.get('dir') === 'asc'
}), pageUrls.join(' | '))
const firstFollowers = await page.$$eval('.tipster-block .tipster-stats-alltime .stat-cell:last-child .number', els => els.slice(0, 3).map(e => Number(e.textContent)))
ok('orden followers asc se mantiene tras paginar', firstFollowers[0] <= firstFollowers[1] && firstFollowers[1] <= firstFollowers[2], firstFollowers.join(','))
const names = await page.$$eval('.tipster-block', bs => bs.map(b => b.textContent))
ok('loadmore solo trae verificados', names.every(t => !t.includes('Cuenta no verificada')))

// 2. CSV con tope 1000 de 1211 totales
const csvRes = await ctx.request.get(BASE + '/api/tipsters?format=csv')
const csv = await csvRes.text()
ok('csv filename refleja truncamiento', (csvRes.headers()['content-disposition'] || '').includes('tipsters-1000-de-1211.csv'), csvRes.headers()['content-disposition'])
ok('csv aviso de truncamiento visible en primera línea', csv.startsWith('# AVISO: exportacion limitada a las primeras 1000 filas de 1211'))
ok('csv exactamente 1000 filas de datos', csv.trim().split('\r\n').length === 1001 + 1, String(csv.trim().split('\r\n').length))
ok('csv neutraliza =formula en nombre externo', csv.includes("'=HYPERLINK"))
ok('csv fila inyectada no empieza por =', !csv.split('\r\n').some(l => l.startsWith('=')))

// 3. Navegación atrás: filtros y selección no se pierden
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.removeItem('cf-compare-v1'))
await page.goto(BASE + '/?verified=1&dir=asc', { waitUntil: 'networkidle' })
await page.waitForSelector('.tipster-block')
let count = (await page.$$('.tipster-block')).length
ok('vista filtrada inicial (verified+dir)', count === 50, String(count))
const blocks = await page.$$('.tipster-block')
for (const b of blocks.slice(0, 2)) await b.$eval('.tipster-right input[type=checkbox]', i => i.click())
await page.waitForSelector('text=Comparar (2)')
await page.click('text=Comparar (2)')
await page.waitForURL(u => u.pathname === '/comparar')
await page.goBack({ waitUntil: 'networkidle' })
await page.waitForSelector('.tipster-block')
const u = new URL(page.url())
ok('atrás conserva verified=1&dir=asc en la URL', u.searchParams.get('verified') === '1' && u.searchParams.get('dir') === 'asc', page.url())
count = (await page.$$('.tipster-block')).length
ok('atrás conserva resultados filtrados (50, modo BIG)', count === 50, String(count))
ok('atrás conserva selección comparar (2 marcados)', (await page.$$('.tipster-right input[type="checkbox"]:checked')).length === 2 && !!(await page.$('text=Comparar (2)')))

// 4. Bandeja móvil con 4 nombres largos a 320 y 390
await ctx.clearCookies()
await ctx.addCookies([{ name: 'auth_token', value: token, url: BASE }])
await page.addInitScript(() => {
  localStorage.setItem('cf-compare-v1', JSON.stringify([
    { slug: 'gen-0001', name: 'Generado Con Un Nombre Bastante Largo 1' },
    { slug: 'gen-0002', name: 'Generado Con Un Nombre Bastante Largo 2' },
    { slug: 'gen-0003', name: 'Generado Con Un Nombre Bastante Largo 3' },
    { slug: 'gen-0004', name: 'Generado Con Un Nombre Bastante Largo 4' },
  ]))
})
for (const w of [320, 390]) {
  await page.setViewportSize({ width: w, height: 844 })
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForSelector('.compare-tray')
  const tray = await page.$('.compare-tray')
  const box = await tray.boundingBox()
  ok(`bandeja ${w}px cabe en viewport`, box.width <= w && box.x >= 0 && box.x + box.width <= w + 1, JSON.stringify(box))
  const chipWidths = await page.$$eval('.compare-tray-chip', chips => chips.map(c => c.clientWidth))
  ok(`chips ${w}px elipsizados (<=90px cada uno)`, chipWidths.every(cw => cw <= 90), chipWidths.join(','))
  ok(`bandeja ${w}px compacta (altura <= 60px)`, box.height <= 60, String(box.height))
  await page.screenshot({ path: `${SHOTS}/10-tray-${w}.png` })
  // colapsar
  await page.click('.compare-tray >> text=Ocultar')
  const box2 = await (await page.$('.compare-tray')).boundingBox()
  ok(`bandeja ${w}px colapsa`, box2.width < box.width, `${box.width} -> ${box2.width}`)
  await page.screenshot({ path: `${SHOTS}/11-tray-${w}-collapsed.png` })
  await page.click('.compare-tray >> text=Mostrar')
}

await browser.close()
console.log('\n=== RESULTADOS ===')
for (const [st, name, extra] of results) console.log(`${st}  ${name}${extra ? '  -- ' + extra : ''}`)
