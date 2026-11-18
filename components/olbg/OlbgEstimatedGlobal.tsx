import React from 'react'
import {monthLabel,type MonthlyDisplay} from '@/lib/olbg-published-monthly'
import type {GlobalYieldEstimate} from '@/lib/olbg-estimated-global'
export interface OlbgEstimates {global:GlobalYieldEstimate;three:GlobalYieldEstimate;six:GlobalYieldEstimate;twelve:GlobalYieldEstimate}
const fmt=(n:number)=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:2}).format(n)
const pct=(n:number|null)=>n===null?'—':`${n>0?'+':''}${n.toFixed(1).replace('.',',')}%`
const bound=(v:number,lower:boolean)=>(lower?Math.floor(v*10):Math.ceil(v*10))/10
export function OlbgEstimatedGlobal({estimates,source,sinceYear}:{estimates:OlbgEstimates;source:MonthlyDisplay;sinceYear:number|null}){
 const e=estimates.global
 const range=e.range?`${pct(bound(e.range.lowerPct,true))} a ${pct(bound(e.range.upperPct,false))}`:null
 const color=(n:number|null)=>n===null?'#777':n<0?'#c24e59':n>0?'#25886e':'#444'
 return <section aria-label="Yield global estimado OLBG" style={{padding:'12px 8px 8px',width:'100%',boxSizing:'border-box'}}>
  <div style={{display:'flex',justifyContent:'space-around',gap:6,textAlign:'center',flexWrap:'wrap'}}>
   {[[sinceYear??'—','Since',null],[fmt(e.picks),'Picks',null],[fmt(e.profitSource),'Profit · OLBG',e.profitSource],[pct(e.centralPct),'Yield',e.centralPct]].map(([value,label,n])=><div key={String(label)} style={{flex:'1 1 70px'}}><span style={{display:'block',fontSize:22.5,fontWeight:700,color:color(typeof n==='number'?n:null)}}>{value}{label==='Yield'&&<small style={{fontSize:10,fontWeight:400,color:'#777',marginLeft:3}}>est.</small>}</span><span style={{display:'block',fontSize:15,fontWeight:700,color:'#555',marginTop:3}}>{label}</span></div>)}
  </div>
  {e.status!=='estimated'&&<p style={{fontSize:11,color:'#777',textAlign:'center',margin:'8px 0'}}>Sin cifra central fiable.{range?' Hay un intervalo en el detalle.':''}</p>}
  <div style={{display:'flex',justifyContent:'space-around',gap:6,borderTop:'1px dashed #eee',paddingTop:8,marginTop:10,textAlign:'center'}}>
   {[[3,estimates.three],[6,estimates.six],[12,estimates.twelve]].map(([n,v])=>{const x=v as GlobalYieldEstimate;return <div key={String(n)} title={x.status==='estimated'?'Estimado, ventana completa de meses cerrados':x.reason==='missing-months'?'Faltan meses de la ventana':x.reason==='zero-roi'?'Un ROI mensual de 0 impide recuperar una cifra central':'Sin cifra central defendible'}><b style={{fontSize:14,color:color(x.centralPct)}}>{pct(x.centralPct)}</b><span style={{display:'block',fontSize:10,color:'#777'}}>YIELD {String(n)}M <small style={{fontSize:9}}>est.</small></span></div>})}
  </div>
  <details style={{fontSize:12,color:'#666',marginTop:0}}>
   <summary className="olbg-estimated-summary" style={{cursor:'pointer',textAlign:'right',position:'absolute',right:14,top:12,fontSize:10}}>Historial parcial ⓘ</summary>
   <p><b>{range?`Franja estimada: ${range}.`:'Sin intervalo calculable.'}</b> Es una franja condicional, no un margen de error garantizado. Incluye dos posibles reglas de redondeo del ROI mensual.</p>
   {e.centralConvention&&<p>La cifra central es el punto medio del intervalo, por convenio, no el valor más probable. Solo se usa si el intervalo global mide como máximo 2 puntos porcentuales, incluyendo una tolerancia de ±1 en cada Profit mensual publicado. No se presuponen límites de importe por apuesta.</p>}
   <p>Periodo: {e.from&&e.to?`${monthLabel(e.from)} – ${monthLabel(e.to)}`:'sin periodo'}. Usamos los {e.monthsUsed.length} meses cerrados disponibles y sus {fmt(e.picks)} picks, no toda la carrera. Since es el año de alta. El mes en curso en la captura ({monthLabel(e.currentMonthExcluded)}) no entra en la estimación.</p>
   {e.missingMonths.length>0&&<p>Hay meses ausentes dentro del periodo: {e.missingMonths.map(monthLabel).join(', ')}. No se cuentan como cero apuestas.</p>}
   {e.reason==='zero-roi'&&<p>Al menos un mes tiene ROI publicado 0%. No asignamos un importe apostado puntual a ese mes. {e.centralConvention?'La cifra central mostrada sigue el convenio del punto medio explicado arriba.':'No mostramos una cifra central porque el intervalo es demasiado amplio para el convenio del punto medio.'}</p>}
   <p>Supuestos por confirmar: {e.centralConvention?'Profit dentro de ±1 de cada cifra mensual publicada':'Profit exacto'}, misma escala entre meses y ROI = Profit / importe apostado. {e.centralConvention?'La franja combina todos los importes compatibles con esos supuestos; no se reconstruye un importe único para los meses con ROI 0%.':'Se calcula un importe aproximado por mes y luego se suman los importes.'} No es una media ponderada por picks. La franja contempla redondeo al entero más próximo y truncación hacia cero.</p>
   <p>Profit suma las cifras originales de los meses usados; escala pendiente de confirmar, sin conversión a euros. Los filtros y el orden de Yield usan la cifra central estimada. Las franjas solapadas no permiten afirmar cuál es mejor.</p>
   <table style={{width:'100%',borderCollapse:'collapse',textAlign:'right'}}><thead><tr>{['Mes publicado','Picks','Profit · OLBG','ROI fuente'].map(label=><th key={label} style={{padding:'7px 3px',textAlign:label==='Mes publicado'?'left':'right',borderBottom:'1px solid #ddd'}}>{label}</th>)}</tr></thead>
    <tbody>{source.history.map(m=><tr key={m.month} style={{opacity:e.monthsUsed.includes(m.month)?1:.65}}><td style={{padding:'7px 3px',textAlign:'left',borderBottom:'1px solid #eee'}}>{monthLabel(m.month)}{m.month===source.captureMonth?' *':''}</td><td style={{borderBottom:'1px solid #eee'}}>{fmt(m.picks)}</td><td style={{borderBottom:'1px solid #eee'}}>{fmt(m.profitPublished)}</td><td style={{borderBottom:'1px solid #eee'}}>{m.roiPublished===null?'—':`${m.roiPublished}%`}</td></tr>)}</tbody>
   </table><p>* Mes en curso en la captura, fuera de la estimación. Los ROI de esta tabla son los publicados por OLBG, no estimaciones nuestras.</p>
  </details>
 </section>
}
