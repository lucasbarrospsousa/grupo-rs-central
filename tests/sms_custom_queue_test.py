from sms_gateway_queue_test import QueueTests,g
import unittest

class CustomTests(QueueTests):
    def custom(self):
        return {'version':2,'serial':'024000001','phone':'+5521999999999','command':'reset,123456','status_snapshot':'Estoque','command_mode':'custom','source_phone_snapshot':'+5511999999999','apn_snapshot':'hinova.br','standard_command_snapshot':'ST300NTW;024000001;TEST;#'}
    def test_custom_persists_verbatim_and_source(self):
        p=self.custom();job=g.operate(self.db,'enqueue',p)['job']
        self.assertEqual(job['payload']['command'],'reset,123456')
        self.assertNotEqual(job['payload']['phone'],job['payload']['source_phone_snapshot'])
        self.assertEqual(job['payload']['version'],2)
    def test_custom_bad_input_rejected(self):
        for value in ['', '  ', 'a'*161, 'reset\n123456', 'á']:
            p=self.custom();p['command']=value
            with self.assertRaises(AssertionError):g.operate(self.db,'enqueue',p)
    def test_standard_cannot_override_recipient_or_command(self):
        p=self.custom();p['command_mode']='standard'
        with self.assertRaises(AssertionError):g.operate(self.db,'enqueue',p)
        p['command']=p['standard_command_snapshot']
        with self.assertRaises(AssertionError):g.operate(self.db,'enqueue',p)
        p['phone']=p['source_phone_snapshot']
        self.assertTrue(g.operate(self.db,'enqueue',p)['ok'])
    def test_original_confirmation_deadline(self):
        p=self.custom();p['confirmed_at']=9900
        self.assertEqual(g.operate(self.db,'enqueue',p)['job']['payload']['expires_at'],17100)

if __name__=='__main__':unittest.main(verbosity=2)
