import { chromium } from '/tmp/cf/node_modules/playwright/index.mjs'
const b = await chromium.launch()
const pg = await b.newPage({ viewport: { width: 1280, height: 1000 } })
await pg.goto('http://localhost:3100/login', { waitUntil: 'networkidle' })
await pg.fill('input[name=password]', 'testpw')
await Promise.all([pg.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 }), pg.click('button[type=submit]')])
for (const q of ['platform=blogabet&tipo=all&priceMin=55', 'platform=blogabet&tipo=all&priceMax=20', 'platform=all&tipo=paid&search=ibet-35']) {
  const r = await pg.evaluate(async (q) => {
    const res = await fetch('/api/tipsters?' + q)
    const j = await res.json()
    return { n: (j.data||[]).length, rows: (j.data||[]).map(t => ({slug: t.slug, isPaid: t.isPaid, price: t.price, accessClass: t.accessClass, accessPrice: t.accessPrice})) }
  }, q)
  console.log('API ' + q + ' :: ' + JSON.stringify(r))
}
const shots = [
  ['/?platform=all&search=ibet-35', '/downloads/ui-e2e-card-ibet35.png'],
  ['/?platform=all&search=versustips11', '/downloads/ui-e2e-card-versustips11.png'],
]
for (const [path, file] of shots) {
  await pg.goto('http://localhost:3100' + path, { waitUntil: 'networkidle' })
  await pg.waitForTimeout(800)
  const r = await pg.evaluate(() => {
    const blocks = [...document.querySelectorAll('.tipster-block')]
    return blocks.map(x => ({
      paidBadge: !!x.querySelector('[title="De pago"]'),
      text: (x.textContent || '').replace(/\s+/g, ' ').slice(0, 220),
    }))
  })
  console.log('UI ' + path + ' :: ' + JSON.stringify(r))
  await pg.screenshot({ path: file, fullPage: false })
}
await b.close()
