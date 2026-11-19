"""Offline staging only: bind reviewed V7 gates to verified global identity.
No HTTP, database, source expansion, scheduling or automatic write adapter.
The caller must supply retained evidence through the private source workflow,
never client payload. Digests identify evidence bytes, not source authority.
"""
import hashlib,json
from decimal import Decimal
from be_periods import Page,utc
from window_anchor_gate import anchored_windows
from global_compat import bind_periods_to_global

def stage(global_row, pages, *, read_at, anchor_request=None,anchor_response=None,anchor_meta=None, evidence_sha256):
    if len(evidence_sha256)!=64 or any(c not in '0123456789abcdef' for c in evidence_sha256):raise ValueError('invalid_evidence_digest')
    bound=bind_periods_to_global(global_row,pages,read_at=read_at,max_pages=10)
    period=bound['periods'];cap=period['periodCapturedAt']
    if all(x is not None for x in (anchor_request,anchor_response,anchor_meta)):
        gate=anchored_windows(pages,user_guid=global_row['guid'],username=global_row['username'],captured_at=cap,read_at=read_at,anchor_request=anchor_request,anchor_response=anchor_response,anchor_meta=anchor_meta,max_pages=10)
        windows=gate['windows'];receipts=gate['reconciliation']
    else:
        windows=period['audit'];receipts={}
    # Staging is stricter than the default calculator: a compatible official
    # count/profit anchor receipt is mandatory for every nonnull product value.
    for n,w in windows.items():
        if w['reason'] is None and n not in receipts:
            w.update(picks=None,profit=None,stake=None,reason='missing_independent_window_anchor',**{'yield':None})
    period.update(audit=windows,periods={f'yield{n}':windows[n]['yield'] for n in ('3m','6m','12m')},windowReconciliation=receipts,evidenceSha256=evidence_sha256)
    six=windows['6m'];period['periods']['picks6mAvg']=str(Decimal(six['picks'])/6) if six['reason'] is None else None
    return bound

def stage_files(global_row,pages_path,request_path,response_path,meta_path,*,read_at):
    paths=[pages_path,request_path,response_path,meta_path];raw=[p.read_bytes() for p in paths]
    pages=[Page(**x) for x in json.loads(raw[0])];meta=json.loads(raw[3])
    if hashlib.sha256(raw[2]).hexdigest()!=meta.get('sha256'):raise ValueError('anchor_evidence_hash_mismatch')
    # Stable length-prefixed bundle digest, not ambiguous concatenation.
    h=hashlib.sha256()
    for b in raw:h.update(len(b).to_bytes(8,'big'));h.update(b)
    return stage(global_row,pages,read_at=read_at,anchor_request=json.loads(raw[1]),anchor_response=json.loads(raw[2]),anchor_meta=meta,evidence_sha256=h.hexdigest())
