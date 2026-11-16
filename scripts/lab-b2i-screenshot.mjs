import { chromium } from 'playwright'

const BASE = 'http://localhost:3111'
const browser = await chromium.launch()
async function shoot(width, height, file) {
  const ctx = await browser.newContext({ viewport: { width, height } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[name="password"]', 'labproto')
  await page.click('button[type="submit"]')
  await page.waitForURL(`${BASE}/`, { timeout: 15000 }).catch(() => {})
  const resp = await page.goto(`${BASE}/lab/bet2invest`, { waitUntil: 'networkidle' })
  console.log('status', resp.status())
  await page.screenshot({ path: file, fullPage: true })
  console.log(file, 'title:', await page.title())
  await ctx.close()
}
await shoot(1280, 900, '/downloads/lab-bet2invest-desktop.png')
await shoot(390, 844, '/downloads/lab-bet2invest-mobile.png')
await browser.close()
