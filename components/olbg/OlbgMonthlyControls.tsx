'use client'
import React from 'react'
import {monthLabel} from '@/lib/olbg-published-monthly'
import {useRouter} from 'next/navigation'
export function OlbgMonthlyControls({params,months}:{params:Record<string,string|undefined>;months:string[]}){
 const router=useRouter(),p=new URLSearchParams(Object.entries(params).filter((x):x is [string,string]=>x[1]!==undefined))
 const month=p.get('olbgMonth')??'latest-available',common=month!=='latest-available'
 const update=(key:string,value:string)=>{
  const q=new URLSearchParams(p);if(value)q.set(key,value);else q.delete(key)
  q.delete('page');q.delete('monthlyCursor');q.delete('periodAnchor')
  if(key==='olbgMonth'&&value==='latest-available'){q.delete('olbgMonthlyOrder');q.delete('olbgRoiMin');q.delete('olbgProfitMin');q.delete('olbgPicksMin')}
  router.push('/?'+q)
 }

 return <section style={{padding:12,background:'#fff',border:'1px solid #ddd',margin:'10px 0',fontSize:12}}>
  <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
   <label>Mes publicado OLBG<br/><select aria-label="Mes publicado OLBG" value={month} onChange={e=>update('olbgMonth',e.target.value)} style={{padding:7,maxWidth:220}}><option value="latest-available">Último mes disponible</option>{months.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
   <label>Orden mensual OLBG<br/><select aria-label="Orden mensual OLBG" disabled={!common} value={p.get('olbgMonthlyOrder')??''} onChange={e=>update('olbgMonthlyOrder',e.target.value)} style={{padding:7}}><option value="">Orden común de la lista</option><option value="roi-desc">ROI publicado ↓</option><option value="profit-desc">Profit OLBG ↓</option><option value="picks-desc">Picks ↓</option></select></label>
   <label>ROI mensual mínimo (%)<br/><input aria-label="ROI mensual mínimo" disabled={!common} type="number" defaultValue={p.get('olbgRoiMin')??''} onBlur={e=>update('olbgRoiMin',e.target.value)} style={{width:95,padding:7}}/></label>
   <label>Meses con resultados (mín.)<br/><select aria-label="Meses con resultados mínimos" value={p.get('olbgResultMonths')??''} onChange={e=>update('olbgResultMonths',e.target.value)} style={{padding:7}}><option value="">Todos</option>{[1,3,6,12].map(n=><option key={n}>{n}</option>)}</select></label>
  </div>
  <p style={{marginBottom:0}}>Estos controles de datos publicados OLBG usan el mes indicado. Un filtro numérico mensual o meses con resultados limita los resultados a OLBG; no mezcla sus cifras con el yield histórico de otras plataformas. Meses con resultados no significa antigüedad desde el alta.</p>
 </section>
}
