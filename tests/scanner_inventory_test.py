import sys, tempfile, unittest, time, uuid
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

if __name__=='__main__':unittest.main()
