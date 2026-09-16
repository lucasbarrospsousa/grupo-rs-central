import importlib.util
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('service', pathlib.Path(__file__).parents[1]/'tools/local_sqlite_service.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)

class ContactSyncTest(unittest.TestCase):
    def test_targeted_update(self):
        with tempfile.TemporaryDirectory() as folder:
            con=service.connect(pathlib.Path(folder)/'test.sqlite')
            original={'sku':'024000001','imei':'024000001','plate':'TEST001','tracker_status':'Instalado','stock':0,'chip_phone':'','chip_number':'8955000000000000001','note':'preserve'}
            for branch in ['imperatriz','maraba']:service.upsert_device(con,branch,original)
            args=(con,'imperatriz','024000001','024000001','11999999999','8955000000000000002')
            result=service.update_chip_contact(*args)
            self.assertTrue(result['ok'] and result['changed'])
            self.assertEqual(result['product']['chip_phone'],'11999999999')
            self.assertEqual(result['product']['chip_number'],'8955000000000000002')
            for key in ['plate','tracker_status','stock','note']:self.assertEqual(result['product'][key],original[key])
            self.assertEqual(service.get_device(con,'maraba','024000001')['product'],original)
            self.assertFalse(service.update_chip_contact(*args)['changed'])
            self.assertFalse(service.update_chip_contact(con,'imperatriz','024000001','024000002',args[-2],args[-1])['ok'])
            self.assertFalse(service.update_chip_contact(con,'imperatriz','024000001','024000001','',args[-1])['ok'])
            self.assertTrue(service.valid(con))
            con.close()

if __name__=='__main__':unittest.main()
