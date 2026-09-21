"""Authorized USB integration only; requires ScannerBridgeDeviceTest APK installed.
All rows, databases and pairing identities used by this test are synthetic.
"""
import argparse, subprocess, queue, threading, tempfile, sys, time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import scanner_inventory_service as s
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--adb',default='adb');parser.add_argument('--serial',required=True)
args=parser.parse_args()
base=[args.adb,'-s',args.serial]
existing=subprocess.check_output(base+['forward','--list'],text=True)
if 'tcp:18843' in existing:raise RuntimeError('Port 18843 is already forwarded; preserve the existing task')
subprocess.run(base+['forward','tcp:18843','tcp:18843'],check=True,capture_output=True)
process=None
try:
    process=subprocess.Popen(base+['shell','am','instrument','-w','-r','-e','class','br.com.grupors.scanner.data.ScannerBridgeDeviceTest','br.com.grupors.scanner.test/androidx.test.runner.AndroidJUnitRunner'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace')
    messages=queue.Queue()
    def read():
        for line in process.stdout:messages.put(line)
    threading.Thread(target=read,daemon=True).start()
    values={};deadline=time.monotonic()+100
    def next_line():
        return messages.get(timeout=max(1,deadline-time.monotonic()))
    while len(values)<2:
        line=next_line()
        for key in ('fixture_pin','fixture_code'):
            if line.startswith('INSTRUMENTATION_STATUS: '+key+'='):values[key]=line.strip().split('=',1)[1]
        if 'FAILURES' in line or 'INSTRUMENTATION_FAILED' in line:raise RuntimeError('Device fixture failed')
    with tempfile.TemporaryDirectory(prefix='armazem-usb-') as folder:
        db=s.connect(str(Path(folder)/'isolated.sqlite'))
        cfg={'url':'https://127.0.0.1:18843','fingerprint':values['fixture_pin'],'code':values['fixture_code']}
        try:s.operate(db,'pair',dict(cfg,fingerprint='0'*64));raise AssertionError('Wrong certificate accepted')
        except ValueError as e:assert 'Certificado' in str(e)
        assert s.operate(db,'pair',cfg)['ok']
        first=s.operate(db,'sync',{});assert first['added']==2 and first['ack_pending']==0,first
        assert s.operate(db,'list',{})['rows'][0]['number']=='024000123'
        assert s.operate(db,'list',{'kind':'chip'})['rows'][0]['number']=='89553000000000000123'
        while True:
            line=next_line()
            if 'fixture_restarted=true' in line:break
            if 'FAILURES' in line:raise AssertionError('Device restart fixture failed')
        second=s.operate(db,'sync',{});assert second['added']==0 and second['received']==0,second
        print('USB_TLS_PAIRING_OK; WRONG_CERTIFICATE_REJECTED; TWO_ITEMS_SAVED_AND_ACKNOWLEDGED; RECONNECT_WITH_SAME_IDENTITY_OK; NO_DUPLICATES',flush=True)
        db.close()
    lines=[]
    while process.poll() is None or not messages.empty():
        try:lines.append(messages.get(timeout=1))
        except queue.Empty:pass
        if time.monotonic()>deadline:raise TimeoutError('Device fixture did not finish')
    assert 'OK (1 test)' in ''.join(lines), 'Device fixture did not pass'
    print('ANDROID_BRIDGE_FIXTURE_OK',flush=True)
finally:
    subprocess.run(base+['forward','--remove','tcp:18843'],capture_output=True)
