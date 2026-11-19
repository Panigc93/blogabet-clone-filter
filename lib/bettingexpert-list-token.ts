import {createHash} from 'node:crypto'
import type {TipsterFilters,SortField} from './query'
export function beListToken(revision:string|null,filters:TipsterFilters,sort:SortField) {
  const canonical=Object.fromEntries(Object.entries(filters).filter(([,v])=>v!==undefined&&v!==false&&v!=='all').sort(([a],[b])=>a.localeCompare(b)))
  return revision===null?null:createHash('sha256').update(JSON.stringify({revision,filters:canonical,sort,pageSize:50})).digest('hex')
}
