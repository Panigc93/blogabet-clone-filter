"""Narrow local fully-refunded VOID gate, no networking or persistence.
Does not replace structural validation: runs baseline reader before granting.
"""
from decimal import Decimal
from be_periods import money,utc
from product_periods import product_periods

def reconciled_refunded_void_periods(pages,*,user_guid,username,captured_at,read_at,max_pages=10):
    args=dict(user_guid=user_guid,captured_at=captured_at,read_at=read_at,max_pages=max_pages)
    baseline=product_periods(pages,**args)
    denied=lambda reason:{'accepted':False,'reason':reason,'void_guids':[],'windows':baseline,'productionReady':False}
    # Require independently validated pagination/coverage, even if VOID itself
    # holds affected windows. Invalid structural input cannot earn this grant.
    allowed={None,'unverified_status','no_closed_sample'}
    if any(w['reason'] not in allowed for w in baseline.values()):return denied('baseline_ineligible')
    if not pages:return denied('no_pages')
    rows={t['guid']:t for p in pages for t in p.tips}
    if len(pages[-1].tips)>=pages[-1].limit or len(rows)!=pages[-1].count:return denied('full_observed_ledger_required')
    try:
        tips=list(rows.values())
        if any(t['user']['guid']!=user_guid or t['user']['username']!=username for t in tips):return denied('identity_mismatch')
        if any(t.get('isDeleted') is not False for t in tips):return denied('deleted_or_missing_flag')
        if any(t['status'] not in (2,3,4) for t in tips):return denied('unknown_status')
        voids=[t for t in tips if t['status']==4]
        if not voids:return denied('no_void_evidence')
        for t in voids:
            b=t['bet'];s=money(b['stake'])
            if s<=0 or money(b['profit'])!=0 or money(b['return'])!=s:return denied('void_not_fully_refunded')
        closed=[t for t in tips if t['status']==2]
        if not closed:return denied('no_closed_ledger')
        stake=sum((money(t['bet']['stake']) for t in closed),Decimal(0));profit=sum((money(t['bet']['profit']) for t in closed),Decimal(0))
        if stake<=0:return denied('invalid_stake')
        for t in closed:
            b=t['bet'];s=money(b['stake']);p=money(b['profit']);r=money(b['return']);o=money(b['odds'])
            if s<=0 or o<=1 or r<0 or abs(r-s-p)>Decimal('.00001'):return denied('invalid_closed_bet')
            # Reconciliation uses source net profit, including settlements outside
            # judged windows. Per-window reader still holds unknown patterns;
            # matching global totals does not authorize a new settlement rule.
        stats=[t['user']['stats'] for t in tips]
        if any(s!=stats[0] for s in stats):return denied('mutable_global_stats')
        g=stats[0]
        if type(g['tipsCount']) is not int or g['tipsCount']!=len(closed):return denied('global_count_mismatch')
        if abs(money(g['profit'])-profit)>Decimal('.00001'):return denied('global_profit_mismatch')
        # Public profile user.stats yield is observed to 3dp. Tolerance is only
        # rounding precision, not permission to absorb a material discrepancy.
        if abs(money(g['yield'])-100*profit/stake)>Decimal('.0005'):return denied('global_yield_mismatch')
        ids=frozenset(t['guid'] for t in voids)
        windows=product_periods(pages,**args,verified_void_guids=ids)
        return {'accepted':True,'reason':None,'void_guids':sorted(ids),'windows':windows,'productionReady':False,
                'gate':'full-observed-ledger-global-reconciled-fully-refunded-void-v1',
                'global_observed':{'picks':len(closed),'profit':str(profit),'stake':str(stake),'yield':str(100*profit/stake)},
                'scope':'this-identity-this-capture-only','isWinValidated':False}
    except (KeyError,ValueError,TypeError):return denied('malformed_reconciliation_evidence')
