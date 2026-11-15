import { DEMO_PLATFORM, DEMO_TIPSTRERS, DemoPlatformTipster } from './fixtures'

// Note: the shared MYS helper is NOT used to label a Y pass here. Tipstrr ROI
// (advised stakes) has no validated equivalence with Blogabet yield, so the
// chip says 'ROI declarado' and never 'yield MYS'.

// UI prototype for the multi-platform listing, rendered from FABRICATED data.
// Tipstrr is not connected: no crawler, no permission, no real figures.
// Purpose: test how provenance (metric basis, period, source) and the
// pending-comparability state look before any real integration exists.

const badge = (bg: string, color: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '1px 7px',
  borderRadius: 3,
  fontSize: 11,
  fontWeight: 600,
  background: bg,
  color,
  marginRight: 6,
})

function Chip({ ok, label }: { ok: boolean | null; label: string }) {
  const style =
    ok === null
      ? badge('#eee', '#888')
      : ok
        ? badge('#dff0d8', '#3c763d')
        : badge('#f2dede', '#a94442')
  const text = ok === null ? `${label}: sin datos` : ok ? `${label} ✓` : `${label} ✗`
  return <span style={style}>{text}</span>
}

function DemoRow({ t }: { t: DemoPlatformTipster }) {
  const muestra = t.sample.picks === null ? null : t.sample.picks >= 100
  const roiOk = t.sample.roiPct === null ? null : t.sample.roiPct >= 11
  return (
    <div style={{ border: '1px solid #e3e3e3', borderRadius: 4, padding: '10px 12px', marginBottom: 10, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <div>
          <strong style={{ fontSize: 15 }}>{t.name}</strong>{' '}
          <span style={{ color: '#777', fontSize: 12 }}>{t.sport} · desde {t.sinceLabel}</span>
        </div>
        <div>
          {t.accountType === 'premium'
            ? <span style={badge('#fcf8e3', '#8a6d3b')}>Premium{t.priceLabel ? ` · ${t.priceLabel}` : ''}</span>
            : <span style={badge('#d9edf7', '#31708f')}>Gratis</span>}
          {t.followers !== null && <span style={{ color: '#999', fontSize: 12 }}>{t.followers} seguidores</span>}
        </div>
      </div>
      <div style={{ margin: '8px 0 4px', fontSize: 14 }}>
        {t.sample.picks !== null ? <><strong>{t.sample.picks}</strong> tips · </> : 'tips: sin datos · '}
        {t.sample.roiPct !== null ? <>{DEMO_PLATFORM.metricName} <strong>{t.sample.roiPct}%</strong> · </> : `${DEMO_PLATFORM.metricName}: sin datos · `}
        {t.sample.winRatePct !== null && <>acierto {t.sample.winRatePct}% · </>}
        {t.sample.avgOdds !== null && <>cuota media {t.sample.avgOdds}</>}
      </div>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>
        {t.sample.scopeLabel} · {t.sample.periodLabel} · {DEMO_PLATFORM.metricName} sobre {t.sample.roiBasis} · fuente: {DEMO_PLATFORM.label} (dato fabricado)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        <Chip ok={muestra} label="Muestra ≥100" />
        <Chip ok={roiOk} label={`${DEMO_PLATFORM.metricName} declarado ≥11%`} />
        <span style={{ fontSize: 10, color: '#bbb' }}>sin equivalencia validada con yield</span>
        <span style={badge('#eee', '#888')}>Seguibilidad: sin evaluar</span>
        <span style={badge('#f5f5f5', '#aaa')}>Comparabilidad con Blogabet: pendiente</span>
      </div>
    </div>
  )
}

export default function LabTipstrrPage() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '12px' }}>
      <div style={{ background: '#f2dede', border: '1px solid #ebccd1', color: '#a94442', padding: '8px 12px', borderRadius: 4, fontSize: 13, marginBottom: 12 }}>
        <strong>Prototipo con datos fabricados.</strong> Tipstrr no está conectado: ninguna cifra ni nombre es real.
        Sirve para decidir cómo mostrar métricas de otras plataformas sin mezclar bases de cálculo.
      </div>

      <div style={{ marginBottom: 12, fontSize: 13 }}>
        <span style={badge('#337ab7', '#fff')}>Tipstrr (prototipo)</span>
        <span style={badge('#f5f5f5', '#999')}>Blogabet (producción, sin cambios)</span>
        <span style={badge('#f5f5f5', '#999')}>Golazobets (pendiente)</span>
      </div>

      {DEMO_TIPSTRERS.map((t) => <DemoRow key={t.name} t={t} />)}

      <div style={{ fontSize: 12, color: '#888', borderTop: '1px solid #eee', marginTop: 12, paddingTop: 8 }}>
        <p>{DEMO_PLATFORM.metricBasisNote}</p>
        <p>
          La muestra y el {DEMO_PLATFORM.metricName} declarado se evalúan sobre los datos mostrados; el{' '}
          {DEMO_PLATFORM.metricName} de {DEMO_PLATFORM.label} no está validado como yield MYS. La S (seguibilidad)
          no se infiere de gratuidad ni de precio: requiere verificación propia. Términos de la plataforma:{' '}
          <a href={DEMO_PLATFORM.termsUrl}>{DEMO_PLATFORM.termsUrl}</a>
        </p>
      </div>
    </div>
  )
}
