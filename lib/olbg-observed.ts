// Display-only accumulated sample. Never an all-time statistic or filter value.
import { validCompactOlbg } from '../crawler/platforms/olbg/compact'
export interface OlbgObserved { covered: string[]; tips: number; lsp: number }
export function validOlbgObserved(x: unknown, evidence: unknown): x is OlbgObserved {
  if (!validCompactOlbg(evidence, true) || !x || typeof x !== 'object') return false
  const s=x as OlbgObserved
  return Object.keys(s).every(k=>['covered','tips','lsp'].includes(k)) &&
    Array.isArray(s.covered) && s.covered.length>0 && s.covered.length<=13 &&
    new Set(s.covered).size===s.covered.length &&
    s.covered.every((m,i)=>typeof m==='string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m<=evidence.sourceMonth && (i===0||m>s.covered[i-1])) &&
    Number.isSafeInteger(s.tips) && s.tips>=0 && s.tips<=13_000_000 &&
    typeof s.lsp==='number' && Number.isFinite(s.lsp) && Math.abs(s.lsp)<=13e9 &&
    Math.abs(s.lsp*100-Math.round(s.lsp*100))<1e-5 && (s.tips!==0||s.lsp===0)
}
export function observedMissing(covered:string[]) {
  if(!covered.length)return []
  const first=new Date(covered[0]+'-01T00:00:00Z'),last=covered.at(-1)!,missing:string[]=[]
  for(let i=0;i<120&&first.toISOString().slice(0,7)<=last;i++){
    const month=first.toISOString().slice(0,7);if(!covered.includes(month))missing.push(month)
    first.setUTCMonth(first.getUTCMonth()+1)
  }
  return missing
}
export function formatOlbgMonth(month:string){
 const labels=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
 return `${labels[Number(month.slice(5))-1]} ${month.slice(0,4)}`
}
