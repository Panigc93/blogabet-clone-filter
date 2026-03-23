'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Tipster } from '@/db/schema'
import { TipsterRow } from './TipsterRow'

export function LoadMore({ initialHasMore, searchString }: { initialHasMore: boolean; searchString: string }) {
  const [rows, setRows] = useState<Tipster[]>([])
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)
  const pageRef = useRef(1)
  const loadingRef = useRef(false)
  const hasMoreRef = useRef(initialHasMore)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return
    loadingRef.current = true
    setLoading(true)
    const res = await fetch(`/api/tipsters?${searchString}&page=${pageRef.current}`)
    const json = await res.json()
    setRows(prev => [...prev, ...json.data])
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
      {rows.map(t => <TipsterRow key={t.id} tipster={t} />)}
      <div ref={sentinelRef} style={{ textAlign: 'center', padding: '14px 0', color: '#999', fontSize: 13 }}>
        {loading && 'Cargando...'}
        {!loading && !hasMore && rows.length > 0 && 'No hay más tipsters'}
      </div>
    </>
  )
}
