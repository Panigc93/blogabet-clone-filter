'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

const YEARS = [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026]

export function FilterBar() {
  const router = useRouter()
  const sp = useSearchParams()

  const update = useCallback((key: string, value: string | null) => {
    const params = new URLSearchParams(sp.toString())
    if (value === null || value === '') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    params.delete('page') // reset pagination on filter change
    router.push(`/?${params.toString()}`)
  }, [router, sp])

  const tipo = sp.get('tipo') ?? 'all'
  const minYield = sp.get('minYield') ?? '0'
  const excludeYears = (sp.get('excludeYears') ?? '').split(',').filter(Boolean).map(Number)

  function toggleYear(year: number) {
    const next = excludeYears.includes(year)
      ? excludeYears.filter(y => y !== year)
      : [...excludeYears, year]
    update('excludeYears', next.length ? next.join(',') : null)
  }

  return (
    <div className="search-form" style={{ background: '#82daca', padding: '0 20px', borderBottom: '2px solid #4dbfa2' }}>
      <div id="page-content" style={{ maxWidth: 1020, margin: '0 auto' }}>
        <div className="row">
          <div className="col-xs-12">
            <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 900, letterSpacing: 1, margin: '14px 0 10px', textTransform: 'uppercase' }}>Tipsters</h1>
          </div>
        </div>
        <div className="row" style={{ paddingBottom: 10 }}>

          {/* TIPO */}
          <div className="col-xs-12 col-md-6 col-lg-2" style={{ marginBottom: 10 }}>
            <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Tipo</label>
            <div style={{ display: 'flex' }}>
              {(['all','free','paid'] as const).map((t, i) => (
                <div
                  key={t}
                  onClick={() => update('tipo', t)}
                  style={{
                    flex: 1, background: tipo === t ? '#4dbfa2' : '#fff',
                    color: tipo === t ? '#fff' : '#555',
                    border: '1px solid', borderColor: tipo === t ? '#3aaa8d' : '#ccc',
                    borderBottomWidth: 3, borderBottomColor: tipo === t ? '#2d937a' : '#ccc',
                    borderRight: i < 2 ? 'none' : undefined,
                    borderRadius: i === 0 ? '4px 0 0 4px' : i === 2 ? '0 4px 4px 0' : 0,
                    fontSize: 13, fontWeight: 700, padding: '6px 4px',
                    cursor: 'pointer', textAlign: 'center'
                  }}
                >
                  {t === 'all' ? 'Todos' : t === 'free' ? 'Free' : 'Pago'}
                </div>
              ))}
            </div>
          </div>

          {/* YIELD */}
          <div className="col-xs-12 col-md-6 col-lg-2" style={{ marginBottom: 10 }}>
            <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Yield mínimo</label>
            <div style={{ background: '#fff', border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, padding: '5px 10px 6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="range" min="-100" max="500" value={minYield}
                  onChange={e => update('minYield', e.target.value)}
                  style={{ flex: 1, accentColor: '#4dbfa2', cursor: 'pointer' }} />
                <span style={{ color: '#333', fontSize: 13, fontWeight: 700, minWidth: 40, textAlign: 'right' }}>{minYield}%</span>
              </div>
            </div>
          </div>

          {/* PICKS */}
          <div className="col-xs-12 col-md-6 col-lg-2" style={{ marginBottom: 10 }}>
            <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Nº de picks</label>
            <select className="form-control" style={{ border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, fontSize: 15 }}
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
          <div className="col-xs-12 col-md-6 col-lg-2" style={{ marginBottom: 10 }}>
            <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Actividad</label>
            <select className="form-control" style={{ border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, fontSize: 15 }}
              value={sp.get('activity') ?? ''}
              onChange={e => update('activity', e.target.value || null)}>
              <option value="">Todos</option>
              <option value="1">Último mes</option>
              <option value="3">Últimos 3 meses</option>
              <option value="6">Últimos 6 meses</option>
              <option value="12">Último año</option>
            </select>
          </div>

          {/* AÑO REGISTRO */}
          <div className="col-xs-12 col-md-6 col-lg-2" style={{ marginBottom: 10 }}>
            <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
              Año registro <small style={{ color: 'rgba(255,255,255,.65)', fontSize: 9 }}>(clic=excluir)</small>
            </label>
            <div style={{ background: '#fff', border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, padding: '5px 7px', display: 'flex', flexWrap: 'wrap', gap: 3, minHeight: 34 }}>
              {YEARS.map(y => {
                const excluded = excludeYears.includes(y)
                return (
                  <span key={y} onClick={() => toggleYear(y)} style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
                    background: excluded ? '#fde8e8' : '#e8f7f4',
                    color: excluded ? '#eb6379' : '#4dbfa2',
                    border: `1px solid ${excluded ? '#f0b8b8' : '#c8ece7'}`,
                    cursor: 'pointer', userSelect: 'none',
                    textDecoration: excluded ? 'line-through' : 'none',
                  }}>{y}</span>
                )
              })}
            </div>
          </div>

          {/* PRECIO/MES (solo pago) */}
          {tipo === 'paid' && (
            <div className="col-xs-12 col-md-6 col-lg-2" style={{ marginBottom: 10 }}>
              <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Precio/mes (€)</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input type="number" placeholder="Mín" min={0} style={{ background: '#fff', color: '#333', border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, padding: '6px 9px', fontSize: 13, width: '100%' }}
                  value={sp.get('priceMin') ?? ''}
                  onChange={e => update('priceMin', e.target.value || null)} />
                <input type="number" placeholder="Máx" min={0} style={{ background: '#fff', color: '#333', border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, padding: '6px 9px', fontSize: 13, width: '100%' }}
                  value={sp.get('priceMax') ?? ''}
                  onChange={e => update('priceMax', e.target.value || null)} />
              </div>
            </div>
          )}

          {/* ORDENAR POR */}
          <div className="col-xs-12 col-md-6 col-lg-2" style={{ marginBottom: 10 }}>
            <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Ordenar por</label>
            <select className="form-control" style={{ border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, fontSize: 15 }}
              value={sp.get('sort') ?? 'yield'}
              onChange={e => update('sort', e.target.value)}>
              <option value="yield">Yield</option>
              <option value="profit">Profit</option>
              <option value="picks">Nº de picks</option>
              <option value="followers">Seguidores</option>
              <option value="since_year">Año de registro</option>
              <option value="price">Precio</option>
            </select>
          </div>

        </div>
      </div>
    </div>
  )
}
