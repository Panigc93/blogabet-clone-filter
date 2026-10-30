import { describe, it, expect } from 'vitest'
import { emptyPageOutcome } from '@/crawler/crawl'

describe('emptyPageOutcome (guardia de pagina 0 vacia)', () => {
  it('0 registros en la pagina 0 es fatal (markup o cookie), no "crawl complete"', () => {
    expect(emptyPageOutcome(0)).toBe('fatal')
  })

  it('0 registros en una pagina posterior es el final normal de la paginacion', () => {
    expect(emptyPageOutcome(48)).toBe('end')
    expect(emptyPageOutcome(500)).toBe('end')
  })
})
