import type { TipsterCardData, PeriodStatView } from './tipster-card-model'
import type { OlbgPreparedProfile } from '../crawler/platforms/olbg/prepare'

// Existing row presentation, local prepared source only. No database fallthrough:
// the current DB does not persist OLBG basis/window/source-ROI provenance.
export function fromOlbgPrepared(p: OlbgPreparedProfile): TipsterCardData {
  const period = (n: 3 | 6 | 12): PeriodStatView => {
    const s = p.summaries.find(x => x.closedMonths === n)!
    const complete = s.missingMonths.length === 0
    return {
      valuePct: complete ? s.derivedLevelStakesYieldPct : null, complete,
      note: s.derivedLevelStakesYieldPct === null ? undefined : 'calculado aprox.',
      trace: `${s.fromMonth} - ${s.throughMonth} · ${s.presentMonths.length}/${n} meses. ` +
        (complete ? `${s.levelStakeProfit} u LSP / ${s.tips} u apostadas × 100; 1u por tip, EW 0,5+0,5. LSP mensual a 0,01u; aproximado, no ROI publicado.`
          : `Sin dato: faltan ${s.missingMonths.join(', ')}. Mes ausente no equivale a cero.`),
    }
  }
  const six = p.summaries.find(x => x.closedMonths === 6)!
  return {
    platform: 'olbg', name: p.username, avatarUrl: null, sourceUrl: p.profileUrl,
    sourceLabel: `olbg.com · ${p.profileId}`,
    capturedAt: new Date(p.sources[0].capturedAt).toISOString().slice(0, 10),
    sinceYear: null, sinceTitle: null,
    // No all-time record is exposed. Never move a 6m/12m result into these cells.
    picks: null, profitDisplay: null, yieldPct: null,
    yieldTitle: 'Historial total desconocido. Los periodos son yield calculado a stake fijo, aproximado y separado del ROI publicado por OLBG.',
    verifiedPct: null, followers: null, isVerified: null, isPaid: false,
    priceLabel: null, priceCurrencySuffix: null, resetCount: 0, resetTitle: null,
    flagUrl: null, countryCode: null,
    yield3m: period(3), yield6m: period(6), yield12m: period(12),
    picks6mAvg: six.tips === null ? null : six.tips / 6,
    picks6mTrace: six.tips === null ? null : `${six.tips} tips / 6 meses cerrados`,
    picksFree3mAvg: null, yieldFree3m: null, showPeriodRow: true,
  }
}
