import { chromium } from 'playwright-core'
import crypto from 'node:crypto'
const BASE = 'http://localhost:3939'
const token = crypto.createHmac('sha256', 'localsecret').update('localtest').digest('hex')
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' })
const ctx = await browser.newContext()
await ctx.addCookies([{ name: 'auth_token', value: token, url: BASE }])
const page = await ctx.newPage()
await page.goto(`${BASE}/lab/protipster`, { waitUntil: 'networkidle', timeout: 60000 })
const titles = await page.$$eval('[title]', els => els.map(e => e.getAttribute('title')).filter(t => t && (t.includes('meses') || t.includes('Ventana'))))
console.log(JSON.stringify(titles, null, 1))
await browser.close()
