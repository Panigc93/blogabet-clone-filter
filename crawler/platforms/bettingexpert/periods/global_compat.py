"""Join identities only, never merge performance scopes or capture timestamps."""
from be_periods import utc
from product_projection import project

def bind_periods_to_global(global_row,pages,*,read_at,max_pages=10):
    if (not isinstance(global_row,dict) or global_row.get('ok') is not True
       or global_row.get('scope')!='profile-overall' or global_row.get('profitUnit')!='bettingexpert-points'
       or not isinstance(global_row.get('guid'),str) or not isinstance(global_row.get('username'),str)
       or not global_row['guid'] or not global_row['username'].strip()):
        raise ValueError('unverified_global_identity')
    guid=global_row['guid'];username=global_row['username']
    utc(global_row['capturedAt'])
    if not pages:raise ValueError('missing_period_response_times')
    for page in pages:
        for tip in page.tips:
            if tip.get('user',{}).get('guid')!=guid or tip.get('user',{}).get('username')!=username:
                raise ValueError('period_identity_mismatch')
    # Period capture derives only from period response timestamps, not global.
    captured=max(utc(page.captured_at) for page in pages).isoformat()
    candidate=project(pages,user_guid=guid,captured_at=captured,read_at=read_at,max_pages=max_pages)
    candidate.update(username=username,profitUnit='bettingexpert-points',scope='published-closed-window',
                     yieldBasis='source-net-profit-over-advised-stake',periodCapturedAt=captured)
    return {'version':1,'identity':{'guid':guid,'username':username},
            'global':dict(global_row), # untouched, including original capturedAt
            'periods':candidate,'productionReady':False,
            'captureScopesSeparate':True}
