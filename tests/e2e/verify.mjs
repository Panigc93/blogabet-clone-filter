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
import fs from 'node:fs'
fs.mkdirSync(process.env.E2E_SHOTS ?? 'tests/e2e/shots', { recursive: true })

const BASE = process.env.E2E_BASE ?? 'http://localhost:3100'
const SHOTS = process.env.E2E_SHOTS ?? 'tests/e2e/shots'
const results = []
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); if (!cond) process.exitCode = 1 }

const token = crypto.createHmac('sha256', 'test').update('test').digest('hex')

const browser = await chromium.launch({ executablePath: chromePath(), headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addCookies([{ name: 'auth_token', value: token, url: BASE }])
const page = await ctx.newPage()
page.on('pageerror', e => { results.push(['FAIL', 'JS exception', String(e)]); process.exitCode = 1 })

const rowSlugs = async () => page.$$eval('.tipster-block a[href*=".blogabet.com"]', as => [...new Set(as.map(a => a.href.replace('https://', '').replace('.blogabet.com', '').replace('/', '')))])

// 1. Listing
await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 90000 })
await page.waitForSelector('.tipster-block', { timeout: 60000 })
let slugs = await rowSlugs()
ok('listing muestra los 11 fixtures', slugs.length === 11, slugs.join(','))
ok('contador de 11', (await page.locator('text=Mostrando').first().textContent()).includes('11 de 11'))
ok('checkbox Comparar en cada fila', (await page.$$('.tipster-right input[type=checkbox]')).length === 11)
const badgeMap = await page.$$eval('.tipster-block', blocks => blocks.map(b => {
  const slug = (b.querySelector('a[href*=".blogabet.com"]')?.getAttribute('href') || '').replace('https://', '').replace('.blogabet.com', '')
  return [slug, b.querySelectorAll('.fa-usd').length, b.querySelectorAll('.fa-check').length, b.querySelectorAll('.fa-times').length]
}))
const bm = Object.fromEntries(badgeMap.map(b => [b[0], b.slice(1)]))
ok('badges $ solo en de pago', bm['gamma-paid'][0] === 1 && bm['eta-paid'][0] === 1 && bm['kappa-free'][0] === 0 && bm['alpha-free'][0] === 0, JSON.stringify(bm).slice(0, 200))
ok('badge verificado correcto', bm['kappa-free'][1] === 0 && bm['kappa-free'][2] === 1 && bm['alpha-free'][1] === 1, JSON.stringify(bm['kappa-free']))
ok('botón Preselección MYS visible', !!(await page.$('text=Preselección MYS')))
ok('caveat MYS visible', !!(await page.$('text=no valida el cumplimiento MYS')))
ok('enlace Exportar CSV visible', !!(await page.$('text=Exportar CSV')))
await page.screenshot({ path: SHOTS + '/01-listing.png', fullPage: true })

// 2. Preset MYS
await page.click('text=Preselección MYS')
await page.waitForURL(u => u.searchParams.get('tipo') === 'free' && u.searchParams.get('minPicks') === '100' && u.searchParams.get('minYield') === '11', { timeout: 30000 })
await page.waitForSelector('.tipster-block', { timeout: 30000 })
slugs = await rowSlugs()
ok('preset filtra free+>=100picks+yield>=11', slugs.join(',') === 'alpha-free,lopez-free,epsilon-free', slugs.join(','))
await page.screenshot({ path: SHOTS + '/02-preset.png', fullPage: true })

// 3. Solo verificados
await page.goto(BASE + '/?verified=1', { waitUntil: 'networkidle' })
await page.waitForSelector('.tipster-block')
slugs = await rowSlugs()
ok('verified=1 deja 7 verificados', slugs.length === 7 && slugs.every(s => !['beta-free','zeta-free','delta-paid','kappa-free'].includes(s)), slugs.join(','))
await page.screenshot({ path: SHOTS + '/03-verified.png', fullPage: true })

// 4. Dir asc/desc sobre precio
await page.goto(BASE + '/?tipo=paid&sort=price&dir=asc', { waitUntil: 'networkidle' })
await page.waitForSelector('.tipster-block')
slugs = await rowSlugs()
ok('precio asc: delta,iota,gamma,eta', slugs.join(',') === 'delta-paid,iota-paid,gamma-paid,eta-paid', slugs.join(','))
await page.screenshot({ path: SHOTS + '/04-price-asc.png', fullPage: true })
await page.goto(BASE + '/?tipo=paid&sort=price', { waitUntil: 'networkidle' })
await page.waitForSelector('.tipster-block')
slugs = await rowSlugs()
ok('precio desc por defecto: eta,gamma,iota,delta', slugs.join(',') === 'eta-paid,gamma-paid,iota-paid,delta-paid', slugs.join(','))

