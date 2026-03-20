import { Tipster } from '@/db/schema'

function StatCell({ value, label, colorClass }: { value: string; label: string; colorClass?: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 60 }}>
      <span className={`number ${colorClass ?? ''}`} style={{ display: 'block', fontSize: 22.5, fontWeight: 700, lineHeight: 1.1, color: colorClass ? undefined : '#333' }}>
        {value}
      </span>
      <span style={{ display: 'block', fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: '0.3px', marginTop: 2 }}>
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

export function TipsterRow({ tipster }: { tipster: Tipster }) {
  const blogUrl = `https://${tipster.slug}.blogabet.com`
  const initials = tipster.name.slice(0, 2).toUpperCase()

  return (
    <a
      href={blogUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="tipster-block"
      style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'stretch', background: '#fff', border: '1px solid #dbe1e8', borderRadius: 3, marginBottom: 6 }}
    >
      {/* LEFT: avatar + info */}
      <div style={{ borderLeft: '4px solid #82daca', display: 'flex', alignItems: 'center', padding: '10px 12px', minWidth: 240, maxWidth: 240 }}>
        <div style={{ flexShrink: 0, marginRight: 10 }}>
          {tipster.avatarUrl ? (
            <img src={tipster.avatarUrl} alt={tipster.name} style={{ width: 60, height: 60, borderRadius: '50%', border: '2px solid #82daca', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#82daca', border: '2px solid #82daca', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 12 }}>
              {initials}
            </div>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#333', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <strong>{tipster.name}</strong>
          </div>
          <span style={{ fontSize: 11, color: '#4dbfa2', display: 'block', marginBottom: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tipster.slug}.blogabet.com
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span className="fa-stack" style={{ fontSize: 9, width: 18, lineHeight: '18px', height: 18 }}>
              <i className={`fa fa-circle fa-stack-2x`} style={{ color: Number(tipster.verifiedPct) > 0 ? '#4dbfa2' : '#ccc' }}></i>
              <i className={`fa ${Number(tipster.verifiedPct) > 0 ? 'fa-check' : 'fa-times'} fa-stack-1x fa-inverse`}></i>
            </span>
            {tipster.isPaid && (
              <span className="fa-stack" style={{ fontSize: 9, width: 18, lineHeight: '18px', height: 18 }}>
                <i className="fa fa-circle fa-stack-2x" style={{ color: '#4dbfa2' }}></i>
                <i className="fa fa-usd fa-stack-1x fa-inverse"></i>
              </span>
            )}
            {Number(tipster.resetCount) > 0 && (
              <span className="fa-stack" title={`Stats reseteadas ${tipster.resetCount} veces`} style={{ fontSize: 9, width: 18, lineHeight: '18px', height: 18 }}>
                <i className="fa fa-circle fa-stack-2x" style={{ color: '#ccc' }}></i>
                <i className="fa fa-refresh fa-stack-1x fa-inverse"></i>
              </span>
            )}
            {tipster.flagUrl && (
              <img src={tipster.flagUrl} alt={tipster.countryCode ?? ''} style={{ height: 14 }} />
            )}
          </div>
        </div>
      </div>

      {/* MIDDLE: stats */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 4px', borderLeft: '1px solid #eee' }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', textAlign: 'center', width: '100%', padding: '8px 0' }}>
          <StatCell value={String(tipster.sinceYear ?? '—')} label="Since" />
          <StatCell value={String(tipster.picks)} label="Picks" />
          <StatCell
            value={tipster.profit != null ? (Number(tipster.profit) >= 0 ? `+${tipster.profit}` : String(tipster.profit)) : '—'}
            label="Profit"
            colorClass={numColorClass(tipster.profit)}
          />
          <StatCell
            value={tipster.yield != null ? (Number(tipster.yield) >= 0 ? `+${tipster.yield}%` : `${tipster.yield}%`) : '—'}
            label="Yield"
            colorClass={numColorClass(tipster.yield)}
          />
          <StatCell
            value={tipster.verifiedPct != null ? `${tipster.verifiedPct}%` : '0%'}
            label="Verified"
            colorClass={numColorClass(tipster.verifiedPct)}
          />
          <StatCell value={String(tipster.followers)} label="Followers" />
        </div>
      </div>

      {/* RIGHT: actions */}
      <div style={{ background: '#fff', minWidth: 150, width: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 12px', gap: 6, borderLeft: '1px solid #eee' }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#82daca', color: '#fff', border: '1px solid #4dbfa2', borderBottomWidth: 3, borderRadius: 4, padding: '7px 10px', width: '100%', fontSize: 11, fontWeight: 700, letterSpacing: '0.3px', gap: 5, whiteSpace: 'nowrap', boxSizing: 'border-box' }}>
          <i className="fa fa-external-link"></i> VER EN BLOGABET
        </span>
        {tipster.isPaid && tipster.price && (
          <div style={{ fontSize: 14, fontWeight: 700, color: '#333', textAlign: 'center', width: '100%', cursor: 'default', userSelect: 'none', whiteSpace: 'nowrap' }}>
            {tipster.price}€ <small style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: '#999' }}>/ mes</small>
          </div>
        )}
      </div>
    </a>
  )
}
