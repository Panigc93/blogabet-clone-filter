import { chromium } from '/tmp/cf/node_modules/playwright/index.mjs'
const b = await chromium.launch()
const pg = await b.newPage({ viewport: { width: 1280, height: 1600 } })
await pg.goto('http://localhost:3100/login', { waitUntil: 'networkidle' })
await pg.fill('input[name=password]', 'testpw')
await Promise.all([pg.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 }), pg.click('button[type=submit]')])
// API checks through the browser session
for (const q of ['platform=all&tipo=free', 'platform=all&tipo=paid', 'platform=all']) {
  const r = await pg.evaluate(async (q) => {
    const res = await fetch('/api/tipsters?' + q)
    const j = await res.json()
    const rows = j.data || j.tipsters || j.rows || j.items || []
    return { status: res.status, keys: Object.keys(j), n: rows.length, slugs: rows.map(t => t.slug || t.name) }
  }, q)
  console.log('API ' + q + ' :: ' + JSON.stringify(r))
}
// UI screenshots
const shots = [
  ['/?platform=all', '/downloads/ui-e2e-access-todos.png'],
  ['/?platform=all&tipo=free', '/downloads/ui-e2e-access-free.png'],
  ['/?platform=all&tipo=paid', '/downloads/ui-e2e-access-paid.png'],
]
for (const [path, file] of shots) {
  await pg.goto('http://localhost:3100' + path, { waitUntil: 'networkidle' })
  await pg.waitForTimeout(800)
  const r = await pg.evaluate(() => {
    const blocks = [...document.querySelectorAll('.tipster-block')]
    const names = blocks.map(x => (x.textContent || '').slice(0, 60))
    return { cards: blocks.length, names }
  })
  console.log('UI ' + path + ' :: cards=' + r.cards + ' :: ' + JSON.stringify(r.names.slice(0, 8)))
  await pg.screenshot({ path: file, fullPage: false })
}
await b.close()
