// Server-only preparation from the reviewed Python staging workflow, not clients.
import {validBEAudit,type BEAudit,BE_PERIODS} from '@/lib/bettingexpert-period-contract'
export function compactBEStaged(input:any):BEAudit{
 const g=input?.global,p=input?.periods
 if(input?.productionReady!==false||input.captureScopesSeparate!==true||g?.ok!==true||g.scope!=='profile-overall'||g.profitUnit!=='bettingexpert-points'||input.identity?.guid!==g.guid||input.identity?.username!==g.username||p?.user_guid!==g.guid||p.username!==g.username||p.scope!=='published-closed-window'||p.profitUnit!=='bettingexpert-points'||p.allTimePatch!==null||p.isWinValidated!==false)throw Error('invalid BE staged identity')
 const receipts=Object.values(p.windowReconciliation??{}) as any[]
 const anchorTimes=receipts.map(r=>r.anchor_response_ended_utc)
 const out:any={guid:g.guid,slug:g.username,globalCapturedAt:new Date(g.capturedAt).toISOString(),periodCapturedAt:new Date(p.periodCapturedAt).toISOString(),anchorCapturedAt:anchorTimes.length?new Date(anchorTimes.sort().at(-1)).toISOString():new Date(p.periodCapturedAt).toISOString(),evidenceSha256:p.evidenceSha256,windows:{}}
 for(const n of BE_PERIODS){const w=p.audit?.[`${n}m`],r=p.windowReconciliation?.[`${n}m`]
  if(!w)throw Error('missing BE window')
  if(w.reason===null&&(!r||r.ledger_closed_count!==w.picks||r.official_anchor_count_delta!==w.picks||Math.abs(Number(r.ledger_net_profit)-Number(w.profit))>1e-5||Math.abs(Number(r.official_anchor_profit_delta)-Number(w.profit))>1e-5||new Date(r.period_captured_at).toISOString()!==out.periodCapturedAt))throw Error('unreconciled BE window')
  out.windows[n]={value:w.yield,reason:w.reason,picks:w.picks,profit:w.profit,stake:w.stake,from:w.from,to:w.to}
 }
 if(!validBEAudit(out))throw Error('invalid BE compact window audit')
 return out
}
