import type { TipsterCardData, PeriodStatView } from './tipster-card-model'
import type { OlbgPreparedProfile } from '../crawler/platforms/olbg/prepare'
import { validCompactOlbg } from '../crawler/platforms/olbg/compact'

type OlbgCardSource = Pick<OlbgPreparedProfile, 'username' | 'profileId' | 'profileUrl' | 'summaries'> & { sources: { capturedAt: string }[] }

// Existing row presentation, local prepared source only. No database fallthrough:
// the current DB does not persist OLBG basis/window/source-ROI provenance.
export function fromOlbgPrepared(p: OlbgCardSource): TipsterCardData {
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

// Compact period evidence is formula-versioned and validated. Full monthly
// source ROI remains in the private snapshot, not in a full-catalog payload.
export function fromOlbgReadRow(row: { name:string; slug:string; capturedAt:Date|string|null; olbgEvidence?:unknown },now:Date):TipsterCardData|null {
  const e=row.olbgEvidence,at=row.capturedAt?new Date(row.capturedAt):null
  if(!validCompactOlbg(e,true)||row.slug!==String(e.profileId)||!at||!Number.isFinite(at.getTime())||!Number.isFinite(now.getTime())||at.toISOString()!==e.capturedAt)return null
  const summaries=e.windows.map(w=>({
    closedMonths:w.n,fromMonth:w.from,throughMonth:w.through,
    presentMonths:Array(w.present).fill('retained-in-snapshot'),missingMonths:w.missing,
    tips:w.tips,levelStakeProfit:w.lsp,roiPct:null,
    derivedLevelStakesYieldPct:w.missing.length||w.tips===null||w.tips===0?null:100*w.lsp!/w.tips,
    derivedLevelStakesBasis:{scope:'global-all-tips' as const,unitStakePerTip:1 as const,eachWayUnitsPerLeg:0.5 as const,
      denominatorUnits:w.tips,approximate:true as const,sourceLspResolutionUnits:0.01 as const,
      conditionalQuantizationAllowancePct:w.tips?100*w.n*0.01/w.tips:null,allowanceAssumption:'Conditional source quantization',limitation:'Own calculated yield, not published ROI'},
  }))
  const card=fromOlbgPrepared({username:row.name,profileId:e.profileId,profileUrl:e.profileUrl,sources:[{capturedAt:e.capturedAt}],summaries})
  if(e.capturedAt>now.toISOString()||e.sourceMonth!==now.toISOString().slice(0,7)){
    for(const k of ['yield3m','yield6m','yield12m']as const)card[k]={valuePct:null,complete:false,trace:'Captura de otro periodo o futura; sin dato.'}
    card.picks6mAvg=null;card.picks6mTrace=null
  }
  return card
}

export function unknownOlbgCard(name: string, slug: string): TipsterCardData {
  const empty = (): PeriodStatView => ({ valuePct: null, complete: false, trace: 'Sin evidencia mensual vigente de OLBG.' })
  return {
    platform:'olbg',name,avatarUrl:null,
    sourceUrl:/^[1-9]\d*$/.test(slug) ? `https://www.olbg.com/tipsters/about/${slug}` : 'https://www.olbg.com/',
    sourceLabel:'OLBG · sin evidencia vigente', capturedAt:null,sinceYear:null,sinceTitle:null,
    picks:null,profitDisplay:null,yieldPct:null,yieldTitle:'Sin historial total confirmado',
    verifiedPct:null,followers:null,isVerified:null,isPaid:false,priceLabel:null,priceCurrencySuffix:null,
    resetCount:0,resetTitle:null,flagUrl:null,countryCode:null,
    yield3m:empty(),yield6m:empty(),yield12m:empty(),picks6mAvg:null,picks6mTrace:null,
    picksFree3mAvg:null,yieldFree3m:null,showPeriodRow:true,
  }
}
