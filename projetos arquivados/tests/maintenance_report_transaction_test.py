"""Synthetic SQLite only: no operational database or network."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('sqlite_service', Path(__file__).parents[1] / 'tools/local_sqlite_service.py')
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)

class ReportTransactionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.con = db.connect(Path(self.tmp.name) / 'test.sqlite')
        db.upsert_device(self.con, 'imperatriz', {'sku': 'demo', 'serial': '024000102', 'status': 'Estoque', 'tracker_status': 'Estoque', 'stock': 1, 'active': True, 'plate': 'GRS - 001'})
        self.item = dict(id='visit-demo', client='Cliente fictício', serial='024000101', plate='DEM1A23', reason='Troca de aparelho', discovery_method='App de rastreamento', replacement_serial='024000102', status='concluido', created_at=db.now(), visit_version=2)

    def tearDown(self):
        self.con.close()
        self.tmp.cleanup()

    def test_save_repeat_edit_and_second_visit(self):
        self.assertTrue(db.save_visit(self.con, 'imperatriz', self.item)['ok'])
        self.assertTrue(db.save_visit(self.con, 'imperatriz', self.item)['ok'])
        snapshot = db.load(self.con, 'imperatriz')
        self.assertEqual(len(snapshot['movements']), 1)
        self.assertEqual(len(snapshot['maintenances']), 1)
        self.assertEqual(snapshot['products'][0]['stock'], 0)
        self.assertEqual(snapshot['products'][0]['vehicle_plate'], 'DEM1A23')
        self.assertFalse(db.save_visit(self.con, 'imperatriz', dict(self.item, id='other'))['ok'])
        self.assertFalse(db.save_visit(self.con, 'imperatriz', dict(self.item, replacement_serial='024000103'))['ok'])
        self.assertFalse(db.save_visit(self.con, 'imperatriz', dict(self.item, reason='Sem comunicação'))['ok'])

    def test_rollback_if_report_insert_fails(self):
        self.con.execute("CREATE TRIGGER reject_report BEFORE INSERT ON maintenance BEGIN SELECT RAISE(ABORT, 'simulated'); END")
        with self.assertRaises(Exception):
            db.save_visit(self.con, 'imperatriz', self.item)
        snapshot = db.load(self.con, 'imperatriz')
        self.assertEqual(snapshot['products'][0]['stock'], 1)
        self.assertEqual(snapshot['movements'], [])
        self.assertEqual(snapshot['maintenances'], [])

    def test_simple_report_and_invalid_inputs(self):
        self.assertFalse(db.save_visit(self.con, 'imperatriz', dict(self.item, discovery_method=''))['ok'])
        self.assertFalse(db.save_visit(self.con, 'imperatriz', dict(self.item, replacement_serial='024000101'))['ok'])
        self.assertFalse(db.save_visit(self.con, 'other_branch', self.item)['ok'])
        self.assertTrue(db.save_visit(self.con, 'imperatriz', dict(self.item, reason='Sem comunicação'))['ok'])
        self.assertEqual(db.load(self.con, 'imperatriz')['products'][0]['stock'], 1)
        self.assertEqual(db.load(self.con, 'imperatriz')['maintenances'][0]['replacement_serial'], '')

if __name__ == '__main__':
    unittest.main()
