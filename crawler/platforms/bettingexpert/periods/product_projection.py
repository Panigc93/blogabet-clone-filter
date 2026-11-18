"""Product-shaped projection only. Does not write the product or its DB."""
from decimal import Decimal
from product_periods import product_periods

def project(pages, *, user_guid, captured_at, read_at, max_pages=10):
    windows=product_periods(pages,user_guid=user_guid,captured_at=captured_at,read_at=read_at,max_pages=max_pages)
    values={f'yield{n}m':windows[f'{n}m']['yield'] for n in (3,6,12)}
    six=windows['6m']
    values['picks6mAvg']=str(Decimal(six['picks'])/6) if six['picks'] is not None and six['reason'] is None else None
    return {'user_guid':user_guid,'capturedAt':captured_at,'readAt':read_at,'periods':values,'audit':windows,
            'allTimePatch':None,'productionReady':False,'basis':'published-UTC-source-net-profit-over-advised-stake-closed-months',
            'unverified':['VOID','ACTIVE','UNUSED','half-loss','deletions','deep-offset-stability','equal-created-tiebreaker','catalog-completeness'],
            'isWinValidated':False}