// 5. Comparador
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await page.waitForSelector('.tipster-block')
const wanted = ['alpha-free', 'gamma-paid', 'lopez-free']
for (const w of wanted) {
  const blocks = await page.$$('.tipster-block')
  for (const b of blocks) {
    const html = await b.innerHTML()
    if (html.includes(w + '.blogabet.com')) { await b.$eval('.tipster-right input[type=checkbox]', i => i.click()); break }
  }
}
await page.waitForSelector('text=Comparar (3)', { timeout: 10000 })
ok('bandeja comparar aparece con 3', true)
await page.screenshot({ path: SHOTS + '/05-tray.png' })
await page.click('text=Comparar (3)')
await page.waitForURL(u => u.pathname === '/comparar', { timeout: 30000 })
await page.waitForSelector('table')
const headers = await page.$$eval('thead th', ths => ths.map(t => t.textContent.trim()).filter(Boolean))
ok('comparar: 3 columnas de tipsters', headers.length === 3, headers.join('|'))
const bodyText = await page.textContent('tbody')
ok('comparar muestra métricas clave', ['Yield 6m', 'Picks', 'Seguidores', 'Resets', 'Cuenta verificada'].every(m => bodyText.includes(m)))
const highlighted = await page.$$eval('td[style*="eef3f9"]', tds => tds.length)
ok('valor más alto resaltado (neutro)', highlighted > 0, String(highlighted))
await page.screenshot({ path: SHOTS + '/06-compare.png', fullPage: true })
// slugs desconocidos
// accesibilidad móvil de la tabla comparativa (mismo patrón que /top-mys)
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(BASE + '/comparar?slugs=alpha-free,lopez-free,epsilon-free', { waitUntil: 'networkidle' })
await page.waitForSelector('table')
ok('comparar: pista de deslizamiento visible', await page.locator('p:has-text("Desliza la tabla")').count() === 1)
const cAcc = await page.evaluate(() => {
  const region = document.querySelector('div[role="region"]')
  if (!region) return { ok: false }
  const cs = getComputedStyle(region)
  const ths = [...region.querySelectorAll('thead th')]
  const lastTh = ths[ths.length - 1]
  const before = lastTh.getBoundingClientRect().right
  region.scrollLeft = region.scrollWidth
  const after = lastTh.getBoundingClientRect().right
  region.scrollLeft = 0
  return { ok: true, tab: region.getAttribute('tabindex'), aria: region.getAttribute('aria-label'),
    ox: cs.overflowX, sw: region.scrollWidth, cw: region.clientWidth, before: Math.round(before), after: Math.round(after), w: innerWidth }
})
ok('comparar: contenedor con tabindex/role/aria-label', cAcc.ok && cAcc.tab === '0' && !!cAcc.aria, JSON.stringify(cAcc))
ok('comparar: tabla desplazable a 390px y última columna alcanzable', cAcc.ok && cAcc.ox === 'auto' && cAcc.sw > cAcc.cw && cAcc.after <= cAcc.w + 1 && cAcc.before > cAcc.w, JSON.stringify(cAcc))
await page.setViewportSize({ width: 1280, height: 900 })
// slugs desconocidos
await page.goto(BASE + '/comparar?slugs=alpha-free,no-existe,bad%20slug!', { waitUntil: 'networkidle' })
const warn = await page.textContent('body')
ok('comparar: avisa de no encontrados e inválidos', warn.includes('no-existe') && warn.includes('Valores ignorados'))
// localStorage persiste tras recarga
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await page.waitForSelector('text=Comparar (3)', { timeout: 10000 })
ok('selección comparar persiste (localStorage)', true)

// 6. CSV
const csvRes = await ctx.request.get(BASE + '/api/tipsters?format=csv&tipo=free&minPicks=100&minYield=11')
const csv = await csvRes.text()
ok('csv content-type', (csvRes.headers()['content-type'] || '').includes('text/csv'))
ok('csv filename con conteo', (csvRes.headers()['content-disposition'] || '').includes('tipsters-3-de-3.csv'), csvRes.headers()['content-disposition'])
const csvLines = csv.trim().split('\r\n')
ok('csv 3 filas + cabecera', csvLines.length === 4, String(csvLines.length))
ok('csv escapa nombre con comas/comillas', csv.includes('"López, ""El"" Mejor"'))
ok('csv respeta orden yield desc', csvLines[1].startsWith('Alpha Free') && csvLines[3].startsWith('Epsilon Free'))
ok('csv sin aviso de truncamiento cuando cabe', !csv.includes('AVISO'))
fs.writeFileSync(SHOTS + '/export.csv', csv)
// CSV de la API pública: JSON sigue funcionando con dir/verified
const jsonRes = await ctx.request.get(BASE + '/api/tipsters?verified=1&sort=followers&dir=asc')
const json = await jsonRes.json()
ok('api json respeta verified+dir', json.data.length === 7 && json.data[0].slug === 'epsilon-free' && json.data[6].slug === 'gamma-paid' && json.data.map(r => r.followers).every((f, i, a) => i === 0 || a[i-1] <= f), json.data.map(r => r.slug).join(','))

// 7. Móvil
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await page.waitForSelector('.tipster-block')
await page.screenshot({ path: SHOTS + '/07-mobile.png', fullPage: true })
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
ok('móvil sin overflow horizontal', !overflow)

await browser.close()
console.log('\n=== RESULTADOS ===')
for (const [st, name, extra] of results) console.log(`${st}  ${name}${extra ? '  -- ' + extra : ''}`)
