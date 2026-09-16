"""Isolated local SMS queue. No inventory writes. TLS pin checked BEFORE credentials.
CLI: service.py operation queue.sqlite request.json response.json
"""
import base64, ctypes, hashlib, hmac, http.client, ipaddress, json, os, re, sqlite3, ssl, sys, time, uuid
from urllib.parse import urlsplit

TERMINAL = {"sent","delivered","failed","expired","cancelled","indeterminate","needs_confirmation"}
REMOTE = {"received","sending","sent","delivered","failed","expired","cancelled","indeterminate"}

def protect(value, decrypt=False):
    if os.name != "nt":
        raise RuntimeError("Credenciais requerem Windows DPAPI")
    class Blob(ctypes.Structure):
        _fields_=[("size",ctypes.c_ulong),("data",ctypes.POINTER(ctypes.c_char))]
    raw=base64.b64decode(value) if decrypt else value.encode()
    buf=ctypes.create_string_buffer(raw);src=Blob(len(raw),ctypes.cast(buf,ctypes.POINTER(ctypes.c_char)));out=Blob()
    fn=ctypes.windll.crypt32.CryptUnprotectData if decrypt else ctypes.windll.crypt32.CryptProtectData
    if not fn(ctypes.byref(src),None,None,None,None,1,ctypes.byref(out)):
        raise RuntimeError("Falha DPAPI")
    try:
        data=ctypes.string_at(out.data,out.size)
        return data.decode() if decrypt else base64.b64encode(data).decode()
    finally: ctypes.windll.kernel32.LocalFree(out.data)

def endpoint(url):
    p=urlsplit(url)
    ip=ipaddress.ip_address(p.hostname or "")
    if p.scheme!="https" or not ip.is_private or ip.is_unspecified or ip.is_multicast or p.username or p.password or p.path not in ("","/") or p.query or p.fragment:
        raise ValueError("Use HTTPS e o IPv4 privado mostrado no celular")
    return p.hostname,p.port or 8743

def request_remote(config, method, path, payload=None):
    host,port=endpoint(config["url"])
    pin=config["fingerprint"].lower().replace(":","").replace(" ","")
    if not re.fullmatch("[0-9a-f]{64}",pin):raise ValueError("SHA256 inválido")
    ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT);ctx.check_hostname=False;ctx.verify_mode=ssl.CERT_NONE;ctx.minimum_version=ssl.TLSVersion.TLSv1_2
    conn=http.client.HTTPSConnection(host,port,context=ctx,timeout=4)
    try:
        conn.connect()
        actual=hashlib.sha256(conn.sock.getpeercert(binary_form=True)).hexdigest()
        if not hmac.compare_digest(actual,pin): raise ValueError("Certificado diferente: envio bloqueado")
        headers={"Content-Type":"application/json"}
        if config.get("token"):headers["Authorization"]="Bearer "+config["token"]
        conn.request(method,path,json.dumps(payload) if payload is not None else None,headers)
        res=conn.getresponse();raw=res.read(16385)
        if len(raw)>16384:raise ValueError("Resposta excedeu limite")
        data=json.loads(raw or b"{}")
        if res.status not in (200,404): raise ValueError("Gateway recusou: "+str(res.status))
        return res.status,data
    finally:conn.close()

def connect(path):
    db=sqlite3.connect(path,timeout=5);db.row_factory=sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL");db.execute("PRAGMA synchronous=FULL")
    db.executescript("""
    CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,payload TEXT NOT NULL,state TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '',remote_seen INTEGER NOT NULL DEFAULT 0,cancel_requested INTEGER NOT NULL DEFAULT 0,attempted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS acknowledgements(job_id TEXT NOT NULL,state TEXT NOT NULL,observed_at INTEGER NOT NULL,remote_at INTEGER,PRIMARY KEY(job_id,state));
    CREATE TABLE IF NOT EXISTS batch_items(job_id TEXT PRIMARY KEY,batch_id TEXT NOT NULL,position INTEGER NOT NULL,group_no INTEGER NOT NULL);
    """)
    return db

def config_get(db, secret=False):
    row=db.execute("SELECT value FROM config WHERE id=1").fetchone()
    if not row:return {}
    data=json.loads(row[0])
    if secret:data["token"]=protect(data.pop("protected_token"),True)
    else:data.pop("protected_token",None)
    return data

def row_get(db,id):
    row=db.execute("SELECT * FROM jobs WHERE id=?",(id,)).fetchone()
    if not row:return None
    value=dict(row);value["payload"]=json.loads(value["payload"])
    batch=db.execute('SELECT batch_id,position,group_no FROM batch_items WHERE job_id=?',(id,)).fetchone()
    if batch:value['batch']=dict(batch)
    value['acknowledgements']=[dict(r) for r in db.execute('SELECT state,observed_at,remote_at FROM acknowledgements WHERE job_id=? ORDER BY observed_at,state',(id,))]
    return value

