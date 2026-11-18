"""Bounded single-profile collector protocol with injected transport.

No HTTP implementation, no DB dependency. A caller must separately authorize
and supply the transport. Replay CLI/tests do not open the network.
"""
from dataclasses import dataclass
import hashlib,json,math,time,base64
from datetime import datetime,timezone
from be_periods import Page,created,utc
from product_periods import bounds
from product_projection import project

QUERY='query($filters:TipsFilter,$sortBy:[TipsSort2],$limit:Int,$skip:Int){filterTips(language:"en",limit:$limit,skip:$skip,sortBy:$sortBy,filters:$filters){count tips{guid created{date timezone} updated{date timezone} status isWin isDeleted bet{stake profit odds return} match{time{date timezone}} user{guid username stats{profit yield tipsCount}}}}}'

@dataclass(frozen=True)
class Response:
    status:int
    body:bytes
    headers:dict

@dataclass(frozen=True)
class Config:
    page_size:int=50
    overlap:int=10
    max_pages:int=4
    max_requests:int=7
    delay_seconds:float=11
    max_rows:int=170

class Stop(Exception):pass

def digest(value):return hashlib.sha256(value).hexdigest()
def encoded(v):return json.dumps(v,sort_keys=True,separators=(',',':'),allow_nan=False).encode()

