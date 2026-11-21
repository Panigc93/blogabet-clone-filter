import { chromium } from 'playwright-core'
import crypto from 'node:crypto'
const BASE = 'http://localhost:3939'
const token = crypto.createHmac('sha256', 'localsecret').update('localtest').digest('hex')
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' })
const ctx = await browser.newContext({ viewport: { width: 1491, height: 900 } })
await ctx.addCookies([{ name: 'auth_token', value: token, url: BASE }])
const page = await ctx.newPage()
await page.goto(`${BASE}/lab/bet2earn`, { waitUntil: 'networkidle', timeout: 60000 })
await page.screenshot({ path: '/downloads/bet2earn-lab-preview.png', fullPage: true })
console.log('shot ok, title:', await page.title())
console.log('body:', (await page.innerText('body')).slice(0, 500))
await browser.close()
