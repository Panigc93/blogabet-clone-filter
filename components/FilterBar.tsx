'use client'
import { useRouter } from 'next/navigation'
import { useCallback, useTransition, useState, useEffect } from 'react'

interface FilterBarProps {
  searchParams: Record<string, string | undefined>
}

export function FilterBar({ searchParams }: FilterBarProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const sp = new URLSearchParams(
    Object.entries(searchParams).filter(([, v]) => v != null) as [string, string][]
  )

  const [searchValue, setSearchValue] = useState(sp.get('search') ?? '')
  const [minYield, setMinYield] = useState(sp.get('minYield') ?? '')
  const [maxYield, setMaxYield] = useState(sp.get('maxYield') ?? '')
  const [priceMin, setPriceMin] = useState(sp.get('priceMin') ?? '')
  const [priceMax, setPriceMax] = useState(sp.get('priceMax') ?? '')

  // Sync local state si cambia la URL (nav atrás/adelante)
  useEffect(() => { setSearchValue(searchParams.search ?? '') }, [searchParams.search])
  useEffect(() => {
    setMinYield(searchParams.minYield ?? '')
    setMaxYield(searchParams.maxYield ?? '')
  }, [searchParams.minYield, searchParams.maxYield])
  useEffect(() => {
    setPriceMin(searchParams.priceMin ?? '')
    setPriceMax(searchParams.priceMax ?? '')
  }, [searchParams.priceMin, searchParams.priceMax])

  // Debounce del buscador de texto (400ms)
  useEffect(() => {
    const currentUrlSearch = searchParams.search ?? ''
    if (searchValue === currentUrlSearch) return
    const t = setTimeout(() => {
      const params = new URLSearchParams(sp.toString())
      if (searchValue) { params.set('search', searchValue) } else { params.delete('search') }
      params.delete('page')
      startTransition(() => router.push(`/?${params.toString()}`))
    }, 400)
    return () => clearTimeout(t)
  }, [searchValue])

  // Debounce de campos numéricos — yield (800ms)
  useEffect(() => {
    if ((minYield || '') === (searchParams.minYield || '') && (maxYield || '') === (searchParams.maxYield || '')) return
    const t = setTimeout(() => {
      const params = new URLSearchParams(sp.toString())
      if (minYield) params.set('minYield', minYield); else params.delete('minYield')
      if (maxYield) params.set('maxYield', maxYield); else params.delete('maxYield')
      params.delete('page')
      startTransition(() => router.push(`/?${params.toString()}`))
    }, 800)
    return () => clearTimeout(t)
  }, [minYield, maxYield])

  // Debounce de campos numéricos — precio (800ms)
  useEffect(() => {
    if ((priceMin || '') === (searchParams.priceMin || '') && (priceMax || '') === (searchParams.priceMax || '')) return
    const t = setTimeout(() => {
      const params = new URLSearchParams(sp.toString())
      if (priceMin) params.set('priceMin', priceMin); else params.delete('priceMin')
      if (priceMax) params.set('priceMax', priceMax); else params.delete('priceMax')
      params.delete('page')
      startTransition(() => router.push(`/?${params.toString()}`))
    }, 800)
    return () => clearTimeout(t)
  }, [priceMin, priceMax])

  const update = useCallback((key: string, value: string | null) => {
    const params = new URLSearchParams(sp.toString())
    if (value === null || value === '') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    params.delete('page')
    startTransition(() => router.push(`/?${params.toString()}`))
  }, [router, sp.toString()])

  const tipo = sp.get('tipo') ?? 'all'

  return (
    <>
      {isPending && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: 'wait', background: 'rgba(255,255,255,0.15)' }} />
      )}
      <div className="search-form" style={{ background: '#82daca', padding: '0 20px', borderBottom: '2px solid #4dbfa2' }}>
        <div id="page-content" style={{ maxWidth: 1100, margin: '0 auto' }}>
          {/* FILA TÍTULO */}
          <div style={{ padding: '22px 15px 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ color: '#fff', fontSize: 30, fontWeight: 700, letterSpacing: 1, margin: 0, textTransform: 'uppercase' }}>Tipsters</h1>
            {isPending && <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 400 }}>Cargando...</span>}
          </div>

          {/* FILA BÚSQUEDA + TIPO */}
          <div className="filterbar-top" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 15px 14px' }}>
            <input
              type="search"
              placeholder="Buscar por nombre o URL..."
              className="form-control filterbar-search"
              style={{ border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, fontSize: 14, height: 36 }}
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
            />
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', flexShrink: 0 }}>
              {(['all','free','paid'] as const).map((t, i) => (
                <div
                  key={t}
                  onClick={() => update('tipo', t)}
                  style={{
                    background: tipo === t ? '#5b8dd9' : '#fff',
                    color: tipo === t ? '#fff' : '#555',
                    border: '1px solid', borderColor: tipo === t ? '#4a7bc8' : '#ccc',
                    borderBottomWidth: 3, borderBottomColor: tipo === t ? '#3a6ab8' : '#ccc',
                    borderRight: i < 2 ? 'none' : undefined,
                    borderRadius: i === 0 ? '4px 0 0 4px' : i === 2 ? '0 4px 4px 0' : 0,
                    fontSize: 13, fontWeight: 700, padding: '6px 14px',
                    cursor: 'pointer', textAlign: 'center', whiteSpace: 'nowrap'
                  }}
                >
                  {t === 'all' ? 'Todos' : t === 'free' ? 'Free' : 'Pago'}
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '0 15px 12px', display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'space-between' }}>

            {/* YIELD */}
            <div style={{ flex: 1, minWidth: 110, maxWidth: 130, marginBottom: 2 }}>
              <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Yield (%)</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input type="number" placeholder="Mín" style={{ background: '#fff', color: '#333', border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, padding: '6px 6px', fontSize: 13, width: '100%' }}
                  value={minYield}
                  onChange={e => setMinYield(e.target.value)} />
                <input type="number" placeholder="Máx" style={{ background: '#fff', color: '#333', border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, padding: '6px 6px', fontSize: 13, width: '100%' }}
                  value={maxYield}
                  onChange={e => setMaxYield(e.target.value)} />
              </div>
            </div>

            {/* PICKS */}
            <div style={{ flex: 1, minWidth: 130, maxWidth: 150, marginBottom: 2 }}>
              <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Nº de picks</label>
              <select className="form-control" style={{ border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, fontSize: 14, cursor: 'pointer' }}
                value={sp.get('minPicks') ?? '0'}
                onChange={e => update('minPicks', e.target.value === '0' ? null : e.target.value)}>
                <option value="0">Todos</option>
                <option value="50">Más de 50</option>
                <option value="100">Más de 100</option>
                <option value="200">Más de 200</option>
                <option value="500">Más de 500</option>
                <option value="1000">Más de 1.000</option>
              </select>
            </div>

            {/* ACTIVIDAD */}
            <div style={{ flex: 1, minWidth: 130, maxWidth: 150, marginBottom: 2 }}>
              <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Actividad</label>
              <select className="form-control" style={{ border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, fontSize: 14, cursor: 'pointer' }}
                value={sp.get('activity') ?? ''}
                onChange={e => update('activity', e.target.value || null)}>
                <option value="">Todos</option>
                <option value="1">Último mes</option>
                <option value="3">Últimos 3 meses</option>
                <option value="6">Últimos 6 meses</option>
                <option value="12">Último año</option>
              </select>
            </div>

            {/* AÑOS EN BLOGABET */}
            <div style={{ flex: 1, minWidth: 130, maxWidth: 150, marginBottom: 2 }}>
              <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Años en BB</label>
              <select className="form-control" style={{ border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, fontSize: 14, cursor: 'pointer' }}
                value={sp.get('minYears') ?? ''}
                onChange={e => update('minYears', e.target.value || null)}>
                <option value="">Todos</option>
                <option value="1">Al menos 1 año</option>
                <option value="2">Al menos 2 años</option>
                <option value="3">Al menos 3 años</option>
                <option value="5">Al menos 5 años</option>
                <option value="10">Al menos 10 años</option>
              </select>
            </div>

            {/* ORDENAR POR */}
            <div style={{ flex: 1, minWidth: 130, maxWidth: 150, marginBottom: 2 }}>
              <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Ordenar por</label>
              <select className="form-control" style={{ border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, fontSize: 14, cursor: 'pointer' }}
                value={sp.get('sort') ?? 'yield'}
                onChange={e => update('sort', e.target.value)}>
                <option value="yield">Yield (histórico)</option>
                <option value="yield6m">Yield 6 meses</option>
                <option value="yield12m">Yield 12 meses</option>
                <option value="picks6m_avg">Picks/mes (6m)</option>
                <option value="profit">Profit</option>
                <option value="picks">Nº de picks</option>
                <option value="followers">Seguidores</option>
                <option value="since_year">Año de registro</option>
                <option value="price">Precio</option>
              </select>
            </div>

            {/* PRECIO/MES (solo pago) */}
            {tipo === 'paid' && (
              <div style={{ flex: 1, minWidth: 110, maxWidth: 130, marginBottom: 2 }}>
                <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Precio/mes (€)</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input type="number" placeholder="Mín" min={0} style={{ background: '#fff', color: '#333', border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, padding: '6px 6px', fontSize: 13, width: '100%' }}
                    value={priceMin}
                    onChange={e => setPriceMin(e.target.value)} />
                  <input type="number" placeholder="Máx" min={0} style={{ background: '#fff', color: '#333', border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, padding: '6px 6px', fontSize: 13, width: '100%' }}
                    value={priceMax}
                    onChange={e => setPriceMax(e.target.value)} />
                </div>
              </div>
            )}

            {/* CON PICKS FREE (solo pago) — último a la derecha */}
            {tipo === 'paid' && (
              <div style={{ flexShrink: 0, marginBottom: 2, display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#fff', fontSize: 12, fontWeight: 600, userSelect: 'none', lineHeight: 1.2 }}>
                  <input
                    type="checkbox"
                    checked={sp.get('conPicksFree') === '1'}
                    onChange={e => update('conPicksFree', e.target.checked ? '1' : null)}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#5b8dd9', flexShrink: 0 }}
                  />
                  Con picks<br />free
                </label>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}
