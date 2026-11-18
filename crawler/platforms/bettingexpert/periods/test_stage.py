import unittest
from unittest.mock import patch
from stage import stage
G={'ok':True,'guid':'one','username':'One','scope':'profile-overall','profitUnit':'bettingexpert-points','capturedAt':'2026-11-17T12:00:00Z'}
def bound():return {'global':dict(G),'periods':{'periodCapturedAt':'2026-11-18T02:00:00+00:00','audit':{n:{'reason':None,'picks':3,'profit':'3','stake':'10','yield':'30'} for n in ('3m','6m','12m')}}}
class StageTests(unittest.TestCase):
 def test_missing_anchor_is_unknown(self):
  with patch('stage.bind_periods_to_global',return_value=bound()):
   r=stage(G,[],read_at='2026-11-18T03:00:00Z',evidence_sha256='a'*64)
   self.assertEqual(r['global'],G);self.assertEqual(r['periods']['periodCapturedAt'],'2026-11-18T02:00:00+00:00');self.assertTrue(all(w['yield'] is None for w in r['periods']['audit'].values()))
 def test_only_reconciled_window_survives(self):
  b=bound();gate={'windows':b['periods']['audit'],'reconciliation':{'3m':{'ledger_closed_count':3}}}
  with patch('stage.bind_periods_to_global',return_value=b),patch('stage.anchored_windows',return_value=gate):
   r=stage(G,[],read_at='2026-11-18T03:00:00Z',evidence_sha256='a'*64,anchor_request={},anchor_response={},anchor_meta={})
   self.assertEqual(r['periods']['periods']['yield3m'],'30');self.assertIsNone(r['periods']['periods']['yield6m']);self.assertEqual(r['global'],G)
class AnchorIsolationTests(unittest.TestCase):
 def test_missing_12m_start_does_not_mask_3m_or_6m(self):
  from window_anchor_gate import anchored_windows
  from datetime import datetime,timezone
  query='query($a:String,$b:String,$c:String,$d:String){'+''.join(k+':topTipsters(limit:5000,timefrom:$'+k+'){guid username stats{profit tipsCount yield}}' for k in ('a','b','c','d'))+'}'
  req={'query':query,'variables':dict(zip('abcd',['2025-11-01 00:00:00.000000','2026-05-01 00:00:00.000000','2026-08-01 00:00:00.000000','2026-11-01 00:00:00.000000']))}
  stats={'guid':'one','username':'One','stats':{'tipsCount':0,'profit':0}}
  response={'data':{'a':[],'b':[stats],'c':[stats],'d':[stats]}}
  baseline={n:{'reason':'no_closed_sample','picks':None,'profit':None,'stake':None,'yield':None}for n in ('3m','6m','12m')}
  with patch('window_anchor_gate.product_periods',return_value=baseline):
   r=anchored_windows([],user_guid='one',username='One',captured_at='2026-11-18T02:00:00Z',read_at='2026-11-18T04:00:00Z',anchor_request=req,anchor_response=response,anchor_meta={'status':200,'started_utc':'2026-11-18T03:00:00Z','ended_utc':'2026-11-18T03:01:00Z'})
  self.assertEqual(r['windows']['3m']['reason'],'no_closed_sample');self.assertEqual(r['windows']['6m']['reason'],'no_closed_sample');self.assertEqual(r['windows']['12m']['reason'],'missing_or_wrong_anchor_identity')
if __name__=='__main__':unittest.main()
