import type { TipsterFilters } from './query'
export function parseBEPeriodFilters(p: URLSearchParams): Pick<TipsterFilters,'bePeriod'|'beMinYield'|'beMinPicks'> {
  const period=p.get('bePeriod'),y=p.get('beMinYield'),n=p.get('beMinPicks')
  if (period!==null&&!['3m','6m','12m'].includes(period) || y!==null&&y!==''&&!/^-?\d{1,12}(?:\.\d{1,28})?$/.test(y)
    || n!==null&&n!==''&&!/^\d{1,9}$/.test(n) || (y!==null&&y!==''||n!==null&&n!=='')&&!period) throw Error('Filtros BE no válidos')
  return {bePeriod:period as TipsterFilters['bePeriod']??undefined,beMinYield:y||undefined,beMinPicks:n?Number(n):undefined}
}
