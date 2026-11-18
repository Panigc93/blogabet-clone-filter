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
if __name__=='__main__':unittest.main()