def acknowledge(db, job, remote):
    assert remote.get('id')==job['id'] and remote.get('state') in REMOTE,'Resposta inválida'
    assert all(remote.get(k)==v for k,v in job['payload'].items()),'Conteúdo remoto divergente'
    now=int(time.time());stamp=remote.get('updated_at')
    stamp=stamp if isinstance(stamp,int) and not isinstance(stamp,bool) and job['payload']['created_at']<=stamp<=now+60 else None
    db.execute('INSERT OR IGNORE INTO acknowledgements VALUES(?,?,?,?)',(job['id'],remote['state'],now,stamp))
    return state(db,job['id'],remote['state'],remote.get('detail',''))

def state(db,id,status,detail=""):
    db.execute("UPDATE jobs SET state=?,detail=? WHERE id=?",(status,detail,id));db.commit()
    return row_get(db,id)

def validate(p,now):
    assert p["version"] in (1,2) and p["branch"]=="imperatriz","Base inválida"
    assert re.fullmatch(r"024\d{6}",p["serial"]),"Série inválida"
    assert re.fullmatch(r"\+55[1-9]\d{9,10}",p["phone"]),"Telefone inválido"
    assert p["expires_at"]-p["created_at"]==7200,"Prazo inválido"
    assert now-7200<p["created_at"]<=now+60,"Confirmação inválida ou vencida"
    assert p["status_snapshot"],"Status ausente"
    command=p["command"]
    assert command.strip() and len(command)<=160 and all(32<=ord(c)<=126 for c in command),"Use texto simples, sem quebras, com até 160 caracteres"
    if p["version"]==1:
        assert command.startswith("ST300NTW;"+p["serial"]+";"),"Comando inválido"
    else:
        assert p["command_mode"] in ("custom","standard"),"Modo inválido"
        assert re.fullmatch(r"\+55[1-9]\d{9,10}",p["source_phone_snapshot"]),"Telefone consultado inválido"
        assert isinstance(p["apn_snapshot"],str) and isinstance(p["standard_command_snapshot"],str),"Consulta ausente"
        if p["command_mode"]=="standard":
            assert command==p["standard_command_snapshot"] and command.startswith("ST300NTW;"+p["serial"]+";"),"Comando padrão divergente"
            assert p["phone"]==p["source_phone_snapshot"],"Envio rápido usa o telefone consultado"

def batch_gate(db,job,now):
    if not job.get('batch') or job['attempted']:return ''
    b=job['batch']
    previous=db.execute('SELECT j.id,j.state FROM batch_items b JOIN jobs j ON j.id=b.job_id WHERE b.batch_id=? AND b.position<? ORDER BY b.position',(b['batch_id'],b['position'])).fetchall()
    for row in previous:
        if row['state'] not in ('sent','delivered'):return 'Lote pausado: linha anterior sem confirmacao de envio'
        ack=db.execute("SELECT MIN(observed_at) FROM acknowledgements WHERE job_id=? AND state IN ('sent','delivered')",(row['id'],)).fetchone()[0]
        if ack is None or now<ack+60:return 'Intervalo de seguranca: 60 segundos apos confirmacao'
    # Global cooldown also prevents back-to-back batches.
    last=db.execute("SELECT MAX(observed_at) FROM acknowledgements WHERE state IN ('sent','delivered')").fetchone()[0]
    if last is not None and now<last+60:return 'Intervalo de seguranca entre envios'
    return ''

