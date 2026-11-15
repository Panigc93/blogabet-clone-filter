import { TipsterCardData } from './tipster-card-model'

function fmtYield(v: number | null): string {
  if (v === null) return '—'
  return v >= 0 ? `+${v.toFixed(1)}%` : `${v.toFixed(1)}%`
}

function StatCell({ value, label, colorClass, title }: { value: string; label: string; colorClass?: string; title?: string }) {
  return (
    <div className="stat-cell" style={{ textAlign: 'center' }} title={title}>
      <span className={`number ${colorClass ?? ''}`} style={{ display: 'block', fontSize: 22.5, fontWeight: 700, lineHeight: 1.1, color: colorClass ? undefined : '#333' }}>
        {value}
      </span>
      <span style={{ display: 'block', fontSize: 15, fontFamily: 'Roboto, sans-serif', fontWeight: 700, color: '#333', marginTop: 2 }}>
        {label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()}
      </span>
    </div>
  )
}

function PeriodCell({ value, label, colorClass }: { value: string; label: string; colorClass?: string }) {
  return (
    <div className="period-cell" style={{ textAlign: 'center' }}>
      <span className={`number ${colorClass ?? ''}`} style={{ display: 'block', fontSize: 14, fontWeight: 700, lineHeight: 1.1, color: colorClass ? undefined : '#555' }}>
        {value}
      </span>
      <span style={{ display: 'block', fontSize: 11, fontFamily: 'Roboto, sans-serif', fontWeight: 600, color: '#999', marginTop: 1, textTransform: 'uppercase' }}>
        {label}
      </span>
    </div>
  )
}

function numColorClass(value: number | null): string {
  if (value === null) return ''
  if (value > 0) return 'text-success'
  if (value < 0) return 'text-danger'
  return ''
}

function IconBadge({ icon, title }: { icon: string; title?: string }) {
  return (
    <span className="fa-stack" title={title} style={{ fontSize: 15, width: 30, lineHeight: '30px', height: 30 }}>
      <i className="fa fa-circle fa-stack-2x" style={{ color: '#000' }}></i>
      <i className={`fa ${icon} fa-stack-1x fa-inverse`}></i>
    </span>
  )
}

