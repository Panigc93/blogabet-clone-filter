import { chromium } from 'playwright'

const BASE = 'http://localhost:3000'

const browser = await chromium.launch()
async function shoot(width, height, file) {
  const ctx = await browser.newContext({ viewport: { width, height } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[name="password"]', 'labproto')
  await page.click('button[type="submit"]')
  await page.waitForURL(`${BASE}/`, { timeout: 15000 }).catch(() => {})
  await page.goto(`${BASE}/lab/tipstrr/ficha`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: file, fullPage: true })
  console.log(file, 'title:', await page.title())
  await ctx.close()
}

await shoot(1280, 900, '/downloads/lab-ficha-desktop.png')
await shoot(390, 844, '/downloads/lab-ficha-mobile.png')

// Section crops for delivery (readable cuts: header / months / periods)
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('input[name="password"]', 'labproto')
await page.click('button[type="submit"]')
await page.waitForURL(`${BASE}/`, { timeout: 15000 }).catch(() => {})
await page.goto(`${BASE}/lab/tipstrr/ficha`, { waitUntil: 'networkidle' })
for (const [id, file] of [
  ['crop-cabecera', '/downloads/lab-ficha-crop-cabecera.png'],
  ['crop-meses', '/downloads/lab-ficha-crop-meses.png'],
  ['crop-periodos', '/downloads/lab-ficha-crop-periodos.png'],
]) {
  await page.locator(`#${id}`).screenshot({ path: file })
  console.log(file)
}
await ctx.close()
await browser.close()
