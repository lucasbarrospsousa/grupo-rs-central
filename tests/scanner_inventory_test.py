import sys, tempfile, unittest, time, uuid, sqlite3, hashlib
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import scanner_inventory_service as s

class ScannerInventoryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.db=s.connect(str(Path(self.temp.name)/'scanner.sqlite'))
        self.row={'version':1,'id':str(uuid.uuid4()),'branch':'imperatriz','kind':'equipment','number':'024000123','created_at':int(time.time())}
    def tearDown(self):self.db.close();self.temp.cleanup()
    def add(self, rows):
        for row in rows:s.register(self.db, {'kind':row['kind'],'number':row['number']})
    def test_manual_numbers_and_duplicates(self):
        self.add([self.row])
        with self.assertRaises(ValueError):self.add([self.row])
        self.assertEqual(s.operate(self.db,'list',{})['rows'][0]['number'],'024000123')
        self.add([dict(self.row,kind='chip',number='89553000000000000123')])
        self.assertEqual(s.operate(self.db,'list',{'kind':'chip'})['total'],1)
    def test_invalid_values_and_retired_operations(self):
        for kind,number in [('equipment','860001024000123'),('equipment',24000123),('chip','123'),('chip','89 553000000000000123'),('other','024000123')]:
            with self.assertRaises(ValueError):s.operate(self.db,'register',{'kind':kind,'number':number})
        for op in ['sync','pair','address','config']:
            with self.assertRaises(ValueError):s.operate(self.db,op,{})
        self.assertEqual(s.operate(self.db,'list',{})['total'],0)
    def shipment(self, **changes):
        value={'id':str(uuid.uuid4()),'mode':'base','destination':'maraba','note':'Teste fictício',
               'items':[{'kind':'equipment','number':self.row['number']}]}
        return dict(value,**changes)
    def test_dispatch_retry_preserves_one_movement_and_intake_retry_never_reopens_it(self):
        self.add([self.row]);request=self.shipment()
        self.assertFalse(s.operate(self.db,'dispatch',request)['repeated'])
        self.assertTrue(s.operate(self.db,'dispatch',request)['repeated'])
        with self.assertRaises(ValueError):self.add([self.row])
        self.assertEqual(s.operate(self.db,'list',{})['total'],0)
        history=s.operate(self.db,'list',{'kind':'movements'})
        self.assertEqual(history['total'],1);self.assertEqual(history['rows'][0]['destination'],'Marabá')
        self.assertEqual(history['counts']['sent_today'],1)
        with self.assertRaises(ValueError):s.operate(self.db,'dispatch',dict(request,destination='imperatriz'))
    def test_mixed_selection_rolls_back_if_one_item_was_already_sent(self):
        chip=dict(self.row,id=str(uuid.uuid4()),kind='chip',number='89553000000000000123')
        self.add([self.row,chip]);s.operate(self.db,'dispatch',self.shipment())
        with self.assertRaises(ValueError):s.operate(self.db,'dispatch',self.shipment(items=[{'kind':chip['kind'],'number':chip['number']},{'kind':'equipment','number':self.row['number']}]))
        self.assertEqual(s.operate(self.db,'list',{'kind':'chip'})['total'],1)
    def test_free_destination_validation_and_mixed_dispatch(self):
        chip=dict(self.row,id=str(uuid.uuid4()),kind='chip',number='89553000000000000123')
        self.add([self.row,chip])
        with self.assertRaises(ValueError):s.operate(self.db,'dispatch',self.shipment(mode='custom',destination='  '))
        with self.assertRaises(ValueError):s.operate(self.db,'dispatch',self.shipment(destination='unknown'))
        request=self.shipment(mode='custom',destination='Laboratório fictício',items=[{'kind':r['kind'],'number':r['number']} for r in [self.row,chip]])
        self.assertEqual(s.operate(self.db,'dispatch',request)['sent'],2)
        self.assertEqual(s.operate(self.db,'list',{'kind':'movements'})['total'],2)
    def test_existing_schema_and_receipts_are_preserved(self):
        self.add([self.row])
        self.db.execute('INSERT INTO receipts VALUES(?,?,?)',('legacy','old-id','old-payload'));self.db.commit();self.db.close()
        self.db=s.connect(str(Path(self.temp.name)/'scanner.sqlite'))
        self.assertEqual(s.operate(self.db,'list',{})['total'],1)
        with self.assertRaises(ValueError):self.add([self.row])
        self.assertEqual(self.db.execute('SELECT payload FROM receipts').fetchone()[0],'old-payload')


