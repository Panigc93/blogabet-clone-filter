"""Offline, fail-closed Bettingexpert period calculator. No networking or writes.
Not a collector, database adapter or production integration. Python 3.10+.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import calendar

@dataclass(frozen=True)
class Page:
    skip: int
    limit: int
    count: int
    tips: list
    captured_at: str
    repeated_identically: bool = False

def utc(value):
    d=datetime.fromisoformat(value.replace('Z','+00:00'))
    if d.tzinfo is None: raise ValueError('timezone_required')
    if d.utcoffset().total_seconds()!=0: raise ValueError('utc_required')
    return d.astimezone(timezone.utc)

def created(tip):
    x=tip['created']
    if x.get('timezone') not in ('UTC','+00:00'): raise ValueError('unverified_source_timezone')
    return utc(x['date'].replace(' ','T')+'+00:00')

def months_before(d,n):
    year,month=divmod(d.year*12+d.month-1-n,12);month+=1
    return d.replace(year=year,month=month,day=min(d.day,calendar.monthrange(year,month)[1]))

def money(v):
    if isinstance(v,bool) or v is None: raise ValueError('invalid_numeric')
    try: x=Decimal(str(v))
    except (InvalidOperation,ValueError): raise ValueError('invalid_numeric')
    if not x.is_finite(): raise ValueError('invalid_numeric')
    return x

def calculate(pages, *, user_guid, as_of, cutoffs=None, max_pages=10, through_exclusive=None, verified_void_guids=frozenset(), verified_half_loss_guids=frozenset()):
    """Return period metrics only where retained pages prove local coverage.

    cutoffs must explicitly name 3m/6m/12m if supplied. Otherwise calendar-month
    subtraction from as_of is used, preserving UTC time-of-day. Inclusive lower
    and upper boundaries. Caller must select product semantics explicitly.
    Every successful result is captured_snapshot, never atomic live history.
    """
    names=('3m','6m','12m')
    def blocked(reason):
        return {n:{'picks':None,'profit':None,'stake':None,'yield':None,'reason':reason} for n in names}
    try:
        end=utc(as_of)
        through=utc(through_exclusive) if through_exclusive else None
        if through and through>end:return blocked('future_through')
        cuts={n:utc(cutoffs[n]) if cutoffs else months_before(end,int(n[:-1])) for n in names}
        if any(v>end for v in cuts.values()):return blocked('invalid_cutoff')
        if not cuts['12m']<=cuts['6m']<=cuts['3m']:return blocked('invalid_cutoff_order')
        if not pages:return blocked('no_pages')
        if len(pages)>max_pages:return blocked('page_cap')
        rows=[]; seen={}; last_capture=None; previous=None; count=None
        for page in pages:
            stamp=utc(page.captured_at)
            if stamp>end or (last_capture and stamp<last_capture):return blocked('capture_time_inconsistent')
            last_capture=stamp
            if page.skip<0 or page.limit<=0 or page.count<0 or len(page.tips)>page.limit:return blocked('invalid_page')
            if count is None: count=page.count
            if count!=page.count:return blocked('mutable_count')
            if page.skip==0 and previous is not None:return blocked('unexpected_restart')
            if previous is None and page.skip!=0:return blocked('missing_first_page')
            ids=[t['guid'] for t in page.tips]
            if len(set(ids))!=len(ids):return blocked('duplicate_guid_in_page')
            dates=[created(t) for t in page.tips]
            if any(dates[i]>dates[i-1] for i in range(1,len(dates))):return blocked('unsorted_dates')
            if previous:
                overlap=len(rows)-page.skip
                if overlap<=0 or overlap>=len(page.tips):return blocked('missing_overlap_or_progress')
                if rows[page.skip:]!=page.tips[:overlap]:return blocked('mutable_overlap')
                if not page.repeated_identically:return blocked('unverified_boundary_repeat')
                # A timestamp tie at the handoff has no verified stable tiebreaker.
                if dates[overlap-1]==dates[overlap]:return blocked('boundary_date_tie')
                fresh=page.tips[overlap:]
            else:fresh=page.tips
            for tip in fresh:
                if tip['guid'] in seen:return blocked('duplicate_guid_across_pages')
                if tip['user']['guid']!=user_guid:return blocked('wrong_user')
                seen[tip['guid']]=tip; rows.append(tip)
            if len(rows)>count:return blocked('count_underflow')
            previous=page
        if any(created(rows[i])>created(rows[i-1]) for i in range(1,len(rows))):return blocked('unsorted_merged_dates')
        # A short terminal page and matching provider count establish observed
        # completeness only. They are not proof against historical source gaps.
        terminal=bool(previous and len(previous.tips)<previous.limit and len(rows)==count)
        result={}
        for name,cut in cuts.items():
            base={'picks':None,'profit':None,'stake':None,'yield':None,'through_exclusive_utc':through.isoformat() if through else None,'cutoff_utc':cut.isoformat(),'as_of_utc':end.isoformat(),'scope':'captured_snapshot','atomic':False,'not_all_time':True}
            if not terminal and (not rows or created(rows[-1])>=cut):
                result[name]={**base,'reason':'incomplete_coverage_or_cap'};continue
            window=[t for t in rows if cut<=created(t)<=end and (through is None or created(t)<through)]
            if any(created(t)>end for t in rows):
                result[name]={**base,'reason':'future_created'};continue
            if any(t.get('isDeleted') is not False for t in window):
                result[name]={**base,'reason':'deleted_or_missing_deletion_flag'};continue
            # MANUAL is pending in the frontend and excluded in validated samples.
            try:
                approved_void=[]
                for t in window:
                    if t.get('status')==4 and t.get('guid') in verified_void_guids:
                        b=t['bet'];s=money(b['stake'])
                        if s<=0 or money(b['profit'])!=0 or money(b['return'])!=s:raise ValueError('void_refund_mismatch')
                        approved_void.append(t)
                unknown={t.get('status') for t in window if t not in approved_void}-{2,3}
                if unknown:
                    result[name]={**base,'reason':'unverified_status','statuses':sorted(str(x) for x in unknown)};continue
                settled=[t for t in window if t['status']==2]
                # Do not silently invent a zero-yield empty sample.
                if not settled:
                    result[name]={**base,'reason':'no_closed_sample'};continue
                stake=Decimal(0);profit=Decimal(0)
                for t in settled:
                    b=t['bet']; s=money(b['stake']);p=money(b['profit']);r=money(b['return']);odds=money(b['odds'])
                    if s<=0 or odds<=1 or r<0:raise ValueError('invalid_bet_values')
                    if abs((r-s)-p)>Decimal('.00001'):raise ValueError('profit_return_mismatch')
                    # Full loss, push, full win and the one sampled half-win pattern.
                    # Half-loss/other settlement forms remain on hold.
                    full=s*(odds-1)
                    known=any(abs(p-v)<=Decimal('.00001') for v in (-s,Decimal(0),full,full/2))
                    if t['guid'] in verified_half_loss_guids and p==-s/2 and r==s/2:known=True
                    if not known:raise ValueError('unverified_settlement_pattern')
                    stake+=s;profit+=p
                result[name]={**base,'picks':len(settled),'profit':str(profit),'stake':str(stake),'yield':str(profit/stake*100),'pending_excluded':sum(t['status']==3 for t in window),'verified_refunded_void_excluded':len(approved_void),'reason':None,'coverage_basis':'terminal_count_reconciled' if terminal else 'crossed_cutoff_with_overlap','caveat':'Source completeness and immutable snapshot are not guaranteed.'}
            except (KeyError,TypeError,ValueError,IndexError) as e:
                result[name]={**base,'reason':str(e) if isinstance(e,ValueError) else 'malformed_window_evidence'}
        return result
    except (KeyError,TypeError,ValueError,IndexError) as e:
        return blocked(str(e) if isinstance(e,ValueError) else 'malformed_evidence')
