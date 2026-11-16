import { describe, it, expect } from 'vitest'
import * as cheerio from 'cheerio'
import {
  parseMonthly,
  parseSubscribePrice,
  monthlyClosesWithTotals,
  type Bet2InvestProfile,
} from '@/crawler/platforms/bet2invest/parse'

// SYNTHETIC fixtures reproducing the aria-label shape seen 2026-11-16.
const bar = (label: string) =>
  `<button aria-label="${label}" data-testid="stats-month"><span></span></button>`
const monthly = (labels: string[]) =>
  cheerio.load(`<section data-testid="stats-monthly"><h2>Profit by month</h2>${labels.map(bar).join('')}</section>`)

describe('parseMonthly', () => {
  it('parsea meses contiguos con bets y profit exactos', () => {
    const r = parseMonthly(monthly(['11/2024 · 25 bets · -0.10 U', '12/2024 · 22 bets · +0.68 U', '1/2025 · 21 bets · -2.26 U']))
    expect(r).toEqual([
      { year: 2024, month: 11, bets: 25, profitUnits: -0.1 },
      { year: 2024, month: 12, bets: 22, profitUnits: 0.68 },
      { year: 2025, month: 1, bets: 21, profitUnits: -2.26 },
    ])
  })
  it('descarta toda la serie ante una barra mal formada, duplicada, fuera de rango o con hueco', () => {
    expect(parseMonthly(monthly(['1/2025 · 2 bets · +1.00 U', 'basura']))).toBeNull()
    expect(parseMonthly(monthly(['1/2025 · 2 bets · +1.00 U', '1/2025 · 2 bets · +1.00 U']))).toBeNull()
    expect(parseMonthly(monthly(['13/2025 · 2 bets · +1.00 U']))).toBeNull()
    expect(parseMonthly(monthly(['1/2025 · 2 bets · +1.00 U', '3/2025 · 2 bets · +1.00 U']))).toBeNull()
    expect(parseMonthly(monthly(['1/2025 · 2 bets · 1.00 U']))).toBeNull()
  })
  it('null sin barras', () => {
    expect(parseMonthly(cheerio.load('<section data-testid="stats-monthly"></section>'))).toBeNull()
  })
})

describe('monthlyClosesWithTotals', () => {
  const base = { statsScope: 'all_time', settledBets: 68, profitUnits: -1.68 } as Bet2InvestProfile
  const months = [
    { year: 2024, month: 11, bets: 25, profitUnits: -0.1 },
    { year: 2024, month: 12, bets: 22, profitUnits: 0.68 },
    { year: 2025, month: 1, bets: 21, profitUnits: -2.26 },
  ]
  it('cierra: bets exactos y profit en intervalo de redondeo', () => {
    expect(monthlyClosesWithTotals({ ...base, monthly: months })).toBe(true)
  })
  it('no cierra si bets difieren, profit fuera de intervalo, o no es all_time', () => {
    expect(monthlyClosesWithTotals({ ...base, settledBets: 69, monthly: months })).toBe(false)
    expect(monthlyClosesWithTotals({ ...base, profitUnits: -1.0, monthly: months })).toBe(false)
    expect(monthlyClosesWithTotals({ ...base, statsScope: 'other_period', monthly: months })).toBe(false)
    expect(monthlyClosesWithTotals({ ...base, monthly: null })).toBe(false)
  })
})

describe('parseSubscribePrice', () => {
  const page = (inner: string) => cheerio.load(`<div>${inner}</div>`)
  it('lee el boton publico literal sin conversion', () => {
    expect(parseSubscribePrice(page('<button>Subscribe · $40.95/Month</button>'))).toEqual({
      amount: 40.95, currency: '$', period: 'Month', text: 'Subscribe · $40.95/Month',
    })
  })
  it('null si no coincide, otra divisa, otro periodo o es ambiguo', () => {
    expect(parseSubscribePrice(page('<button>Subscribe</button>'))).toBeNull()
    expect(parseSubscribePrice(page('<button>Subscribe · €40.95/Month</button>'))).toBeNull()
    expect(parseSubscribePrice(page('<button>Subscribe · $40.95/Year</button>'))).toBeNull()
    expect(parseSubscribePrice(page('<button>Subscribe · $40.95/Month</button><button>Subscribe · $9.00/Month</button>'))).toBeNull()
  })
})
