import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseProfilePage } from '@/crawler/platforms/bet2invest/parse'
import { bet2investProfileToInsert } from '@/crawler/platforms/bet2invest/to-db'
import { buildOfflineRow } from '@/crawler/platforms/bet2invest/offline-import'

const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8')
const AT = new Date('2026-11-17T16:27:00Z')
const map = (p: ReturnType<typeof parseProfilePage>) => bet2investProfileToInsert(p, { id: -1, idSource: 'isolated-fixture', slug: 's', capturedAt: AT })

describe('etiqueta "paid tipster" (pagina real 1BETORIA1, reducida)', () => {
  const html = fx('b2i-paid-label.html')
  it('el parser la reconoce con procedencia; no es PRO ni Free', () => {
    const p = parseProfilePage(html)
    expect(p.accountType).toBe('paid')
    expect(p.accountLabel).toBe('og:title+description')
  })
  it('fila: isPaid true por etiqueta literal, pero precio y seguidores quedan null (no se supone importe)', () => {
    const r = buildOfflineRow({ slug: '1BETORIA1', html, monthsJson: JSON.parse(fx('b2i-paid-label-months.json')), capturedAt: AT, surrogateId: -1 })
    expect(r.status).toBe('row')
    if (r.status !== 'row') return
    expect(r.insert).toMatchObject({ isPaid: true, price: null, followers: null })
  })
  it('conflicto entre campos (titulo Free, descripcion paid): unknown, cuarentena', () => {
    const r = buildOfflineRow({ slug: 'x', html: html.replace('Paid Tipster on Bet2Invest', 'Free Tipster on Bet2Invest'), monthsJson: null, capturedAt: AT, surrogateId: -2 })
    expect(r.status).toBe('quarantine')
    expect(parseProfilePage(html.replace('Paid Tipster on Bet2Invest', 'Free Tipster on Bet2Invest')).accountLabel).toBeNull()
  })
  it('dos clases dentro de un mismo campo: unknown', () => {
    const p = parseProfilePage(html.replace(/(og:description" content="Discover [^"]*a paid tipster)/, '$1, PRO Tipster'))
    expect(p.accountType).toBe('unknown')
  })
})

describe('cierre profit por deporte: epsilon 1e-9 (paginas reales afectadas) y limite que se sigue rechazando', () => {
  for (const [slug, file] of [['godknows', 'b2i-float-godknows.html'], ['vokal', 'b2i-float-vokal.html']] as const) {
    it(`${slug}: un deporte, diferencia exacta 0.01 -> pasa`, () => {
      const p = parseProfilePage(fx(file))
      expect(p.bySport).toHaveLength(1)
      expect(Math.abs((p.bySport[0].profitUnits as number) - (p.profitUnits as number))).toBeGreaterThan(0.0099)
      expect(map(p).ok).toBe(true)
    })
    it(`${slug}: 0.001 por encima del limite (0.011) -> cuarentena cierre-deporte-profit`, () => {
      const p = parseProfilePage(fx(file))
      const bad = { ...p, bySport: [{ ...p.bySport[0], profitUnits: (p.bySport[0].profitUnits as number) + (p.bySport[0].profitUnits! > p.profitUnits! ? 0.001 : -0.001) }] }
      const m = map(bad)
      expect(m.ok).toBe(false)
      expect(m.ok === false && m.reason).toContain('cierre-deporte-profit')
    })
  }
})
