import React from 'react'
import type { OlbgPreparedProfile } from '../../crawler/platforms/olbg/prepare'

const fmt = (v: number | null, suffix = '') => v === null ? 'Sin dato' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(v) + suffix
const signed = (v: number) => (v > 0 ? '+' : '') + fmt(v)

// Scoped statistics panel, ready to embed after the shared listing supports
// explicit metric scope. Not connected to the production selector or database.
export function OlbgStats({ profile: p }: { profile: OlbgPreparedProfile }) {
  const sportRows = p.tables.filter(x => x.scope === 'sport-all-tips')
  const six = sportRows.filter(x => x.closedMonths === 6)
  const twelve = sportRows.filter(x => x.closedMonths === 12)
  const groups = [{ label: '6 meses cerrados', rows: six }, { label: '12 meses cerrados', rows: twelve }]
  return <section className="olbg-stats">
    <style>{`
      .olbg-stats { background:#fff; border:1px solid #dbe1e8; border-radius:4px; margin:0 0 20px; padding:20px; color:#333; font-family:Arial,sans-serif; }
      .olbg-stats h2 { margin:0 0 6px; font-size:23px; overflow-wrap:anywhere; }
      .olbg-stats h3 { font-size:17px; margin:24px 0 6px; }
      .olbg-stats a { color:#bd3652; }
      .olbg-stats p { font-size:13px; line-height:1.55; margin:6px 0; }
      .olbg-stats .olbg-note { background:#f1f9f7; border-left:3px solid #82daca; padding:10px 12px; margin:14px 0; }
      .olbg-stats table { border-collapse:collapse; width:100%; font-size:13px; margin-top:10px; }
      .olbg-stats th,.olbg-stats td { padding:10px 7px; border-bottom:1px solid #e4e9ee; text-align:right; }
      .olbg-stats th { background:#f7f9fb; font-size:12px; }
      .olbg-stats th:first-child,.olbg-stats td:first-child { text-align:left; }
      .olbg-stats .olbg-negative { color:#b72e3f; }
      .olbg-stats .olbg-positive { color:#18744e; }
      .olbg-stats .olbg-date { color:#687585; font-size:12px; }
      .olbg-stats .olbg-tables { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:22px; }
      .olbg-stats details { margin-top:20px; }
      .olbg-stats summary { cursor:pointer; font-size:13px; }
      @media(max-width:720px) { .olbg-stats { padding:14px 10px; } .olbg-stats .olbg-tables { grid-template-columns:1fr; gap:0; } .olbg-stats th,.olbg-stats td { font-size:11px; padding:9px 4px; } .olbg-stats th:first-child { width:38%; } }
    `}</style>
    <h2>{p.username}</h2>
    <a href={p.profileUrl} target="_blank" rel="noopener noreferrer">Perfil OLBG · ID {p.profileId}</a>
    <p className="olbg-date">Capturas del {p.sources[0].capturedAt.slice(0, 10)}. No es una sincronización en directo.</p>
    <p className="olbg-note">Yield global: sin dato verificado. No sumamos competiciones solapadas ni promediamos los ROI por deporte.</p>
    <div className="olbg-tables">{groups.map(group => <div key={group.label}>
      <h3>{group.label}</h3>
      {group.rows[0] && <p className="olbg-date">{group.rows[0].fromMonth} a {group.rows[0].throughMonth} · todos los tips de cada deporte</p>}
      <table aria-label={group.label}>
        <thead><tr><th>Deporte</th><th>Picks</th><th>LSP</th><th>ROI OLBG</th></tr></thead>
        <tbody>{group.rows.map(row => <tr key={row.name}>
          <td>{row.name.replace(/ All Tips$/, '')}</td><td>{fmt(row.tips)}</td>
          <td className={row.levelStakeProfit < 0 ? 'olbg-negative' : 'olbg-positive'}>{signed(row.levelStakeProfit)}</td>
          <td>{fmt(row.roiPct, '%')}</td>
        </tr>)}</tbody>
      </table>
    </div>)}</div>
    <p>LSP: beneficio a stake fijo de 1 unidad. Es una serie distinta del beneficio de competición. No son euros ni unidades de otras plataformas.</p>
    <details><summary>Ver meses globales disponibles (All Tips)</summary>
      <p>No equivale a todo el historial. Un mes ausente no se interpreta como cero. El mes en curso se indica aparte.</p>
      <table aria-label="Meses globales disponibles"><thead><tr><th>Mes</th><th>Picks</th><th>LSP</th><th>ROI OLBG</th></tr></thead>
        <tbody>{p.months.map(row => <tr key={row.month}><td>{row.month}{row.currentMonth ? ' (en curso)' : ''}</td><td>{fmt(row.tips)}</td><td>{signed(row.levelStakeProfit)}</td><td>{fmt(row.roiPct, '%')}</td></tr>)}</tbody>
      </table>
    </details>
  </section>
}
