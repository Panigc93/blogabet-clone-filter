'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Tipster } from '@/db/schema'
import { TipsterRow } from './TipsterRow'
import { fromDbTipster } from './tipster-card-model'

interface LoadMoreProps {
  initialRows: Tipster[]
  initialHasMore: boolean
  total: number
  searchString: string
}

export function LoadMore({ initialRows, initialHasMore, total, searchString }: LoadMoreProps) {
  const [extraRows, setExtraRows] = useState<Tipster[]>([])
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)
  const pageRef = useRef(1)
  const loadingRef = useRef(false)
  const hasMoreRef = useRef(initialHasMore)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const shown = initialRows.length + extraRows.length

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return
    loadingRef.current = true
    setLoading(true)
    const res = await fetch(`/api/tipsters?${searchString}&page=${pageRef.current}`)
    const json = await res.json()
    setExtraRows(prev => [...prev, ...json.data])
    hasMoreRef.current = json.hasMore
    setHasMore(json.hasMore)
    pageRef.current += 1
    setLoading(false)
    loadingRef.current = false
  }, [searchString])

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore() },
      { rootMargin: '400px' }
    )
    const el = sentinelRef.current
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  return (
    <>
      <div style={{ padding: '8px 0 4px', fontSize: 13, color: '#777', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Mostrando <strong>{shown} de {total}</strong> tipsters</span>
        <span style={{ fontStyle: 'italic', color: '#bbb', fontSize: 11 }}>stats mensuales calculados sobre meses cerrados</span>
      </div>
      <div>
        {[...initialRows, ...extraRows].map(t => <TipsterRow key={t.id} tipster={fromDbTipster(t)} />)}
        <div ref={sentinelRef} style={{ textAlign: 'center', padding: '14px 0', color: '#999', fontSize: 13 }}>
          {loading && 'Cargando...'}
          {!loading && !hasMore && extraRows.length > 0 && 'No hay más tipsters'}
        </div>
      </div>
    </>
  )
}