def operate(db,op,p):
    now=int(time.time())
    if op=="config":return {"ok":True,"config":config_get(db)}
    if op=='health':
        cfg=config_get(db,True)
        if not cfg:return {'ok':False,'error':'Gateway não pareado'}
        code,health=request_remote(cfg,'GET','/health')
        assert code==200 and health.get('version')==1,'Resposta de saúde inválida'
        return {'ok':True,'checked_at':now,'health':{k:health.get(k) for k in ('send_enabled','app_version','background_exempt','screen_interactive','cpu_protected')}}
    if op=="pair":
        endpoint(p["url"])
        current=config_get(db)
        # Never switch phone identity under a live queue.
        active=db.execute("SELECT 1 FROM jobs WHERE state NOT IN ('sent','delivered','failed','expired','cancelled','indeterminate','needs_confirmation') LIMIT 1").fetchone()
        assert not active or current.get("fingerprint")==p["fingerprint"],"Cancele/conclua a fila antes de trocar o telefone"
        code,out=request_remote(p,"POST","/pair",{"code":p["code"]})
        assert code==200 and re.fullmatch("[0-9a-f]{64}",out.get("token","")),"Pareamento não confirmado"
        value={"url":p["url"],"fingerprint":p["fingerprint"],"protected_token":protect(out["token"])}
        db.execute("INSERT OR REPLACE INTO config VALUES(1,?)",(json.dumps(value),));db.commit();return {"ok":True}
    if op=="address":
        endpoint(p["url"]);value=config_get(db,True);value["url"]=p["url"]
        request_remote(value,"GET","/health")
        value["protected_token"]=protect(value.pop("token"));db.execute("UPDATE config SET value=? WHERE id=1",(json.dumps(value),));db.commit();return {"ok":True}
    if op=='enqueue_batch':
        assert config_get(db),'Gateway nao pareado'
        assert not db.execute("SELECT 1 FROM jobs WHERE state IN ('waiting_gateway','received','sending') LIMIT 1").fetchone(),'Conclua ou cancele a fila anterior'
        rows=p.get('rows',[]);assert 1<=len(rows)<=10,'Lote permite de 1 a 10 linhas'
        values=[];seen=set();batch_id=str(uuid.uuid4())
        for row in rows:
            group=row.get('group');assert type(group) is int and 1<=group<=4,'Grupo obrigatorio: 1 a 4'
            value=dict(row);value.pop('group');value.update(id=str(uuid.uuid4()),version=2,branch='imperatriz',created_at=now,expires_at=now+7200)
            validate(value,now)
            assert value['command_mode']=='standard','Lote somente de configuracao'
            parts=value['command'].split(';')
            assert len(parts)==12 and parts[7]==parts[9]==f'grupors{group}.ddns.net' and parts[8]=='5940' and parts[10]=='5941','Servidor do grupo divergente'
            assert value['serial'] not in seen and value['phone'] not in seen,'Serie ou telefone repetido'
            seen.update((value['serial'],value['phone']));values.append((value,group))
        with db:
            db.execute('BEGIN IMMEDIATE')
            assert not db.execute("SELECT 1 FROM jobs WHERE state IN ('waiting_gateway','received','sending') LIMIT 1").fetchone(),'Fila mudou: consulte novamente'
            for index,(value,group) in enumerate(values):
                db.execute("INSERT INTO jobs(id,payload,state) VALUES(?,?,'waiting_gateway')",(value['id'],json.dumps(value,sort_keys=True)))
                db.execute('INSERT INTO batch_items VALUES(?,?,?,?)',(value['id'],batch_id,index,group))
        return {'ok':True,'batch_id':batch_id,'count':len(values)}
    if op=='cancel_batch':
        rows=db.execute('SELECT job_id FROM batch_items WHERE batch_id=?',(p['batch_id'],)).fetchall()
        for row in rows:operate(db,'cancel',{'id':row[0]})
        return {'ok':True,'count':len(rows)}
    if op=="enqueue":
        assert not db.execute("SELECT 1 FROM batch_items b JOIN jobs j ON b.job_id=j.id WHERE j.state IN ('waiting_gateway','received','sending') LIMIT 1").fetchone(),'Lote ativo: aguarde ou cancele antes de enviar avulso'
        assert config_get(db),"Gateway não pareado"
        value=dict(p);confirmed=int(value.pop("confirmed_at",now));value["id"]=str(uuid.uuid4());value["version"]=p.get("version",1);value["branch"]="imperatriz";value["created_at"]=confirmed;value["expires_at"]=confirmed+7200
        validate(value,now)
        duplicate=db.execute("SELECT payload FROM jobs WHERE state IN ('waiting_gateway','received','sending')").fetchall()
        assert not any(all(json.loads(r[0]).get(k)==value[k] for k in ("serial","phone","command")) for r in duplicate),"Já existe pedido igual pendente"
        db.execute("INSERT INTO jobs(id,payload,state) VALUES(?,?,'waiting_gateway')",(value["id"],json.dumps(value,sort_keys=True)));db.commit()
        return {"ok":True,"job":row_get(db,value["id"])}
    if op=="list":
        rows=[row_get(db,r[0]) for r in db.execute("SELECT id FROM jobs ORDER BY rowid DESC LIMIT 100")]
        return {"ok":True,"jobs":rows}
    if op=="refresh_delivery":
        # One read-only refresh per call, without holding up unsent jobs.
        candidates=db.execute("SELECT id FROM jobs WHERE state IN ('sent','indeterminate') ORDER BY rowid").fetchall()
        if not candidates:return {"ok":True}
        cfg=config_get(db,True)
        for candidate in [candidates[int(p.get("cursor",0)) % len(candidates)]]:
            job=row_get(db,candidate[0])
            code,remote=request_remote(cfg,"GET","/jobs/"+job["id"])
            if code!=200 or remote.get("id")!=job["id"]:continue
            if any(remote.get(k)!=v for k,v in job["payload"].items()):continue
            allowed={'delivered'} if job['state']=='sent' else {'sent','delivered','failed'}
            if remote.get('state') in allowed:acknowledge(db,job,remote)
        return {"ok":True}
    if op=="pending":
        # An attempted PUT must be reconciled even when expired; it could have sent.
        for row in db.execute("SELECT id,payload FROM jobs WHERE state='waiting_gateway' AND attempted=0").fetchall():
            if json.loads(row["payload"])["expires_at"]<=now:state(db,row["id"],"expired")
        r=db.execute("SELECT id FROM jobs WHERE state IN ('waiting_gateway','received','sending') OR (cancel_requested=1 AND state NOT IN ('sent','delivered','failed','expired','cancelled','indeterminate')) ORDER BY rowid LIMIT 1").fetchone()
        return {"ok":True,"job":row_get(db,r[0]) if r else None}
    if op=="cancel":
        job=row_get(db,p["id"]);assert job,"Pedido não existe"
        if job["state"] in TERMINAL:return {"ok":True,"job":job}
        if not job["attempted"]:return {"ok":True,"job":state(db,p["id"],"cancelled")}
        db.execute("UPDATE jobs SET cancel_requested=1 WHERE id=?",(p["id"],));db.commit()
        return {"ok":True,"job":row_get(db,p["id"])}
    if op=="revalidate_failed":
        job=row_get(db,p["id"]);assert job,"Pedido não existe"
        if job["state"]!="waiting_gateway" or job["remote_seen"]:return {"ok":True,"job":job}
        return {"ok":True,"job":state(db,p["id"],"needs_confirmation","Cadastro mudou; consulte e confirme um novo pedido")}
    if op=="reconcile":
        job=row_get(db,p["id"]);assert job,"Pedido não existe"
        if job["state"] in TERMINAL:return {"ok":True,"job":job}
        if not job['attempted'] and job['payload']['expires_at']<=now:return {'ok':True,'job':state(db,job['id'],'expired')}
        blocked=batch_gate(db,job,now)
        if blocked and not job['cancel_requested']:
            db.execute('UPDATE jobs SET detail=? WHERE id=?',(blocked,job['id']));db.commit()
            return {'ok':True,'job':row_get(db,job['id']),'batch_wait':True}
        cfg=config_get(db,True);payload=job["payload"];path="/jobs/"+job["id"]
        try:
            code,remote=request_remote(cfg,"GET",path)
            if code==200:
                assert remote.get("id")==job["id"] and remote.get("state") in REMOTE,"Resposta inválida"
                for k,v in payload.items():assert remote.get(k)==v,"Conteúdo remoto divergente"
                db.execute("UPDATE jobs SET remote_seen=1,attempted=1 WHERE id=?",(job["id"],));db.commit()
                if job["cancel_requested"]:
                    ack,remote=request_remote(cfg,"POST",path+"/cancel",{})
                    assert ack==200 and remote.get("id")==job["id"] and remote.get("state") in REMOTE,"Cancelamento não confirmado"
                    for k,v in payload.items():assert remote.get(k)==v,"Conteúdo remoto divergente"
                return {"ok":True,"job":acknowledge(db,job,remote)}
            if job["remote_seen"]:return {"ok":True,"job":state(db,job["id"],"indeterminate","Pedido desapareceu do telefone; não reenviado")}
            if job["cancel_requested"]:return {"ok":True,"job":state(db,job["id"],"cancelled")}
            if payload["expires_at"]<=now:return {"ok":True,"job":state(db,job["id"],"expired")}
            if not p.get("validated"):return {"ok":True,"needs_validation":True,"job":job}
            # Commit before PUT. On timeout repeat GET, never mint another UUID.
            db.execute("UPDATE jobs SET attempted=1 WHERE id=?",(job["id"],));db.commit()
            _,remote=request_remote(cfg,"PUT",path,payload)
            assert remote.get("id")==job["id"] and remote.get("state") in REMOTE,"Resposta inválida"
            for k,v in payload.items():assert remote.get(k)==v,"Conteúdo remoto divergente"
            db.execute("UPDATE jobs SET remote_seen=1 WHERE id=?",(job["id"],));db.commit()
            return {"ok":True,"job":acknowledge(db,job,remote)}
        except (OSError,ValueError,AssertionError) as exc:
            db.execute("UPDATE jobs SET detail=? WHERE id=?",("Gateway indisponível ou resposta não confirmada",job["id"]));db.commit()
            return {"ok":False,"error":"Gateway indisponível ou resposta não confirmada","job":row_get(db,job["id"])}
    raise ValueError("Operação desconhecida")

if __name__=="__main__":
    _,op,path,inp,out=sys.argv
    try:
        with connect(path) as db:result=operate(db,op,json.load(open(inp,encoding="utf-8")))
    except Exception as exc: result={"ok":False,"error":str(exc) or exc.__class__.__name__}
    with open(out,"w",encoding="utf8") as f:json.dump(result,f,ensure_ascii=False)
