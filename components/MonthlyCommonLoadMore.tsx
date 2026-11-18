'use client'
import React,{useState,useEffect,useRef,useCallback} from 'react'
import {TipsterRow} from './TipsterRow'
import type {CommonListEntry,CommonListPage} from '@/lib/olbg-common-list-candidate'
export function MonthlyCommonLoadMore({initial,searchString}:{initial:CommonListPage;searchString:string}){
 const [rows,setRows]=useState<CommonListEntry[]>(initial.rows)
 const [cursor,setCursor]=useState(initial.nextCursor)
 const [error,setError]=useState('')
 const [loading,setLoading]=useState(false)
 const busy=useRef(false),sentinel=useRef<HTMLDivElement>(null)
 const next=useCallback(async()=>{
  if(busy.current||!cursor)return
  busy.current=true;setLoading(true);setError('')
  try{
   const p=new URLSearchParams(searchString);p.set('monthlyCursor',cursor)
   const response=await fetch('/api/tipsters?'+p)
   if(response.status===409){window.location.reload();return}
   if(!response.ok)throw Error('No se pudo cargar la siguiente página')
   const data=await response.json()
   if(data.mode!=='olbg-published-monthly'||data.revision!==initial.revision)throw Error('Cambió la fuente. Recarga la lista.')
   setRows(previous=>{const seen=new Set(previous.map(r=>r.key));return [...previous,...data.rows.filter((r:CommonListEntry)=>!seen.has(r.key))]})
   setCursor(data.nextCursor)
  }catch(e){setError(e instanceof Error?e.message:'Error al cargar')}
  finally{busy.current=false;setLoading(false)}
 },[cursor,searchString,initial.revision])
 useEffect(()=>{const observer=new IntersectionObserver(entries=>{if(entries[0].isIntersecting)void next()},{rootMargin:'200px'});if(sentinel.current)observer.observe(sentinel.current);return()=>observer.disconnect()},[next])
 return <>
  <p style={{fontSize:12,color:'#777'}}>Mostrando {rows.length} de {initial.total} tipsters. {initial.scopeNote}</p>
  {rows.map(r=><TipsterRow key={r.key} tipster={r.card}/>)}
  <div ref={sentinel} style={{textAlign:'center',padding:16}}>{loading?'Cargando...':null}{error&&<><p>{error}</p><button onClick={()=>void next()}>Reintentar</button></>}</div>
 </>
}
