"""Closed UTC month wrapper matching Clone Filter's existing windowBounds.
Source inspected at product commit57351da29ce3ee4d6db72ac084cc928613e580cf,
lib/bet2invest-period-contract.ts and period-pagination-anchor.ts. Offline only.
"""
from be_periods import calculate,utc,months_before

def bounds(at):
    end=utc(at).replace(day=1,hour=0,minute=0,second=0,microsecond=0)
    return ({str(n)+'m':months_before(end,n).isoformat() for n in (3,6,12)},end.isoformat())

def product_periods(pages, *, user_guid, captured_at, read_at, max_pages=10, verified_void_guids=frozenset(), verified_half_loss_guids=frozenset()):
    def nulls(reason):return {str(n)+'m':{'picks':None,'profit':None,'stake':None,'yield':None,'reason':reason} for n in (3,6,12)}
    try:
        cap=utc(captured_at);now=utc(read_at)
        if cap>now:return nulls('future_capture')
        if (cap.year,cap.month)!=(now.year,now.month):return nulls('stale_source_month')
        if any(utc(p.captured_at)>cap for p in pages):return nulls('page_after_capture_anchor')
        cuts,end=bounds(read_at)
        r=calculate(pages,user_guid=user_guid,as_of=captured_at,cutoffs=cuts,max_pages=max_pages,through_exclusive=end,verified_void_guids=verified_void_guids,verified_half_loss_guids=verified_half_loss_guids)
        for name,v in r.items():
            n=int(name[:-1]);v['window_kind']='closed_calendar_months_utc';v['from']=cuts[name][:7]
            v['to']=months_before(utc(end),1).strftime('%Y-%m');v['closed_months']=n
            v['captured_at']=cap.isoformat();v['isWin_validated']=False
        return r
    except (ValueError,TypeError):return nulls('invalid_utc_anchor')
