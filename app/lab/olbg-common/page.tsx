import React from 'react'
import {notFound} from 'next/navigation'
import {TipsterRow} from '@/components/TipsterRow'
import {commonMonthlyLocalEnabled,localCommonMonthlyRead} from '@/lib/olbg-common-local-read'
export const dynamic='force-dynamic'
export default async function Page({searchParams}:{searchParams:Record<string,string>}){
 if(!commonMonthlyLocalEnabled())notFound()
 const params=new URLSearchParams(searchParams),page=await localCommonMonthlyRead(params)
 const continuation=new URLSearchParams(params);if(page.nextCursor)continuation.set('cursor',page.nextCursor)
 return <main style={{maxWidth:1180,margin:'0 auto',padding:12}}>
  <h1 style={{fontSize:20}}>Listado común · integración local sin publicar</h1>
  <p style={{fontSize:12}}>Fuente OLBG completa retenida y una ficha Tipstrr real ya retenida, ambas con fecha de captura. No es un listado deportivo separado ni datos actuales sincronizados.</p>
  <p style={{fontSize:12}}>{page.scopeNote}</p><p>Mostrando {page.rows.length} de {page.total} perfiles</p>
  <nav style={{display:'flex',flexWrap:'wrap',gap:16,marginBottom:12,fontSize:13}}><a href="?order=name">Nombre · último mes</a><a href="?order=yield-desc">Yield común · OLBG sin acumulado</a><a href="?month=2026-10&order=olbg-roi-desc">ROI OLBG · octubre 2026</a><a href="?month=2026-10&order=olbg-roi-desc&roiMin=0">ROI OLBG ≥ 0 · octubre</a></nav>
  {page.rows.map(r=><TipsterRow key={r.key} tipster={r.card}/>)}
  {page.nextCursor&&<a aria-label="Siguiente página" href={'?'+continuation.toString()}>Siguiente página</a>}
 </main>
}
