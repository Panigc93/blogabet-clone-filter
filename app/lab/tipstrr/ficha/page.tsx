import { STATMIND_SNAPSHOT, FichaSnapshot } from './fixtures'

// Ficha Blogabet-parity prototype fed by a REAL one-off labeled snapshot
// (see fixtures.ts for capture metadata). Purpose: show exactly which BB
// card fields a Tipstrr profile can fill today and which it cannot.

const cell: React.CSSProperties = { textAlign: 'center', minWidth: 86 }
const val: React.CSSProperties = { fontSize: 20, fontWeight: 800, color: '#333' }
const lab: React.CSSProperties = { fontSize: 10, textTransform: 'uppercase', color: '#999', letterSpacing: 0.4 }
const numColor = (v: number | null) => (v === null ? '#333' : v >= 0 ? '#3c763d' : '#a94442')

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div style={cell}>
      <div style={{ ...val, color: color ?? '#333' }}>{value}</div>
      <div style={lab}>{label}</div>
    </div>
  )
}

function Ficha({ s }: { s: FichaSnapshot }) {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: 12, fontFamily: 'Roboto, Arial, sans-serif' }}>
      <div style={{ background: '#d9edf7', border: '1px solid #bce8f1', color: '#31708f', padding: '8px 12px', borderRadius: 4, fontSize: 13, marginBottom: 12 }}>
        <strong>Captura real puntual</strong> de {s.sourceUrl} · {s.capturedAt} · cifras agregadas fechadas;
        pueden no reflejar las actuales. No es una sincronización ni una integración desplegada.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        {s.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.avatarUrl} alt={s.name} width={64} height={64} style={{ borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#82daca' }} />
        )}
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{s.name}</div>
          <div style={{ fontSize: 13, color: '#777' }}>
            {s.platformLabel} · alta cuenta {s.signupDate} · tips activos ahora: {s.activeTipsNow ?? '—'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, border: '1px solid #e3e3e3', borderRadius: 4, padding: '12px 8px', background: '#fff' }}>
        <Stat value={s.overview.tips !== null ? String(s.overview.tips) : '—'} label="Picks" />
        <Stat value={s.overview.profitDisplay ?? '—'} label="Profit (10/10=£10)" color={s.overview.roiPct !== null ? numColor(s.overview.roiPct) : undefined} />
        <Stat value={s.overview.roiPct !== null ? `${s.overview.roiPct}%` : '—'} label="ROI / yield*" color={numColor(s.overview.roiPct)} />
        <Stat value={s.overview.winRatePct !== null ? `${s.overview.winRatePct}%` : '—'} label="Acierto" />
        <Stat value={s.overview.avgOdds !== null ? String(s.overview.avgOdds) : '—'} label="Cuota media" />
        <div style={cell}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#333' }}>{s.overview.stakeLabel ?? '—'}</div>
          <div style={lab}>Stake</div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#999', margin: '4px 0 10px' }}>* {s.yieldEquivalenceNote} ({s.overview.roiPeriodLabel})</div>

      <div style={{ fontSize: 13, fontWeight: 700, margin: '10px 0 4px' }}>Desglose mensual (cifras de la fuente, sin derivar)</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#999', fontSize: 11 }}>
            <th style={{ padding: 4 }}>Mes</th><th style={{ padding: 4 }}>Tips</th><th style={{ padding: 4 }}>Acierto</th>
            <th style={{ padding: 4 }}>Profit</th><th style={{ padding: 4 }}>ROI</th><th style={{ padding: 4 }}>Cuota media</th><th style={{ padding: 4 }}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {s.months.map((m) => (
            <tr key={m.label} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: 4 }}>{m.label}</td>
              <td style={{ padding: 4 }}>{m.tips ?? '—'}</td>
              <td style={{ padding: 4 }}>{m.winRatePct !== null ? `${m.winRatePct}%` : '—'}</td>
              <td style={{ padding: 4, color: m.profitLabel.startsWith('-') ? '#a94442' : '#3c763d' }}>{m.profitLabel}</td>
              <td style={{ padding: 4, color: numColor(m.roiPct) }}>{m.roiPct !== null ? `${m.roiPct}%` : '—'}</td>
              <td style={{ padding: 4 }}>{m.avgOdds ?? '—'}</td>
              <td style={{ padding: 4, fontSize: 11, color: '#999' }}>
                {m.closed ? (m.partialSinceSignup ? 'cerrado · parcial desde el alta' : 'cerrado') : 'en curso (no cuenta para periodos)'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ fontSize: 13, fontWeight: 700, margin: '12px 0 4px' }}>Chequeos de consistencia de este registro</div>
      <ul style={{ fontSize: 12, color: '#555', margin: 0, paddingLeft: 18 }}>
        {s.consistency.map((c) => (
          <li key={c.name} style={{ color: c.passed ? '#3c763d' : '#a94442' }}>{c.passed ? '✓' : '✗'} {c.name}</li>
        ))}
      </ul>

      <div style={{ fontSize: 13, fontWeight: 700, margin: '12px 0 4px' }}>Campos de la ficha BB no disponibles aquí</div>
      <ul style={{ fontSize: 12, color: '#777', margin: 0, paddingLeft: 18 }}>
        {s.notAvailable.map((n) => (
          <li key={n.field}><strong>{n.field}:</strong> {n.reason}</li>
        ))}
      </ul>

      <div style={{ fontSize: 12, color: '#888', borderTop: '1px solid #eee', marginTop: 12, paddingTop: 8 }}>
        Último resultado visible: {s.lastResultVisibleLabel}. Yield 3/6/12m: sin historial suficiente (solo un mes
        cerrado y parcial); se muestran los meses de la fuente en vez de inventar periodos.
      </div>
    </div>
  )
}

export default function LabTipstrrFichaPage() {
  return <Ficha s={STATMIND_SNAPSHOT} />
}
