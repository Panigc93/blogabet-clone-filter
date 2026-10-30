'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Tipster } from '@/db/schema'
import { TipsterRow } from './TipsterRow'

export function LoadMore({ initialHasMore, searchString }: { initialHasMore: boolean; searchString: string }) {
  const [rows, setRows] = useState<Tipster[]>([])
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const pageRef = useRef(1)
  const loadingRef = useRef(false)
  const hasMoreRef = useRef(initialHasMore)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/tipsters?${searchString}&page=${pageRef.current}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setRows(prev => [...prev, ...json.data])
      hasMoreRef.current = json.hasMore
      setHasMore(json.hasMore)
      pageRef.current += 1
    } catch {
      // Keep hasMore so the user can retry; without this the scroll se queda muerto en silencio
      setError(true)
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
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
        {error && !loading && (
          <span>
            No se pudieron cargar más tipsters.{' '}
            <button
              onClick={loadMore}
              style={{ background: 'none', border: 'none', padding: 0, color: '#5b8dd9', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
            >
              Reintentar
            </button>
          </span>
        )}
        {!loading && !error && !hasMore && rows.length > 0 && 'No hay más tipsters'}
      </div>
    </>
  )
}
