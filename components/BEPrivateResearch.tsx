import React from 'react'
import { QUALITY_LABELS, type ResearchPage } from '@/lib/bettingexpert-research/query'

const periods = { '3m': 'Ago a oct 2026', '6m': 'May a oct 2026', '12m': 'Nov 2025 a oct 2026' }
const percent = (s: string | null) => s === null ? null : `${Number(s).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
const field = { padding: '9px 10px', border: '1px solid #ccd3da', borderRadius: 5, background: 'white', width: '100%' } as const
export function BEPrivateResearch({ data }: { data: ResearchPage }) {
  const q = data.query
  const link = (page: number) => {
    const p = new URLSearchParams({ period: q.period, quality: q.quality, state: q.state, search: q.search, sort: q.sort, page: String(page), revision: data.revision })
    if (q.minimum !== null) p.set('minimum', q.minimum)
    return '?' + p.toString()
  }
  return <main className="be-research">
    <style>{`
      .be-research {max-width:1100px;margin:24px auto;padding:0 20px 40px;font:15px/1.5 Arial,sans-serif;color:#202b36}
      .be-research h1 {font-size:30px;line-height:1.2;margin:8px 0 14px}
      .be-research .be-kicker {font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#62707d}
      .be-research .be-notice {padding:14px 18px;border-left:4px solid #aa740c;background:#fff5dc;margin:18px 0}
      .be-research .be-controls {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:18px;background:#e9edf0;border-radius:8px}
      .be-research label {display:block;font-size:13px;font-weight:600}
      .be-research label span {display:block;margin-bottom:5px}
      .be-research .be-card {padding:18px;background:white;border:1px solid #dce1e6;border-radius:8px;margin:14px 0}
      .be-research .be-card h2 {font-size:20px;margin:0 0 4px;overflow-wrap:anywhere}
      .be-research .be-quality {font-size:12px;display:inline-block;background:#edf2f5;padding:4px 8px;border-radius:4px;margin:4px 0 12px}
      .be-research .be-periods {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
      .be-research .be-window {padding:12px;border:1px solid #e1e5e8;border-radius:5px}
      .be-research .be-window.selected {border:2px solid #355c77;background:#f5f9fb}
      .be-research .be-value {font-size:23px;font-weight:700;margin:4px 0}
      .be-research .be-detail {font-size:12px;color:#526171;overflow-wrap:anywhere}
      .be-research .be-nav {display:flex;justify-content:space-between;gap:12px;margin-top:22px}
      .be-research .be-nav a {padding:9px 13px;border:1px solid #b5c2cc;border-radius:5px;background:white;color:#244b68}
      @media(max-width:600px){.be-research{padding:0 12px 30px;margin:16px auto}.be-research h1{font-size:25px}.be-research .be-controls{grid-template-columns:1fr 1fr;padding:12px;gap:10px}.be-research .be-periods{grid-template-columns:1fr}.be-research .be-card{padding:14px}.be-research .be-window{padding:12px}}
    `}</style>
    <div className="be-kicker">Clone Filter · revisión privada local</div>
    <h1>Bettingexpert: periodos y calidad</h1>
    <p>547 perfiles revisados en primera pasada. 360 tienen algún yield numérico, 34 tienen los tres. No son 547 perfiles listos para publicar.</p>
    <div className="be-notice">Datos retenidos, sin sincronización actual. 485 ventanas numéricas, 844 sin muestra elegible y 312 retenidas. No publicado. Las clases no se mezclan en el ranking.</div>
    <form className="be-controls" method="get">
      <label><span>Periodo para filtrar y ordenar</span><select name="period" defaultValue={q.period} style={field}>{Object.entries(periods).map(([n, label]) => <option key={n} value={n}>{n} · {label}</option>)}</select></label>
      <label><span>Calidad de evidencia</span><select name="quality" defaultValue={q.quality} style={field}>{Object.entries(QUALITY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label><span>Estado de la ventana</span><select name="state" defaultValue={q.state} style={field}><option value="all">Todos los estados de esta clase</option><option value="number">Con número</option><option value="no_eligible_sample">Sin muestra elegible</option><option value="held">Retenido</option></select></label>
      <label><span>Nombre</span><input name="search" defaultValue={q.search} style={field} /></label>
      <label><span>Yield mínimo del periodo (%)</span><input name="minimum" defaultValue={q.minimum ?? ''} inputMode="decimal" placeholder="Vacío: incluir NULL" style={field} /></label>
      <label><span>Orden</span><select name="sort" defaultValue={q.sort} style={field}><option value="yield">Yield del periodo, NULL al final</option><option value="name">Nombre</option></select></label>
      <button style={{ ...field, background: '#244b68', color: 'white', border: 0, fontWeight: 700 }} type="submit">Aplicar filtros</button>
    </form>
    <p style={{ marginTop: 20 }}><strong>{data.total} resultados</strong> · {q.period} · {QUALITY_LABELS[q.quality]} · página {q.page + 1}</p>
    <p className="be-detail">El filtro mínimo excluye NULL, no lo convierte en cero. Periodos cerrados UTC, fin exclusivo 1 nov 2026. La actividad reciente y el yield global no se infieren de estos periodos.</p>
    {data.items.length === 0 && <div className="be-card">No hay resultados para estos filtros. No significa que no existan perfiles o publicaciones.</div>}
    {data.items.map(row => <article key={row.guid} className="be-card">
      <h2>{row.username}</h2><div className="be-kicker">Bettingexpert · captura retenida · no publicado</div>
      <div className="be-quality">Seleccionado: {q.period} · {row.selected.qualityLabel}</div>
      <div className="be-periods">{row.windows.map(w => <section key={w.period} className={'be-window' + (w.period === q.period ? ' selected' : '')}>
        <strong>{w.period} · {periods[w.period]}</strong>
        <div className="be-value" style={{ color: w.valuePct === null ? '#677583' : Number(w.valuePct) >= 0 ? '#167654' : '#b43f4e' }}>{percent(w.valuePct) ?? 'Sin dato numérico'}</div>
        {w.reason ? <p style={{ margin: '4px 0' }}>{w.reason}</p> : <div className="be-detail">{w.picks} picks · beneficio {w.profit} / stake {w.stake}<br />Yield calculado = beneficio / stake × 100</div>}
        <p className="be-detail" style={{ marginBottom: 0 }}>{w.qualityLabel}</p>
      </section>)}</div>
      {row.annualWarning && <p className="be-detail" style={{ marginBottom: 0 }}>{row.annualWarning}</p>}
    </article>)}
    <nav className="be-nav" aria-label="Paginación de revisión"><span>{q.page > 0 && <a href={link(q.page - 1)}>Anterior</a>}</span><span>{data.hasMore && <a href={link(q.page + 1)}>Siguiente</a>}</span></nav>
    <p className="be-detail" style={{ marginTop: 24 }}>Cada ventana conserva su clase y motivo. No demuestra liquidación al cierre ni historial inmutable. Los otros periodos se muestran con su propia calidad, pero no cambian el filtro ni el orden seleccionados.</p>
  </main>
}
