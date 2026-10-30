import { TipsterFilters, SortField } from '@/lib/query'

// Shared parsing/validation of listing params for app/page.tsx and app/api/tipsters/route.ts.
// Rules: empty or non-numeric values are ignored (never reach SQL), sort falls back to 'yield',
// page is clamped to a non-negative integer.

const SORT_FIELDS: readonly SortField[] = [
  'yield', 'profit', 'picks', 'followers', 'since_year', 'price', 'yield6m', 'yield12m', 'picks6m_avg',
]

export interface ParsedListParams {
  filters: TipsterFilters
  sort: SortField
  page: number
}

function parseNumber(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

function parseTipo(raw: string | undefined): TipsterFilters['tipo'] {
  return raw === 'free' || raw === 'paid' ? raw : 'all'
}

function parseSort(raw: string | undefined): SortField {
  return (SORT_FIELDS as readonly string[]).includes(raw ?? '') ? (raw as SortField) : 'yield'
}

function parsePage(raw: string | undefined): number {
  const n = parseNumber(raw)
  if (n === undefined || n < 0) return 0
  return Math.floor(n)
}

export function parseListParams(searchParams: Record<string, string | undefined>): ParsedListParams {
  const filters: TipsterFilters = {
    search:         searchParams.search || undefined,
    tipo:           parseTipo(searchParams.tipo),
    minYield:       parseNumber(searchParams.minYield),
    maxYield:       parseNumber(searchParams.maxYield),
    minPicks:       parseNumber(searchParams.minPicks),
    activityMonths: parseNumber(searchParams.activity),
    minYears:       parseNumber(searchParams.minYears),
    priceMin:       parseNumber(searchParams.priceMin),
    priceMax:       parseNumber(searchParams.priceMax),
    conPicksFree:   searchParams.conPicksFree === '1',
    resetOlderThan: searchParams.resetOlderThan === '1',
  }

  return {
    filters,
    sort: parseSort(searchParams.sort),
    page: parsePage(searchParams.page),
  }
}
