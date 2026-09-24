# Reuse certificate pin and DPAPI; never write the desktop queue.
import importlib.util,json,os,pathlib,sqlite3,sys,time,re
source=pathlib.Path(__file__).resolve().parents[2]/'tools'/'sms_gateway_service.py'
spec=importlib.util.spec_from_file_location('central_gateway',source)
gateway=importlib.util.module_from_spec(spec);spec.loader.exec_module(gateway)
try:
 request=json.load(sys.stdin)
 source_db=pathlib.Path(os.environ['APPDATA'])/'Godot/app_userdata/GRUPO RS CENTRAL/sms_gateway.sqlite'
 db=sqlite3.connect(source_db.as_uri()+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
 cfg=gateway.config_get(db,True);db.close()
 if not cfg:raise ValueError('Gateway não pareado')
 override=pathlib.Path(__file__).resolve().parents[2]/'.secrets'/'homologacao'/'sms-bridge.json'
 if override.exists():
  endpoint=json.loads(override.read_text(encoding='utf-8-sig')).get('gateway_url')
  if endpoint:cfg['url']=endpoint
 action=request['action']
 if action=='health':
  code,result=gateway.request_remote(cfg,'GET','/health');result={'ok':code==200,'reachable':code==200}
 elif action in ('read','send'):
  identity=request['id'];assert re.fullmatch('[a-f0-9-]{36}',identity),'Pedido inválido'
  if action=='send':
   payload=request['payload'];assert payload['id']==identity,'Identidade divergente';gateway.validate(payload,int(time.time()))
   code,result=gateway.request_remote(cfg,'PUT','/jobs/'+identity,payload)
   assert all(result.get(k)==v for k,v in payload.items()),'Retorno divergente'
  else:code,result=gateway.request_remote(cfg,'GET','/jobs/'+identity)
  result={'ok':code==200,'found':code==200,'id':identity,'state':result.get('state'),'remote_at':result.get('updated_at')}
 else:raise ValueError('Ação inválida')
 print(json.dumps(result))
except Exception:
 print(json.dumps({'ok':False,'error':'Gateway indisponível, não pareado ou retorno não confirmado.'}))
