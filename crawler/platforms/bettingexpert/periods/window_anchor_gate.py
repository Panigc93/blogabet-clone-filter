"""Scope-specific official-anchor reconciliation. No network/DB effects.
Only exact observed GUID exceptions, never source-wide status rules.
"""
from decimal import Decimal
from be_periods import utc,created,money
from product_periods import product_periods,bounds

# Anchor input carries raw source envelope and per-response metadata.
# Expected four query variable keys are explicit; never infer absence as zero.
def anchored_windows(pages,*,user_guid,username,captured_at,read_at,anchor_request,anchor_response,anchor_meta,max_pages=10):
    args=dict(user_guid=user_guid,captured_at=captured_at,read_at=read_at,max_pages=max_pages)
    baseline=product_periods(pages,**args)
    out={'gate':'closed-window-official-count-profit-v1','productionReady':False,'scope':'this-identity-this-capture-each-window','windows':baseline,'reconciliation':{},'isWinValidated':False}
    def hold(n,reason):
        w=dict(baseline[n]);w.update(picks=None,profit=None,stake=None,reason=reason,**{'yield':None});out['windows'][n]=w
    try:
        cuts,end=bounds(read_at);cap=utc(captured_at)
        if anchor_meta['status']!=200 or anchor_response.get('errors'):raise ValueError('invalid_anchor_response')
        start=utc(anchor_meta['started_utc']);finish=utc(anchor_meta['ended_utc'])
        if finish<start or start<cap or finish>utc(read_at):raise ValueError('anchor_time_mismatch')
        if finish.strftime('%Y-%m')!=cap.strftime('%Y-%m'):raise ValueError('anchor_month_mismatch')
        # Fixed known source query and exact UTC boundary strings. Aliases do not
        # by themselves prove filtering, so require the retained operation text.
        variables=anchor_request['variables'];query=anchor_request['query']
        expected_query='query($a:String,$b:String,$c:String,$d:String){'+''.join(k+':topTipsters(limit:5000,timefrom:$'+k+'){guid username stats{profit tipsCount yield}}' for k in ('a','b','c','d'))+'}'
        if ''.join(query.split())!=''.join(expected_query.split()):raise ValueError('anchor_query_mismatch')
        expected={'a':cuts['12m'],'b':cuts['6m'],'c':cuts['3m'],'d':end}
        for key,date in expected.items():
            actual=variables[key]
            if actual!=utc(date).strftime('%Y-%m-%d %H:%M:%S.000000'):raise ValueError('anchor_boundary_mismatch')
        samples={}
        for key in expected:
            found=[r for r in anchor_response['data'][key] if r.get('guid')==user_guid]
            if len(found)!=1 or found[0].get('username')!=username:raise ValueError('missing_or_wrong_anchor_identity')
            s=found[0]['stats']
            if type(s['tipsCount']) is not int or s['tipsCount']<0:raise ValueError('invalid_anchor_count')
            samples[key]={'count':s['tipsCount'],'profit':money(s['profit'])}
        rows={t['guid']:t for p in pages for t in p.tips}
        if any(t['user']['guid']!=user_guid or t['user']['username']!=username for t in rows.values()):raise ValueError('identity_mismatch')
        for n,key in [('3m','c'),('6m','b'),('12m','a')]:
            if baseline[n]['reason'] not in (None,'unverified_status','unverified_settlement_pattern'):
                continue # Structural/coverage/empty failure cannot earn an exception.
            window=[t for t in rows.values() if utc(cuts[n])<=created(t)<utc(end)]
            if any(t.get('isDeleted') is not False for t in window):hold(n,'deleted_or_missing_flag');continue
            if any(t.get('status') not in (2,3,4) for t in window):hold(n,'unknown_status');continue
            voids=[];half=[];closed=[];shape_error=None
            for t in window:
                b=t['bet'];s=money(b['stake']);p=money(b['profit']);r=money(b['return']);o=money(b['odds'])
                if t['status']==3:continue # Already validated pending convention, not counted.
                if s<=0 or r<0 or o<=1 or abs(r-s-p)>Decimal('.00001'):shape_error='invalid_settlement_arithmetic';break
                if t['status']==4:
                    if p!=0 or r!=s:shape_error='void_not_fully_refunded';break
                    voids.append(t['guid']);continue
                closed.append(t)
                full=s*(o-1)
                if p==-s/2 and r==s/2:half.append(t['guid'])
                elif not any(abs(p-v)<=Decimal('.00001') for v in (-s,Decimal(0),full,full/2)):
                    shape_error='unknown_settlement_pattern';break
            if shape_error:hold(n,shape_error);continue
            count=samples[key]['count']-samples['d']['count'];profit=samples[key]['profit']-samples['d']['profit']
            ledger_profit=sum((money(t['bet']['profit']) for t in closed),Decimal(0))
            if count<0 or count!=len(closed):hold(n,'window_anchor_count_mismatch');continue
            if abs(profit-ledger_profit)>Decimal('.00001'):hold(n,'window_anchor_profit_mismatch');continue
            candidate=product_periods(pages,**args,verified_void_guids=frozenset(voids),verified_half_loss_guids=frozenset(half))[n]
            # Other windows' exceptions are not carried over or cached.
            out['windows'][n]=candidate
            out['reconciliation'][n]={'ledger_closed_count':len(closed),'ledger_net_profit':str(ledger_profit),'official_anchor_count_delta':count,'official_anchor_profit_delta':str(profit),'excluded_void_guids':voids,'exact_half_loss_guids':half,'anchor_response_ended_utc':finish.isoformat(),'period_captured_at':captured_at,'yield_basis':'source-net-profit/source-advised-stake; not difference of yields'}
        return out
    except (KeyError,TypeError,ValueError) as e:
        for n in baseline:hold(n,str(e) if isinstance(e,ValueError) else 'malformed_anchor_evidence')
        return out
