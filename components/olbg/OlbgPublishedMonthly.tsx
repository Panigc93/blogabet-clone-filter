import React from 'react'
import { monthLabel, type MonthlyDisplay } from '@/lib/olbg-published-monthly'

const fmt = (n: number) => new Intl.NumberFormat('es-ES',{useGrouping:true,maximumFractionDigits:2}).format(n)
const pct = (n: number | null) => n===null?'—':`${n>0?'+':''}${n}%`
export function OlbgPublishedMonthly({data,sinceYear}:{data:MonthlyDisplay;sinceYear:number|null}) {
 const m=data.selected
 const color=(n:number|null|undefined)=>n==null?'#777':n<0?'#c24e59':n>0?'#25886e':'#444'
 return <section aria-label="Resultados mensuales publicados por OLBG" style={{padding:'12px 8px',width:'100%',boxSizing:'border-box'}}>
  <div style={{fontSize:14,fontWeight:700,textAlign:'center',marginBottom:12}}>{monthLabel(data.selectedMonth)}{data.currentMonth?' · en curso en la captura':''}</div>
  <div style={{display:'flex',justifyContent:'space-around',gap:8,textAlign:'center',flexWrap:'wrap'}}>
   {[[sinceYear??'—','Since',null],[m?fmt(m.picks):'—','Picks',null],[m?fmt(m.profitPublished):'—','Profit · OLBG',m?.profitPublished],[m?pct(m.roiPublished):'—','ROI publicado',m?.roiPublished]].map(([value,label,n])=><div key={String(label)} style={{flex:'1 1 70px'}}><span style={{display:'block',fontSize:22,fontWeight:700,color:color(typeof n==='number'?n:null)}}>{value}</span><span style={{display:'block',fontSize:12,fontWeight:700,color:'#555',marginTop:3}}>{label}</span></div>)}
  </div>
  {!m&&<p style={{fontSize:12,color:'#777',textAlign:'center'}}>Sin dato de este mes. No equivale a cero.</p>}
  <details style={{fontSize:12,color:'#666',marginTop:14}}>
   <summary style={{cursor:'pointer',textAlign:'center'}}>Historial parcial ⓘ</summary>
   <p>Resultados globales de cada mes publicados por OLBG. Profit conserva la cifra fuente; escala pendiente de confirmar, sin conversión a euros.</p>
   <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12,textAlign:'right'}}>
    <thead><tr>{['Mes','Picks','Profit · OLBG','ROI publicado'].map(x=><th key={x} style={{padding:'7px 3px',borderBottom:'1px solid #ddd',textAlign:x==='Mes'?'left':'right'}}>{x}</th>)}</tr></thead>
    <tbody>{data.history.map(r=><tr key={r.month} style={{background:r.month===data.selectedMonth?'#effaf7':undefined}}><td style={{padding:'7px 3px',textAlign:'left',borderBottom:'1px solid #eee'}}>{monthLabel(r.month)}{r.month===data.captureMonth?' *':''}</td><td style={{borderBottom:'1px solid #eee'}}>{fmt(r.picks)}</td><td style={{borderBottom:'1px solid #eee',color:color(r.profitPublished)}}>{fmt(r.profitPublished)}</td><td style={{borderBottom:'1px solid #eee',color:color(r.roiPublished)}}>{pct(r.roiPublished)}</td></tr>)}</tbody>
   </table></div>
   <p>* Mes en curso en la captura. La tabla puede tener meses ausentes. La captura se indica bajo el nombre. Since es la fecha de alta, no el comienzo de este historial.</p>
  </details>
 </section>
}
