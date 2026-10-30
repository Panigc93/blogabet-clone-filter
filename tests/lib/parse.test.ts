import { describe, it, expect } from 'vitest'
import { parseListParams } from '@/lib/parseFilters'

describe('parseListParams', () => {
  it('returns defaults for empty params', () => {
    const { filters, sort, page } = parseListParams({})
    expect(filters).toEqual({
      search: undefined,
      tipo: 'all',
      minYield: undefined,
      maxYield: undefined,
      minPicks: undefined,
      activityMonths: undefined,
      minYears: undefined,
      priceMin: undefined,
      priceMax: undefined,
      conPicksFree: false,
      resetOlderThan: false,
    })
    expect(sort).toBe('yield')
    expect(page).toBe(0)
  })

  it('parses valid numeric filters', () => {
    const { filters } = parseListParams({ minYield: '10.5', maxYield: '-3', minPicks: '100', activity: '6', minYears: '2', priceMin: '5', priceMax: '20' })
    expect(filters.minYield).toBe(10.5)
    expect(filters.maxYield).toBe(-3)
    expect(filters.minPicks).toBe(100)
    expect(filters.activityMonths).toBe(6)
    expect(filters.minYears).toBe(2)
    expect(filters.priceMin).toBe(5)
    expect(filters.priceMax).toBe(20)
  })

  it('ignores non-numeric values instead of passing NaN to SQL', () => {
    const { filters } = parseListParams({ minYield: 'abc', minPicks: 'NaN', activity: 'x', priceMin: '--5' })
    expect(filters.minYield).toBeUndefined()
    expect(filters.minPicks).toBeUndefined()
    expect(filters.activityMonths).toBeUndefined()
    expect(filters.priceMin).toBeUndefined()
  })

  it('ignores empty string values', () => {
    // ?minYield= used to become a silent yield >= 0 filter in the API route
    const { filters } = parseListParams({ minYield: '', maxYield: '  ' })
    expect(filters.minYield).toBeUndefined()
    expect(filters.maxYield).toBeUndefined()
  })

  it('accepts only known tipo values', () => {
    expect(parseListParams({ tipo: 'free' }).filters.tipo).toBe('free')
    expect(parseListParams({ tipo: 'paid' }).filters.tipo).toBe('paid')
    expect(parseListParams({ tipo: 'whatever' }).filters.tipo).toBe('all')
    expect(parseListParams({}).filters.tipo).toBe('all')
  })

  it('accepts only known sort fields, falls back to yield', () => {
    expect(parseListParams({ sort: 'profit' }).sort).toBe('profit')
    expect(parseListParams({ sort: 'picks6m_avg' }).sort).toBe('picks6m_avg')
    expect(parseListParams({ sort: 'DROP TABLE' }).sort).toBe('yield')
    expect(parseListParams({}).sort).toBe('yield')
  })

  it('clamps page to a non-negative integer', () => {
    expect(parseListParams({ page: '3' }).page).toBe(3)
    expect(parseListParams({ page: '2.9' }).page).toBe(2)
    expect(parseListParams({ page: '-1' }).page).toBe(0)
    expect(parseListParams({ page: 'abc' }).page).toBe(0)
    expect(parseListParams({ page: '' }).page).toBe(0)
  })

  it('parses boolean flags only from exact "1"', () => {
    expect(parseListParams({ conPicksFree: '1', resetOlderThan: '1' }).filters.conPicksFree).toBe(true)
    expect(parseListParams({ conPicksFree: '1', resetOlderThan: '1' }).filters.resetOlderThan).toBe(true)
    expect(parseListParams({ conPicksFree: 'true' }).filters.conPicksFree).toBe(false)
    expect(parseListParams({ resetOlderThan: '0' }).filters.resetOlderThan).toBe(false)
  })

  it('treats empty search as no search', () => {
    expect(parseListParams({ search: '' }).filters.search).toBeUndefined()
    expect(parseListParams({ search: 'faro' }).filters.search).toBe('faro')
  })
})

describe('parseListParams - compatibilidad con URLs legacy válidas', () => {
  it('URL completa legacy: tipo pago + precio + picks free + orden precio', () => {
    // URL que FilterBar genera hoy: /?tipo=paid&conPicksFree=1&priceMin=5&priceMax=20&sort=price
    const { filters, sort, page } = parseListParams({ tipo: 'paid', conPicksFree: '1', priceMin: '5', priceMax: '20', sort: 'price' })
    expect(filters.tipo).toBe('paid')
    expect(filters.conPicksFree).toBe(true)
    expect(filters.priceMin).toBe(5)
    expect(filters.priceMax).toBe(20)
    expect(sort).toBe('price')
    expect(page).toBe(0)
  })

  it('URL legacy: búsqueda con espacios y acentos se conserva tal cual', () => {
    const { filters } = parseListParams({ search: 'faro león' })
    expect(filters.search).toBe('faro león')
  })

  it('URL legacy: actividad/años/picks/reset exactamente como antes', () => {
    const { filters } = parseListParams({ activity: '3', minYears: '2', minPicks: '500', resetOlderThan: '1' })
    expect(filters.activityMonths).toBe(3)
    expect(filters.minYears).toBe(2)
    expect(filters.minPicks).toBe(500)
    expect(filters.resetOlderThan).toBe(true)
  })

  it('minYield=0 sigue siendo un filtro real (como en la página legacy)', () => {
    // La página SSR legacy trataba '0' como valor (string truthy -> Number('0') = 0)
    const { filters } = parseListParams({ minYield: '0' })
    expect(filters.minYield).toBe(0)
  })

  it('notación científica válida se comporta como el Number() legacy', () => {
    expect(parseListParams({ minYield: '1e1' }).filters.minYield).toBe(10)
  })

  it('page legacy válido se conserva', () => {
    expect(parseListParams({ page: '4' }).page).toBe(4)
  })

  it('números con decimales europeos (coma) se ignoran, igual que Number() legacy daba NaN', () => {
    // '10,5' nunca fue válido: antes llegaba NaN a SQL, ahora se ignora limpiamente
    expect(parseListParams({ minYield: '10,5' }).filters.minYield).toBeUndefined()
  })

  it('Infinity no llega a SQL', () => {
    expect(parseListParams({ minYield: 'Infinity' }).filters.minYield).toBeUndefined()
    expect(parseListParams({ page: 'Infinity' }).page).toBe(0)
  })

  it('páginas muy grandes se acotan a entero sin desbordar', () => {
    expect(parseListParams({ page: '999999999999' }).page).toBe(999999999999)
    expect(Number.isSafeInteger(parseListParams({ page: '999999999999' }).page)).toBe(true)
  })
})
