import { Tipster } from '@/db/schema'

function fmtYield(v: string | null): string {
  if (!v) return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  return n >= 0 ? `+${n.toFixed(1)}%` : `${n.toFixed(1)}%`
}

function StatCell({ value, label, colorClass }: { value: string; label: string; colorClass?: string }) {
  return (
    <div className="stat-cell" style={{ textAlign: 'center' }}>
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

function numColorClass(value: string | null): string {
  if (!value) return ''
  const n = parseFloat(value)
  if (isNaN(n)) return ''
  if (n > 0) return 'text-success'
  if (n < 0) return 'text-danger'
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

export function TipsterRow({ tipster }: { tipster: Tipster }) {
  const blogUrl = `https://${tipster.slug}.blogabet.com`
  const initials = tipster.name.slice(0, 2).toUpperCase()

  return (
    <div
      className="tipster-block"
      style={{ display: 'flex', alignItems: 'stretch', background: '#fff', border: '1px solid #dbe1e8', borderRadius: 3, marginBottom: 6, minHeight: 126 }}
    >
      {/* LEFT: avatar + info */}
      <div className="tipster-left" style={{ display: 'flex', alignItems: 'center', padding: '10px 12px' }}>
        <div style={{ flexShrink: 0, marginRight: 12 }}>
          {tipster.avatarUrl ? (
            <img src={tipster.avatarUrl} alt={tipster.name} loading="lazy" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: 96, height: 96, borderRadius: '50%', background: '#82daca', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 18 }}>
              {initials}
            </div>
          )}
        </div>
        <div style={{ flex: 1, textAlign: 'center', overflow: 'hidden' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#333', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {tipster.name}
          </div>
          <a href={blogUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 15, fontFamily: 'Roboto, sans-serif', fontWeight: 300, color: '#eb6379', display: 'block', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>
            {tipster.slug}.blogabet.com
          </a>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <IconBadge
              icon={Number(tipster.verifiedPct) > 0 ? 'fa-check' : 'fa-times'}
              title={Number(tipster.verifiedPct) > 0 ? 'Verificado' : 'No verificado'}
            />
            {tipster.isPaid && <IconBadge icon="fa-usd" title="De pago" />}
            {Number(tipster.resetCount) > 0 && (
              <IconBadge icon="fa-refresh" title={`Stats reseteadas ${tipster.resetCount} veces`} />
            )}
            {tipster.flagUrl && (
              <img src={tipster.flagUrl} alt={tipster.countryCode ?? ''} style={{ width: 24, height: 24, objectFit: 'contain' }} />
            )}
          </div>
        </div>
      </div>

      {/* MIDDLE: stats */}
      <div className="tipster-middle" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 4px' }}>
        {/* Row 1: alltime stats */}
        <div className="tipster-stats-alltime" style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', textAlign: 'center', width: '100%', padding: '14px 0 4px' }}>
          <StatCell value={String(tipster.sinceYear ?? '—')} label="Since" />
          <StatCell value={String(tipster.picks)} label="Picks" />
          <StatCell
            value={tipster.profit != null ? (Number(tipster.profit) >= 0 ? `+${Math.round(Number(tipster.profit))}` : String(Math.round(Number(tipster.profit)))) : '—'}
            label="Profit"
            colorClass={numColorClass(tipster.profit)}
          />
          <StatCell
            value={tipster.yield != null ? (Number(tipster.yield) >= 0 ? `+${Math.round(Number(tipster.yield))}%` : `${Math.round(Number(tipster.yield))}%`) : '—'}
            label="Yield"
            colorClass={numColorClass(tipster.yield)}
          />
          <StatCell
            value={tipster.verifiedPct != null ? `${Math.round(Number(tipster.verifiedPct))}%` : '0%'}
            label="Verified"
            colorClass={numColorClass(tipster.verifiedPct)}
          />
          <StatCell value={String(tipster.followers)} label="Followers" />
        </div>
        {/* Row 2: period stats (only if available) */}
        {(tipster.yield6m != null || tipster.yield12m != null || tipster.picks6mAvg != null) && (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', borderTop: '1px dashed #eee' }}>
          <div className="tipster-stats-period" style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', textAlign: 'center', width: '100%', padding: '4px 0 6px' }}>
            <PeriodCell
              value={tipster.yield3m != null ? fmtYield(tipster.yield3m) : '—'}
              label="Yield 3m"
              colorClass={numColorClass(tipster.yield3m)}
            />
            <PeriodCell
              value={tipster.yield6m != null ? fmtYield(tipster.yield6m) : '—'}
              label="Yield 6m"
              colorClass={numColorClass(tipster.yield6m)}
            />
            <PeriodCell
              value={tipster.yield12m != null ? fmtYield(tipster.yield12m) : '—'}
              label="Yield 12m"
              colorClass={numColorClass(tipster.yield12m)}
            />
            <PeriodCell
              value={tipster.picks6mAvg != null ? `${Math.round(Number(tipster.picks6mAvg))}` : '—'}
              label="P/mes 6m"
            />
            {tipster.isPaid && (
              <>
                <PeriodCell
                  value={tipster.picksFree3mAvg != null ? `${Math.round(Number(tipster.picksFree3mAvg))}` : '—'}
                  label="P/mes free 3m"
                />
                <PeriodCell
                  value={tipster.yieldFree3m != null ? fmtYield(tipster.yieldFree3m) : '—'}
                  label="Yield free 3m"
                  colorClass={numColorClass(tipster.yieldFree3m)}
                />
              </>
            )}
          </div>
          </div>
        )}
      </div>

      {/* RIGHT: actions */}
      <div className="tipster-right" style={{ background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 12px', gap: 6 }}>
        <a href={blogUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#82daca', color: '#fff', border: '1px solid #4dbfa2', borderBottomWidth: 3, borderRadius: 4, padding: '7px 10px', width: '100%', fontSize: 11, fontWeight: 700, letterSpacing: '0.3px', gap: 5, whiteSpace: 'nowrap', boxSizing: 'border-box', textDecoration: 'none', cursor: 'pointer' }}>
          <i className="fa fa-external-link"></i> VER EN BLOGABET
        </a>
        {tipster.isPaid && tipster.price && (
          <div style={{ fontSize: 14, fontWeight: 700, color: '#333', textAlign: 'center', width: '100%', cursor: 'default', userSelect: 'none', whiteSpace: 'nowrap' }}>
            {tipster.price}€ <small style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: '#999' }}>/ mes</small>
          </div>
        )}
      </div>
    </div>
  )
}
