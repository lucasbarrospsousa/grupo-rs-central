"""Offline queue tests: temporary databases and mocked transport, never SMS."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("gateway", Path(__file__).parents[1] / "tools/sms_gateway_service.py")
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)

class QueueTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.temp.name) / "queue.sqlite")
        self.db = g.connect(self.path)
        self.db.execute("INSERT INTO config VALUES(1,?)", (json.dumps({"url":"https://192.168.1.2:8743","fingerprint":"a"*64,"protected_token":"test"}),))
        self.db.commit()
        self.crypto = patch.object(g,"protect",return_value="test-token")
        self.crypto.start()
        self.clock = patch.object(g.time,"time",return_value=10000)
        self.clock.start()

    def tearDown(self):
        self.clock.stop();self.crypto.stop();self.db.close();self.temp.cleanup()

    def enqueue(self):
        return g.operate(self.db,"enqueue",{"serial":"024000001","phone":"+5599999999999","command":"ST300NTW;024000001;TEST;#","status_snapshot":"Estoque"})["job"]

    def test_expiry_persists_after_restart(self):
        job=self.enqueue();self.db.close();self.db=g.connect(self.path)
        self.assertEqual(g.row_get(self.db,job["id"])["payload"]["expires_at"],17200)
        with patch.object(g.time,"time",return_value=17200):
            self.assertIsNone(g.operate(self.db,"pending",{})["job"])
        self.assertEqual(g.row_get(self.db,job["id"])["state"],"expired")

    def test_duplicate_active_is_blocked(self):
        self.enqueue()
        with self.assertRaises(AssertionError):self.enqueue()

    def test_local_cancel_never_transmits(self):
        job=self.enqueue()
        with patch.object(g,"request_remote") as transport:
            self.assertEqual(g.operate(self.db,"cancel",{"id":job["id"]})["job"]["state"],"cancelled")
            transport.assert_not_called()

    def test_first_transmission_requires_revalidation(self):
        job=self.enqueue()
        with patch.object(g,"request_remote",return_value=(404,{})) as transport:
            self.assertTrue(g.operate(self.db,"reconcile",{"id":job["id"]})["needs_validation"])
            self.assertEqual(transport.call_count,1)

    def test_lost_put_response_reconciles_without_resending(self):
        job=self.enqueue();remote=dict(job["payload"],state="received",detail="")
        with patch.object(g,"request_remote",side_effect=[(404,{}),TimeoutError()]):
            self.assertFalse(g.operate(self.db,"reconcile",{"id":job["id"],"validated":True})["ok"])
        self.assertEqual(g.row_get(self.db,job["id"])["attempted"],1)
        with patch.object(g,"request_remote",return_value=(200,remote)) as transport:
            self.assertEqual(g.operate(self.db,"reconcile",{"id":job["id"]})["job"]["state"],"received")
            self.assertEqual(transport.call_count,1)
            self.assertEqual(transport.call_args.args[1],"GET")

    def test_remote_disappearance_is_indeterminate(self):
        job=self.enqueue();self.db.execute("UPDATE jobs SET remote_seen=1,attempted=1");self.db.commit()
        with patch.object(g,"request_remote",return_value=(404,{})) as transport:
            result=g.operate(self.db,"reconcile",{"id":job["id"],"validated":True})
            self.assertEqual(result["job"]["state"],"indeterminate")
            self.assertEqual(transport.call_count,1)

    def test_cancel_requires_valid_remote_ack(self):
        job=self.enqueue();self.db.execute("UPDATE jobs SET attempted=1");self.db.commit()
        g.operate(self.db,"cancel",{"id":job["id"]})
        remote=dict(job["payload"],state="received")
        with patch.object(g,"request_remote",side_effect=[(200,remote),(200,{"state":"cancelled"})]):
            result=g.operate(self.db,"reconcile",{"id":job["id"]})
            self.assertFalse(result["ok"])
            self.assertNotEqual(result["job"]["state"],"cancelled")

    def test_pair_different_phone_does_not_rotate_token(self):
        self.enqueue()
        with patch.object(g,"request_remote") as transport:
            with self.assertRaises(AssertionError):g.operate(self.db,"pair",{"url":"https://192.168.1.3","fingerprint":"b"*64,"code":"example"})
            transport.assert_not_called()

    def test_divergent_remote_payload_is_not_accepted(self):
        job=self.enqueue();remote=dict(job["payload"],state="sent",phone="+5511999999999")
        with patch.object(g,"request_remote",return_value=(200,remote)):
            self.assertFalse(g.operate(self.db,"reconcile",{"id":job["id"]})["ok"])
            self.assertEqual(g.row_get(self.db,job["id"])["state"],"waiting_gateway")

if __name__=="__main__":unittest.main(verbosity=2)
