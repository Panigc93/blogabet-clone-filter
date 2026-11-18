import {validateOlbgAvatarUrl} from './olbg-approved-avatar'
// Preparation only. No network, DB, activation or fixed-stake yield calculation.
export interface PublishedMonth {
  month: string
  picks: number
  roiPublished: number | null
  profitPublished: number
  source: { date: string; tips: string; roi: string; profit: string }
}
export interface PublishedMonthlyProfile {
  id: number
  name: string
  avatarUrl?:string|null
  joinedAt: string
  capturedAt: string
  sourceUrl: string
  months: PublishedMonth[]
}
export interface MonthlyDisplay {
  captureMonth: string
  selectedMonth: string
  currentMonth: boolean
  selected: PublishedMonth | null
  history: PublishedMonth[]
}
const labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function sourceNumber(x: unknown, integer = false): number {
  if (typeof x !== 'string' || !/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(x)) throw Error('Invalid published number')
  const n = Number(x.replaceAll(',', ''))
  if (!Number.isFinite(n) || (integer && !Number.isSafeInteger(n))) throw Error('Invalid published number')
  return n
}
export function validMonth(month: string): boolean { return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) }
export function publishedMonth(row: Record<string, unknown>): PublishedMonth {
  if (typeof row.date !== 'string') throw Error('Invalid month label')
  const m = /^(\w{3}) (\d{4})$/.exec(row.date)
  const monthIndex = m ? labels.indexOf(m[1]) : -1
  if (!m || monthIndex < 0) throw Error('Invalid month label')
  const picks = sourceNumber(row.tips, true)
  if (picks < 0) throw Error('Negative picks')
  if (typeof row.roi !== 'string' || !/^[+-]?\d+%$/.test(row.roi)) throw Error('Invalid published ROI')
  const profitPublished = sourceNumber(row.profit)
  return {month:`${m[2]}-${String(monthIndex+1).padStart(2,'0')}`, picks,
    roiPublished:picks === 0 ? null : Number(row.roi.slice(0,-1)), profitPublished,
    source:{date:row.date,tips:row.tips as string,roi:row.roi,profit:row.profit as string}}
}
export function validateMonthlyProfile(p: PublishedMonthlyProfile): PublishedMonthlyProfile {
  if (!Number.isSafeInteger(p.id) || p.id <= 0 || !p.name.trim()) throw Error('Invalid identity')
  if(p.avatarUrl!==undefined&&p.avatarUrl!==null)validateOlbgAvatarUrl(p.avatarUrl)
  const u = new URL(p.sourceUrl)
  if (u.origin !== 'https://www.olbg.com' || u.pathname !== `/tipsters/about/${p.id}` || u.search || u.hash || u.username || u.password) throw Error('Identity URL mismatch')
  if (!/^\d{4}-\d\d-\d\d$/.test(p.joinedAt) || new Date(p.joinedAt+'T00:00:00Z').toISOString().slice(0,10)!==p.joinedAt) throw Error('Invalid join date')
  if (!/Z$|[+-]\d\d:\d\d$/.test(p.capturedAt) || !Number.isFinite(Date.parse(p.capturedAt))) throw Error('Invalid capture time')
  const seen = new Set<string>()
  for (const m of p.months) {
    if (!validMonth(m.month) || seen.has(m.month)) throw Error('Duplicate/invalid month')
    const decoded = publishedMonth(m.source)
    if (decoded.month!==m.month || decoded.picks!==m.picks || decoded.roiPublished!==m.roiPublished || decoded.profitPublished!==m.profitPublished) throw Error('Source value mismatch')
    if (m.month > p.capturedAt.slice(0,7)) throw Error('Future source month')
    seen.add(m.month)
  }
  return p
}
export function selectPublishedMonth(p: PublishedMonthlyProfile, month: string): MonthlyDisplay {
  validateMonthlyProfile(p)
  if (!validMonth(month)) throw Error('Invalid selected month')
  return {captureMonth:p.capturedAt.slice(0,7),selectedMonth:month,currentMonth:month===p.capturedAt.slice(0,7),selected:p.months.find(m=>m.month===month)??null,
    history:[...p.months].sort((a,b)=>b.month.localeCompare(a.month))}
}
export interface MonthlyQuery {
  month: string | 'latest-available'
  minResultMonths?: number
  order: 'name' | 'roi-desc' | 'profit-desc' | 'picks-desc'
  roiMin?: number
  profitMin?: number
  picksMin?: number
}
// This query accepts ONLY OLBG published-month profiles. Never reuse the
// shared cross-platform yield fields for these values. Filter before paginate.
export function queryPublishedMonths(profiles: PublishedMonthlyProfile[], q: MonthlyQuery): PublishedMonthlyProfile[] {
  if (q.month!=='latest-available'&&!validMonth(q.month)) throw Error('Invalid query month')
  if(q.month==='latest-available'&&(q.order!=='name'||q.roiMin!==undefined||q.profitMin!==undefined||q.picksMin!==undefined))throw Error('Select a common month for numeric comparisons')
  if(q.minResultMonths!==undefined&&(!Number.isSafeInteger(q.minResultMonths)||q.minResultMonths<0))throw Error('Invalid result-month count')
  if (!['name','roi-desc','profit-desc','picks-desc'].includes(q.order)) throw Error('Invalid ordering')
  for (const n of [q.roiMin,q.profitMin,q.picksMin]) if (n!==undefined&&!Number.isFinite(n)) throw Error('Invalid filter')
  const items=profiles.map(p=>({p,m:selectPublishedMonth(p,q.month==='latest-available'?latestAvailableMonth(p):q.month).selected})).filter(({p,m})=>
    (q.minResultMonths===undefined||resultMonthCount(p)>=q.minResultMonths)&&
    (q.roiMin===undefined || (m?.roiPublished!=null&&m.roiPublished>=q.roiMin))&&
    (q.profitMin===undefined || (m!=null&&m.profitPublished>=q.profitMin))&&
    (q.picksMin===undefined || (m!=null&&m.picks>=q.picksMin)))
  const key=q.order==='roi-desc'?'roiPublished':q.order==='profit-desc'?'profitPublished':'picks'
  items.sort((a,b)=>{
    if(q.order==='name') return a.p.name.localeCompare(b.p.name)||a.p.id-b.p.id
    const av=a.m?.[key]??null,bv=b.m?.[key]??null
    if(av===null&&bv!==null)return 1
    if(av!==null&&bv===null)return -1
    // Equal published integers remain equal performance. Name/ID only make
    // pagination deterministic, not a claimed difference in performance.
    return (av===null||bv===null?0:bv-av)||a.p.name.localeCompare(b.p.name)||a.p.id-b.p.id
  })
  return items.map(x=>x.p)
}
export function monthLabel(month: string): string {
  if(!validMonth(month))throw Error('Invalid month')
  return new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T00:00:00Z'))
}

// Counts observed positive-pick monthly results, not account age, elapsed
// months, consecutive coverage or proof that no unobserved bets exist.
export function resultMonthCount(p:PublishedMonthlyProfile):number {validateMonthlyProfile(p);return p.months.filter(m=>m.picks>0).length}
export function latestAvailableMonth(p:PublishedMonthlyProfile):string {validateMonthlyProfile(p);if(!p.months.length)throw Error('No available month');return [...p.months].map(m=>m.month).sort().at(-1)!}
