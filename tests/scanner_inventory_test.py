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
    def test_retry_and_different_read_of_same_number_do_not_duplicate(self):
        self.assertEqual(s.accept(self.db,'source',[self.row]),1)
        self.assertEqual(s.accept(self.db,'source',[self.row]),0)
        self.assertEqual(s.accept(self.db,'source',[dict(self.row,id=str(uuid.uuid4()))]),0)
        self.assertEqual(s.operate(self.db,'list',{})['rows'][0]['number'],'024000123')
    def test_conflict_rolls_back_entire_batch(self):
        s.accept(self.db,'source',[self.row])
        with self.assertRaises(ValueError):
            s.accept(self.db,'source',[dict(self.row,id=str(uuid.uuid4()),number='024000124'),dict(self.row,number='024000125')])
        self.assertEqual(s.operate(self.db,'list',{})['total'],1)
    def test_types_separate_and_wrong_branch_rejected(self):
        s.accept(self.db,'source',[dict(self.row,kind='chip',number='89553000000000000123')])
        self.assertEqual(s.operate(self.db,'list',{})['total'],0)
        self.assertEqual(s.operate(self.db,'list',{'kind':'chip'})['total'],1)
        with self.assertRaises(ValueError):s.accept(self.db,'source',[dict(self.row,branch='maraba')])
    def test_failed_ack_preserves_saved_item_and_can_retry(self):
        cfg={'fingerprint':'a'*64}
        def remote(config,method,path,payload=None):
            if path=='/readings':return 200,{'service':'rs-scanner','readings':[self.row]}
            self.assertEqual(s.operate(self.db,'list',{})['total'],1)
            raise OSError('offline')
        with patch.object(s,'config',return_value=cfg),patch.object(s,'request_remote',side_effect=remote):
            result=s.operate(self.db,'sync',{})
            self.assertEqual(result['ack_pending'],1)
            self.assertEqual(s.operate(self.db,'sync',{})['added'],0)
    def test_invalid_number_does_not_enter(self):
        with self.assertRaises(ValueError):s.accept(self.db,'source',[dict(self.row,number='860001024000123')])
    def shipment(self, **changes):
        value={'id':str(uuid.uuid4()),'mode':'base','destination':'maraba','note':'Teste fictício',
               'items':[{'kind':'equipment','number':self.row['number']}]}
        return dict(value,**changes)
    def test_dispatch_retry_preserves_one_movement_and_intake_retry_never_reopens_it(self):
        s.accept(self.db,'source',[self.row]);request=self.shipment()
        self.assertFalse(s.operate(self.db,'dispatch',request)['repeated'])
        self.assertTrue(s.operate(self.db,'dispatch',request)['repeated'])
        s.accept(self.db,'source',[self.row])
        self.assertEqual(s.operate(self.db,'list',{})['total'],0)
        history=s.operate(self.db,'list',{'kind':'movements'})
        self.assertEqual(history['total'],1);self.assertEqual(history['rows'][0]['destination'],'Marabá')
        self.assertEqual(history['counts']['sent_today'],1)
        with self.assertRaises(ValueError):s.operate(self.db,'dispatch',dict(request,destination='imperatriz'))
    def test_mixed_selection_rolls_back_if_one_item_was_already_sent(self):
        chip=dict(self.row,id=str(uuid.uuid4()),kind='chip',number='89553000000000000123')
        s.accept(self.db,'source',[self.row,chip]);s.operate(self.db,'dispatch',self.shipment())
        with self.assertRaises(ValueError):s.operate(self.db,'dispatch',self.shipment(items=[{'kind':chip['kind'],'number':chip['number']},{'kind':'equipment','number':self.row['number']}]))
        self.assertEqual(s.operate(self.db,'list',{'kind':'chip'})['total'],1)
    def test_free_destination_validation_and_mixed_dispatch(self):
        chip=dict(self.row,id=str(uuid.uuid4()),kind='chip',number='89553000000000000123')
        s.accept(self.db,'source',[self.row,chip])
        with self.assertRaises(ValueError):s.operate(self.db,'dispatch',self.shipment(mode='custom',destination='  '))
        with self.assertRaises(ValueError):s.operate(self.db,'dispatch',self.shipment(destination='unknown'))
        request=self.shipment(mode='custom',destination='Laboratório fictício',items=[{'kind':r['kind'],'number':r['number']} for r in [self.row,chip]])
        self.assertEqual(s.operate(self.db,'dispatch',request)['sent'],2)
        self.assertEqual(s.operate(self.db,'list',{'kind':'movements'})['total'],2)
    def test_existing_schema_and_receipts_are_preserved(self):
        s.accept(self.db,'source',[self.row]);self.db.close()
        self.db=s.connect(str(Path(self.temp.name)/'scanner.sqlite'))
        self.assertEqual(s.operate(self.db,'list',{})['total'],1)
        self.assertEqual(s.accept(self.db,'source',[self.row]),0)


class ChipUsageTests(unittest.TestCase):
    shipment=ScannerInventoryTests.shipment
    def setUp(self):
        ScannerInventoryTests.setUp(self)
        self.source=Path(self.temp.name)/'operational.sqlite'
        self.op=sqlite3.connect(self.source)
        self.op.execute('CREATE TABLE devices(branch_id TEXT,sku TEXT,iccid TEXT,updated_at TEXT)')
        self.op.commit()
        self.chip='89553000000000000123'
        s.accept(self.db,'source',[dict(self.row,kind='chip',number=self.chip)])
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