class Collector:
    """One instance owns one budget and one run. No retries or parallelism.

    Transport: callable(request_envelope)->Response. It must perform one read
    only, obey the caller's request timeout and never internally retry. Clock
    and sleeper injection are for deterministic replay, not production pacing.
    A live orchestrator must additionally serialize this with any other source
    work; this protocol cannot coordinate independently launched collectors.
    """
    def __init__(self,transport,config=Config(),*,monotonic=time.monotonic,sleep=time.sleep,now=lambda:datetime.now(timezone.utc)):
        if (not 1<=config.page_size<=100 or not 0<config.overlap<config.page_size or not 1<=config.max_pages<=10
          or not 1<=config.max_requests<=12 or not math.isfinite(config.delay_seconds) or config.delay_seconds<10 or not 1<=config.max_rows<=1000):
            raise ValueError('invalid_config')
        self.transport=transport;self.config=config;self.mono=monotonic;self.sleep=sleep;self.now=now
        self.used=False;self.receipts=[];self.last_end=None;self.stopped=False

    def request(self,user,skip):
        if self.stopped:raise Stop('already_stopped')
        if len(self.receipts)>=self.config.max_requests:raise Stop('request_cap')
        if self.now().astimezone(timezone.utc).strftime('%Y-%m')!=self.source_month:raise Stop('month_boundary_crossed')
        if self.last_end is not None:
            wait=self.config.delay_seconds-(self.mono()-self.last_end)
            if wait>0:self.sleep(wait)
            if self.mono()-self.last_end<self.config.delay_seconds:raise Stop('pacing_clock_failed')
        if self.now().astimezone(timezone.utc).strftime('%Y-%m')!=self.source_month:raise Stop('month_boundary_crossed')
        req={'query':QUERY,'variables':{'filters':{'languages':[],'allSports':True,'active':False,'showDeleted':False,'user':user},'sortBy':[{'field':'CREATEDDATE','order':'DESC'}],'limit':self.config.page_size,'skip':skip}}
        started=self.now().astimezone(timezone.utc).isoformat()
        receipt={'request':req,'request_sha256':digest(encoded(req)),'started_utc':started}
        self.receipts.append(receipt) # Failed requests also consume the cap.
        try:r=self.transport(req)
        except Exception as e:
            receipt.update(error='transport_failed',ended_utc=self.now().astimezone(timezone.utc).isoformat())
            self.last_end=self.mono();self.stopped=True;raise Stop('transport_failed') from e
        self.last_end=self.mono()
        receipt.update(ended_utc=self.now().astimezone(timezone.utc).isoformat(),status=r.status,headers=r.headers,raw_base64=base64.b64encode(r.body).decode('ascii'),raw_utf8=r.body.decode('utf-8',errors='replace'),response_sha256=digest(r.body))
        if r.status in (401,403,429):self.stopped=True;raise Stop('access_or_limit_stop')
        if r.status!=200:self.stopped=True;raise Stop('http_failure_stop')
        try:d=json.loads(r.body)
        except (ValueError,TypeError):self.stopped=True;raise Stop('invalid_json_stop')
        if not isinstance(d,dict) or d.get('errors'):self.stopped=True;raise Stop('graphql_or_access_error_stop')
        try:
            ft=d['data']['filterTips'];count=ft['count'];tips=ft['tips']
            if type(count) is not int or count<0 or not isinstance(tips,list) or len(tips)>self.config.page_size:raise ValueError()
            if any(not isinstance(t,dict) or not isinstance(t.get('guid'),str) or not t['guid'] for t in tips):raise ValueError()
        except (KeyError,TypeError,ValueError):self.stopped=True;raise Stop('malformed_page_stop')
        return ft,receipt['ended_utc']

    def collect(self,*,user_guid,read_at):
        if self.used:raise ValueError('single_run_instance')
        self.used=True
        if not isinstance(user_guid,str) or not user_guid:raise ValueError('missing_user')
        utc(read_at) # explicit source-month anchor
        if utc(read_at)>self.now().astimezone(timezone.utc):raise ValueError('future_read_anchor')
        self.source_month=utc(read_at).strftime('%Y-%m')
        cuts,end=bounds(read_at);oldest_cut=utc(cuts['12m'])
        pages=[];skip=0;reason=None
        try:
            for n in range(self.config.max_pages):
                ft,at=self.request(user_guid,skip)
                if pages:
                    repeated,repeat_at=self.request(user_guid,skip)
                    if encoded(ft)!=encoded(repeated):raise Stop('mutable_repeat')
                    at=repeat_at
                page=Page(skip,self.config.page_size,ft['count'],ft['tips'],at,bool(pages));pages.append(page)
                # Use reader as fail-closed boundary validator before another call.
                cap=self.now().astimezone(timezone.utc).isoformat()
                out=project(pages,user_guid=user_guid,captured_at=cap,read_at=cap,max_pages=self.config.max_pages)
                structural={'mutable_count','mutable_overlap','duplicate_guid_in_page','duplicate_guid_across_pages','unsorted_dates','unsorted_merged_dates','wrong_user','boundary_date_tie','count_underflow','malformed_evidence'}
                found={x['reason'] for x in out['audit'].values()}&structural
                if found:raise Stop(sorted(found)[0])
                observed=skip+len(ft['tips'])
                if observed>self.config.max_rows:raise Stop('row_cap')
                if ft['tips'] and created(ft['tips'][-1])<oldest_cut:break
                if len(ft['tips'])<self.config.page_size:break
                new_skip=skip+len(ft['tips'])-self.config.overlap
                if new_skip<=skip:raise Stop('no_progress')
                if new_skip+self.config.page_size>self.config.max_rows:raise Stop('row_cap')
                skip=new_skip
            else:reason='page_cap'
        except (Stop,ValueError,KeyError,TypeError) as e:
            reason=str(e) if isinstance(e,(Stop,ValueError)) else 'malformed_evidence'
        cap=self.now().astimezone(timezone.utc).isoformat()
        # Month crossing invalidates a run instead of changing its window basis.
        source_month=utc(read_at).strftime('%Y-%m')
        if utc(cap).strftime('%Y-%m')!=source_month:reason='month_boundary_crossed'
        out=project(pages,user_guid=user_guid,captured_at=cap,read_at=cap,max_pages=self.config.max_pages)
        # Limits retain independently complete shorter windows. Every integrity,
        # transport or access failure holds all values, including earlier pages.
        if reason and reason not in ('request_cap','page_cap','row_cap'):
            for v in out['audit'].values():
                for key in ('picks','profit','stake','yield'):v[key]=None
                v['reason']=reason
            out['periods']={k:None for k in out['periods']}
        return {'version':1,'status':'stopped' if reason else 'captured','stop_reason':reason,'requests':len(self.receipts),'source_month':source_month,'pages':[vars(p) for p in pages],'projection':out,'receipts':self.receipts,'productionReady':False}