export function TipsterRow({ tipster: t }: { tipster: TipsterCardData }) {
  const initials = t.name.slice(0, 2).toUpperCase()

  return (
    <div
      className="tipster-block"
      style={{ display: 'flex', alignItems: 'stretch', background: '#fff', border: '1px solid #dbe1e8', borderRadius: 3, marginBottom: 6, minHeight: 126 }}
    >
      {/* LEFT: avatar + info */}
      <div className="tipster-left" style={{ display: 'flex', alignItems: 'center', padding: '10px 12px' }}>
        <div style={{ flexShrink: 0, marginRight: 12, width: 96 }}>
          {t.avatarUrl ? (
            <img src={t.avatarUrl} alt={t.name} loading="lazy" style={{ width: 76, height: 76, borderRadius: '50%', objectFit: 'cover', display: 'block', marginLeft: 15 }} />
          ) : (
            <div style={{ width: 76, height: 76, borderRadius: '50%', background: '#82daca', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 18 }}>
              {initials}
            </div>
          )}
        </div>
        <div style={{ flex: 1, textAlign: 'center', overflow: 'hidden' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#333', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t.name}
          </div>
          <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 15, fontFamily: 'Roboto, sans-serif', fontWeight: 300, color: '#eb6379', display: 'block', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>
            {t.sourceLabel}
          </a>
          {t.capturedAt && (
            <div style={{ fontSize: 10, color: '#999', marginBottom: 4 }}>Tipstrr · captura {t.capturedAt} (no es sincronización)</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            {t.isVerified !== null && (
              <IconBadge
                icon={t.isVerified ? 'fa-check' : 'fa-times'}
                title={t.isVerified ? 'Cuenta verificada' : 'Cuenta no verificada'}
              />
            )}
            {t.isPaid && <IconBadge icon="fa-usd" title="De pago" />}
            {t.resetCount > 0 && t.resetTitle && (
              <IconBadge icon="fa-refresh" title={t.resetTitle} />
            )}
            {t.flagUrl && (
              <img src={t.flagUrl} alt={t.countryCode ?? ''} style={{ width: 24, height: 24, objectFit: 'contain' }} />
            )}
          </div>
        </div>
      </div>

      {/* MIDDLE: stats */}
      <div className="tipster-middle" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 4px' }}>
        {/* Row 1: alltime stats */}
        <div className="tipster-stats-alltime" style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', textAlign: 'center', width: '100%', padding: '14px 0 4px' }}>
          <StatCell value={String(t.sinceYear ?? '—')} label="Since" title={t.sinceTitle ?? undefined} />
          <StatCell value={t.picks !== null ? String(t.picks) : '—'} label="Picks" />
          <StatCell
            value={t.profitDisplay ?? '—'}
            label="Profit"
            colorClass={t.profitDisplay ? (t.profitDisplay.startsWith('-') ? 'text-danger' : 'text-success') : ''}
          />
          <StatCell
            value={t.yieldPct !== null ? (t.yieldPct >= 0 ? `+${Math.round(t.yieldPct)}%` : `${Math.round(t.yieldPct)}%`) : '—'}
            label="Yield"
            colorClass={numColorClass(t.yieldPct)}
            title={t.yieldTitle ?? undefined}
          />
          <StatCell
            // DEUDA (Blogabet, preexistente): un verifiedPct ausente se
            // muestra como '0%', que confunde ausencia con 0 real. No se
            // cambia ahora para no alterar la tabla BB en esta rama; las
            // filas Tipstrr sí distinguen ausencia ('—').
            value={t.verifiedPct !== null ? `${Math.round(t.verifiedPct)}%` : t.platform === 'blogabet' ? '0%' : '—'}
            label="Verified"
            colorClass={numColorClass(t.verifiedPct)}
          />
          <StatCell value={t.followers !== null ? String(t.followers) : '—'} label="Followers" />
        </div>
        {/* Row 2: period stats (only if available) */}
        {t.showPeriodRow && (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', borderTop: '1px dashed #eee' }}>
          <div className="tipster-stats-period" style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', textAlign: 'center', width: '100%', padding: '4px 0 6px' }}>
            <PeriodCell
              value={fmtYield(t.yield3m.valuePct)}
              label="Yield 3m"
              colorClass={numColorClass(t.yield3m.valuePct)}
            />
            <PeriodCell
              value={fmtYield(t.yield6m.valuePct)}
              label="Yield 6m"
              colorClass={numColorClass(t.yield6m.valuePct)}
            />
            <PeriodCell
              value={fmtYield(t.yield12m.valuePct)}
              label="Yield 12m"
              colorClass={numColorClass(t.yield12m.valuePct)}
            />
            <PeriodCell
              value={t.picks6mAvg !== null ? `${Math.round(t.picks6mAvg)}` : '—'}
              label="P/mes 6m"
            />
            {t.platform === 'blogabet' && t.isPaid && (
              <>
                <PeriodCell
                  value={t.picksFree3mAvg !== null ? `${Math.round(t.picksFree3mAvg)}` : '—'}
                  label="P/mes free 3m"
                />
                <PeriodCell
                  value={fmtYield(t.yieldFree3m)}
                  label="Yield free 3m"
                  colorClass={numColorClass(t.yieldFree3m)}
                />
              </>
            )}
          </div>
          {/* Trazas de cálculo: no van en la tabla (decisión de Juan, 15-11-2026);
              la auditabilidad vive en /lab/tipstrr/ficha (diagnóstico) */}
          </div>
        )}
      </div>

      {/* RIGHT: actions */}
      <div className="tipster-right" style={{ background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 12px', gap: 6 }}>
        <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.platform === 'tipstrr' ? '#607d8b' : '#82daca', color: '#fff', border: `1px solid ${t.platform === 'tipstrr' ? '#607d8b' : '#4dbfa2'}`, borderBottomWidth: 3, borderBottomColor: t.platform === 'tipstrr' ? '#4a6572' : '#4dbfa2', borderRadius: 4, padding: '7px 10px', width: '100%', fontSize: 11, fontWeight: 700, letterSpacing: '0.3px', gap: 5, whiteSpace: 'nowrap', boxSizing: 'border-box', textDecoration: 'none', cursor: 'pointer' }}>
          <i className="fa fa-external-link"></i> VER EN {t.platform === 'blogabet' ? 'BLOGABET' : 'TIPSTRR'}
        </a>
        {t.isPaid && t.priceLabel && (
          <div style={{ fontSize: 14, fontWeight: 700, color: '#333', textAlign: 'center', width: '100%', cursor: 'default', userSelect: 'none', whiteSpace: 'nowrap' }}>
            {t.priceLabel}{t.priceCurrencySuffix ?? ''} <small style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: '#999' }}>/ mes</small>
          </div>
        )}
      </div>
    </div>
  )
}
