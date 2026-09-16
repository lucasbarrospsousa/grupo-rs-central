import sms_gateway_queue_test as queue_tests
g=queue_tests.g
from unittest.mock import patch
import unittest

class AckTests(queue_tests.QueueTests):
 def test_sent_ack_persists_and_delivered_does_not_renew_expiry(self):
  job=self.enqueue();remote=dict(job['payload'],state='sent',updated_at=10000)
  with patch.object(g,'request_remote',return_value=(200,remote)):
   result=g.operate(self.db,'reconcile',{'id':job['id']})['job']
  self.assertEqual(result['acknowledgements'][0]['remote_at'],10000)
  with patch.object(g,'request_remote',return_value=(200,dict(remote,state='delivered'))) as transport:
   g.operate(self.db,'refresh_delivery',{})
   self.assertEqual(transport.call_args.args[1],'GET')
  self.db.close();self.db=g.connect(self.path)
  result=g.row_get(self.db,job['id'])
  self.assertEqual(result['state'],'delivered');self.assertEqual(result['payload']['expires_at'],17200)
  self.assertEqual(len(result['acknowledgements']),2)

 def test_indeterminate_can_receive_late_ack_without_resending(self):
  job=self.enqueue();g.state(self.db,job['id'],'indeterminate')
  with patch.object(g,'request_remote',return_value=(200,dict(job['payload'],state='sent'))) as transport:
   g.operate(self.db,'refresh_delivery',{})
   self.assertEqual(transport.call_args.args[1],'GET')
  self.assertEqual(g.row_get(self.db,job['id'])['state'],'sent')

 def test_sent_not_downgraded_and_divergent_delivery_rejected(self):
  job=self.enqueue();g.state(self.db,job['id'],'sent')
  for remote in [dict(job['payload'],state='received'),dict(job['payload'],state='delivered',phone='+5521999999999')]:
   with patch.object(g,'request_remote',return_value=(200,remote)):
    g.operate(self.db,'refresh_delivery',{})
   self.assertEqual(g.row_get(self.db,job['id'])['state'],'sent')

 def test_health_does_not_expose_credentials_or_send(self):
  with patch.object(g,'request_remote',return_value=(200,{'version':1,'send_enabled':False,'token':'must-not-leak'})) as transport:
   result=g.operate(self.db,'health',{})
   self.assertNotIn('token',result['health']);self.assertFalse(result['health']['send_enabled'])
   self.assertEqual(transport.call_args.args[1],'GET')

if __name__=='__main__':unittest.main(verbosity=2)
