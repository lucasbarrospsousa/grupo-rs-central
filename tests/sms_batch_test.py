import sms_gateway_queue_test as base
from unittest.mock import patch
import unittest
g=base.g

class BatchTests(base.QueueTests):
 def rows(self,count=2):
  rows=[]
  for i in range(count):
   serial=f'024{i:06d}';phone=f'+551199999{i:04d}';group=i%4+1
   command=f'ST300NTW;{serial};319H;0;hinova.br;hinova;hinova;grupors{group}.ddns.net;5940;grupors{group}.ddns.net;5941;#'
   rows.append(dict(version=2,serial=serial,phone=phone,command=command,command_mode='standard',source_phone_snapshot=phone,standard_command_snapshot=command,apn_snapshot='hinova.br',status_snapshot='Estoque',group=group))
  return rows
 def jobs(self):return [g.row_get(self.db,r[0]) for r in self.db.execute('SELECT id FROM jobs ORDER BY rowid')]
 def test_limit_group_and_atomic_validation(self):
  for count in [0,11]:
   with self.assertRaises(AssertionError):g.operate(self.db,'enqueue_batch',{'rows':self.rows(count)})
  rows=self.rows();rows[1]['group']=0
  with self.assertRaises(AssertionError):g.operate(self.db,'enqueue_batch',{'rows':rows})
  self.assertEqual(self.jobs(),[])
  g.operate(self.db,'enqueue_batch',{'rows':self.rows(10)})
  self.assertEqual(len(self.jobs()),10)
 def test_ack_then_sixty_seconds_and_restart(self):
  g.operate(self.db,'enqueue_batch',{'rows':self.rows()});first,second=self.jobs()
  with patch.object(g,'request_remote') as transport:
   self.assertTrue(g.operate(self.db,'reconcile',{'id':second['id'],'validated':True})['batch_wait'])
   transport.assert_not_called()
  g.acknowledge(self.db,first,dict(first['payload'],state='sent',updated_at=10000))
  self.db.close();self.db=g.connect(self.path)
  self.assertNotEqual(g.batch_gate(self.db,second,10059),'')
  self.assertEqual(g.batch_gate(self.db,second,10060),'')
  with patch.object(g.time,'time',return_value=17200):g.operate(self.db,'pending',{})
  self.assertEqual(g.row_get(self.db,second['id'])['state'],'expired')
 def test_failure_pauses_cancel_and_no_single_bypass(self):
  result=g.operate(self.db,'enqueue_batch',{'rows':self.rows()});first,second=self.jobs()
  g.state(self.db,first['id'],'indeterminate')
  self.assertNotEqual(g.batch_gate(self.db,second,12000),'')
  with self.assertRaises(AssertionError):self.enqueue()
  g.operate(self.db,'cancel_batch',{'batch_id':result['batch_id']})
  self.assertEqual(g.row_get(self.db,second['id'])['state'],'cancelled')

if __name__=='__main__':unittest.main()
