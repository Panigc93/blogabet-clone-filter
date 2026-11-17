import { chromium } from 'playwright'
const BASE = 'http://localhost:3000'
const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('input[name="password"]', 'labproto')
await page.click('button[type="submit"]')
await page.waitForURL(`${BASE}/`, { timeout: 15000 }).catch(() => {})
const resp = await page.goto(`${BASE}/lab/bet2invest`, { waitUntil: 'networkidle' })
console.log('status:', resp.status(), 'url:', page.url())
await browser.close()
