'use client'
import { useState } from 'react'
import { Tipster } from '@/db/schema'
import { TipsterRow } from './TipsterRow'

export function LoadMore({ initialHasMore, searchString }: { initialHasMore: boolean; searchString: string }) {
  const [rows, setRows] = useState<Tipster[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)

  async function loadMore() {
    setLoading(true)
    const res = await fetch(`/api/tipsters?${searchString}&page=${page}`)
    const json = await res.json()
    setRows(prev => [...prev, ...json.data])
    setHasMore(json.hasMore)
    setPage(p => p + 1)
    setLoading(false)
  }

  return (
    <>
      {rows.map(t => <TipsterRow key={t.id} tipster={t} />)}
      {hasMore && (
        <div style={{ textAlign: 'center', padding: '14px 0 24px' }}>
          <button onClick={loadMore} disabled={loading}
            style={{ background: '#eb6379', color: '#fff', border: '1px solid #d44f65', borderBottomWidth: 3, borderRadius: 4, padding: '10px 28px', fontSize: 14, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', textTransform: 'uppercase' }}>
            {loading ? 'Cargando...' : 'Ver más'}
          </button>
        </div>
      )}
    </>
  )
}
