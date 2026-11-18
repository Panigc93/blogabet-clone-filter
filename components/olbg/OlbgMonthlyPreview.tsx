'use client'
import React,{useState} from 'react'
import {TipsterRow} from '@/components/TipsterRow'
import {fromPublishedOlbgMonth} from '@/components/olbg-monthly-card-model'
import {monthLabel,latestAvailableMonth,queryPublishedMonths,type PublishedMonthlyProfile,type MonthlyQuery} from '@/lib/olbg-published-monthly'
// Reusable preparation surface only. No production data loader imports this.
export function OlbgMonthlyPreview({profiles}:{profiles:PublishedMonthlyProfile[]}){
 const [month,setMonth]=useState('latest-available')
 const [order,setOrder]=useState<MonthlyQuery['order']>('name')
 const [minimum,setMinimum]=useState('')
 const [minMonths,setMinMonths]=useState('0')
 const common=month!=='latest-available'
 const options=Array.from(new Set(profiles.flatMap(p=>p.months.map(m=>m.month)))).sort().reverse()
 const numeric=minimum.trim()===''?undefined:Number(minimum)
 const invalid=numeric!==undefined&&!Number.isFinite(numeric)
 const result=invalid?[]:queryPublishedMonths(profiles,{month,order:common?order:'name',roiMin:common?numeric:undefined,minResultMonths:Number(minMonths)})
 const missing=common?profiles.filter(p=>!p.months.some(m=>m.month===month)).length:0
 return <main style={{maxWidth:1180,margin:'0 auto',padding:12}}>
  <h1 style={{fontSize:20,margin:'8px 0'}}>Listado común · muestra local OLBG</h1>
  <p style={{fontSize:12,color:'#666'}}>Preparación sin publicar. Datos reales retenidos; solo se muestran perfiles OLBG en esta muestra, no es una vista separada de producto.</p>
  <div style={{display:'flex',flexWrap:'wrap',gap:12,background:'#fff',padding:12,border:'1px solid #ddd',marginBottom:10,fontSize:12}}>
   <label>Mes OLBG<br/><select aria-label="Mes OLBG" value={month} onChange={e=>{setMonth(e.target.value);setMinimum('')}} style={{padding:7,maxWidth:220}}><option value="latest-available">Último mes disponible</option>{options.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
   <label>Orden OLBG del mes<br/><select aria-label="Orden OLBG del mes" disabled={!common} value={common?order:'name'} onChange={e=>setOrder(e.target.value as MonthlyQuery['order'])} style={{padding:7,maxWidth:210}}><option value="name">Nombre</option><option value="roi-desc">ROI publicado: mayor primero</option><option value="profit-desc">Profit OLBG: mayor primero</option><option value="picks-desc">Picks: mayor primero</option></select></label>
   <label>ROI publicado mínimo (%)<br/><input aria-label="ROI publicado mínimo" type="number" disabled={!common} value={minimum} onChange={e=>setMinimum(e.target.value)} style={{padding:7,width:105}}/></label>
   <label>Meses con resultados (mín.)<br/><select aria-label="Meses con resultados mínimos" value={minMonths} onChange={e=>setMinMonths(e.target.value)} style={{padding:7}}>{[0,1,3,6,12].map(n=><option key={n} value={n}>{n===0?'Todos':n}</option>)}</select></label>
  </div>
  <p aria-live="polite" style={{fontSize:12,color:'#666'}}>{result.length} de {profiles.length} perfiles. {common?`${missing} sin dato de ${monthLabel(month)}. Comparación solo del mes indicado.`:'Cada perfil muestra su último mes disponible. Elige un mes común para comparar cifras.'} Meses con resultados cuenta filas mensuales con apuestas, no antigüedad desde el alta.</p>
  {invalid&&<p>Introduce un número válido.</p>}
  {result.map(p=><TipsterRow key={p.id} tipster={fromPublishedOlbgMonth(p,common?month:latestAvailableMonth(p))}/>)}
 </main>
}