class ChipUsageTests(unittest.TestCase):
    shipment=ScannerInventoryTests.shipment
    add=ScannerInventoryTests.add
    def setUp(self):
        ScannerInventoryTests.setUp(self)
        self.source=Path(self.temp.name)/'operational.sqlite'
        self.op=sqlite3.connect(self.source)
        self.op.execute('CREATE TABLE devices(branch_id TEXT,sku TEXT,iccid TEXT,updated_at TEXT)')
        self.op.commit()
        self.chip='89553000000000000123'
        self.add([dict(self.row,kind='chip',number=self.chip)])
    def tearDown(self):self.op.close();ScannerInventoryTests.tearDown(self)
    def registration(self,branch='imperatriz',serial='024000555',number=None):
        self.op.execute('INSERT INTO devices VALUES(?,?,?,?)',(branch,serial,number or self.chip,'2026-09-21 15:00:00'));self.op.commit()
    def test_exact_committed_match_and_repeat_without_source_writes(self):
        self.registration('backups_araguaina')
        before=hashlib.sha256(self.source.read_bytes()).hexdigest()
        result=s.reconcile_usage(self.db,self.source);self.assertEqual(result['used'],1)
        self.assertEqual(s.reconcile_usage(self.db,self.source)['used'],0)
        self.assertEqual(s.operate(self.db,'list',{'kind':'chip'})['total'],0)
        row=s.operate(self.db,'list',{'kind':'chip','state':'used'})['rows'][0]
        self.assertEqual((row['device_serial'],row['used_branch']),('024000555','Araguaína'))
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(),before)
        with self.assertRaises(ValueError):s.operate(self.db,'dispatch',self.shipment(items=[{'kind':'chip','number':self.chip}]))
    def test_sent_chip_becomes_used_preserving_shipment(self):
        s.operate(self.db,'dispatch',self.shipment(items=[{'kind':'chip','number':self.chip}]))
        self.registration('backups_maraba');s.reconcile_usage(self.db,self.source)
        row=s.operate(self.db,'list',{'kind':'movements'})['rows'][0]
        self.assertEqual(row['state'],'used');self.assertEqual(row['destination'],'Marabá')
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM movements').fetchone()[0],1)
    def test_missing_corrupt_source_does_not_remove_chip(self):
        missing=Path(self.temp.name)/'missing.sqlite'
        self.assertFalse(s.reconcile_usage(self.db,missing)['ok']);self.assertFalse(missing.exists())
        corrupt=Path(self.temp.name)/'corrupt.sqlite';corrupt.write_text('not a database')
        self.assertFalse(s.reconcile_usage(self.db,corrupt)['ok'])
        self.assertEqual(s.operate(self.db,'list',{'kind':'chip'})['total'],1)
    def test_ambiguous_unknown_and_invalid_serial_do_not_confirm(self):
        self.registration();self.registration('backups_maraba','024000666')
        self.assertEqual(s.reconcile_usage(self.db,self.source)['ambiguous'],1)
        self.op.execute('DELETE FROM devices');self.op.commit();self.registration('unknown')
        self.assertEqual(s.reconcile_usage(self.db,self.source)['used'],0)
        self.op.execute('DELETE FROM devices');self.op.commit();self.registration(serial='860001024000555')
        self.assertEqual(s.reconcile_usage(self.db,self.source)['used'],0)
    def test_uncommitted_or_partial_iccid_never_counts(self):
        self.registration(number=self.chip[:-1])
        self.op.execute('INSERT INTO devices VALUES(?,?,?,?)',('imperatriz','024000555',self.chip,''))
        self.assertEqual(s.reconcile_usage(self.db,self.source)['used'],0)
        self.op.commit();self.assertEqual(s.reconcile_usage(self.db,self.source)['used'],1)
    def test_all_four_partitions_and_use_is_not_reverted(self):
        for branch in ['imperatriz','backups_araguaina','backups_acailandia','backups_maraba']:
            with self.subTest(branch=branch):
                self.op.execute('DELETE FROM devices');self.op.commit()
                self.db.execute('DELETE FROM chip_usage');self.db.commit()
                self.registration(branch)
                self.assertEqual(s.reconcile_usage(self.db,self.source)['used'],1)
        self.op.execute('DELETE FROM devices');self.op.commit()
        s.reconcile_usage(self.db,self.source)
        self.assertEqual(s.operate(self.db,'list',{'kind':'chip','state':'used'})['total'],1)

if __name__=='__main__':unittest.main()
