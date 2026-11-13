// Capturas del demo local con Chrome del sistema
import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:3456'
const OUT = '/home/sandbox/demo/shots'
import { mkdirSync } from 'fs'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })

async function shot(name, path, width = 1440, height = 900, fullPage = false) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 })
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage })
  const text = await page.evaluate(() => document.body.innerText.slice(0, 200).replace(/\n+/g, ' | '))
  console.log(name, '::', text)
  await page.close()
  return page
}

// slugs para el comparador desde la API publica del demo
const res = await fetch(`${BASE}/api/tipsters?minYield=15&sort=yield`)
const data = await res.json()
const items = data.data ?? data
const slugs = (Array.isArray(items) ? items : []).slice(0, 3).map(t => t.slug).join(',')
console.log('compare slugs:', slugs)

await shot('01-listado-desktop', '/')
await shot('02-filtros-desktop', '/?minYield=10&tipo=free')
await shot('03-top-mys-desktop', '/top-mys')
if (slugs) await shot('04-comparar-desktop', `/comparar?slugs=${slugs}`)
await shot('05-listado-movil', '/', 390, 844)
await shot('06-top-mys-movil', '/top-mys', 390, 844)

await browser.close()
const csv = await fetch(`${BASE}/api/tipsters?format=csv`); const csvText = await csv.text(); console.log('csv lines:', csvText.trim().split('\n').length, 'header:', csvText.split('\n')[0].slice(0,80)); const f = await fetch(`${BASE}/api/tipsters?tipo=paid`); const fd = await f.json(); console.log('paid rows:', fd.data.length, 'allPaid:', fd.data.every(t => t.isPaid));
console.log('done')
