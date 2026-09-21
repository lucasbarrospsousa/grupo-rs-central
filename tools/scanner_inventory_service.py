"""Separate scanner intake. Never opens or changes the operational inventory database."""
import json, re, sqlite3, sys, time, uuid
from pathlib import Path
from sms_gateway_service import protect, request_remote, endpoint


def connect(path):
    db = sqlite3.connect(path, timeout=5)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA synchronous=FULL')
    db.executescript('''
      CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS items(branch TEXT NOT NULL,kind TEXT NOT NULL,number TEXT NOT NULL,
        received_at INTEGER NOT NULL,PRIMARY KEY(branch,kind,number));
      CREATE TABLE IF NOT EXISTS receipts(source TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,
        PRIMARY KEY(source,id));
    ''')
    return db


def config(db, secret=False):
    row = db.execute('SELECT value FROM config WHERE id=1').fetchone()
    value = json.loads(row[0]) if row else {}
    encrypted = value.pop('protected_token', None)
    if secret and encrypted:
        value['token'] = protect(encrypted, True)
    return value


def validate(row):
    if not isinstance(row, dict) or set(row) != {'id','kind','number','created_at','branch','version'}:
        raise ValueError('Formato de leitura inválido')
    if row['version'] != 1 or type(row['version']) is not int or row['branch'] != 'imperatriz':
        raise ValueError('Base ou versão inválida')
    if str(uuid.UUID(row['id'])) != row['id']:
        raise ValueError('Identificador inválido')
    if row['kind'] not in ('equipment','chip') or not isinstance(row['number'], str):
        raise ValueError('Tipo de leitura inválido')
    pattern = r'[0-9]{9}' if row['kind'] == 'equipment' else r'89[0-9]{17,18}'
    if not re.fullmatch(pattern, row['number']):
        raise ValueError('Número inválido')
    if type(row['created_at']) is not int or not 0 < row['created_at'] <= time.time()+300:
        raise ValueError('Confira a data e a hora do celular')


def accept(db, source, rows):
    if not isinstance(rows, list) or len(rows) > 40:
        raise ValueError('Lote inválido')
    added = 0
    with db:
        db.execute('BEGIN IMMEDIATE')
        for row in rows:
            validate(row)
            payload = json.dumps(row, sort_keys=True)
            old = db.execute('SELECT payload FROM receipts WHERE source=? AND id=?', (source,row['id'])).fetchone()
            if old and old[0] != payload:
                raise ValueError('Leitura repetida com conteúdo diferente; recebimento bloqueado')
            db.execute('INSERT OR IGNORE INTO receipts VALUES(?,?,?)', (source,row['id'],payload))
            added += db.execute('INSERT OR IGNORE INTO items VALUES(?,?,?,?)',
                (row['branch'],row['kind'],row['number'],int(time.time()))).rowcount
    return added


def operate(db, op, data):
    if op == 'config':
        return {'ok':True, 'config':config(db)}
    if op == 'pair':
        endpoint(data['url'])
        status, result = request_remote(data, 'POST', '/pair', {'code':data['code']})
        if status != 200 or result.get('service') != 'rs-scanner' or result.get('version') != 1 or not re.fullmatch('[0-9a-f]{64}',result.get('token','')):
            raise ValueError('Pareamento do Scanner não confirmado')
        value = {'url':data['url'], 'fingerprint':data['fingerprint'], 'protected_token':protect(result['token'])}
        with db:
            db.execute('INSERT OR REPLACE INTO config VALUES(1,?)',(json.dumps(value),))
        return {'ok':True}
    if op == 'address':
        value=config(db,True)
        if not value:raise ValueError('Pareie o Scanner primeiro')
        value['url']=data['url'];endpoint(value['url'])
        status, health=request_remote(value,'GET','/health')
        if status!=200 or health.get('service')!='rs-scanner' or health.get('branch')!='imperatriz':
            raise ValueError('Scanner não confirmado neste endereço')
        value['protected_token']=protect(value.pop('token'))
        with db:db.execute('UPDATE config SET value=? WHERE id=1',(json.dumps(value),))
        return {'ok':True}
    if op == 'sync':
        value = config(db,True)
        if not value:raise ValueError('Pareie o RS Scanner antes de receber leituras')
        status, result = request_remote(value,'GET','/readings')
        if status != 200 or result.get('service') != 'rs-scanner':
            raise ValueError('Resposta do Scanner inválida')
        rows = result.get('readings')
        added = accept(db,value['fingerprint'],rows)
        acknowledged = 0
        deadline = time.monotonic()+12
        for row in rows:
            if time.monotonic() >= deadline:break
            try:
                status, response = request_remote(value,'POST','/ack',{k:row[k] for k in ('id','kind','number')})
                if status != 200 or response.get('id') != row['id'] or response.get('state') != 'received':break
                acknowledged += 1
            except Exception:
                break
        return {'ok':True,'added':added,'received':len(rows),'ack_pending':len(rows)-acknowledged}
    if op == 'list':
        kind=data.get('kind','equipment')
        if kind not in ('equipment','chip'):raise ValueError('Tipo inválido')
        query=str(data.get('query','')).strip()
        if query and not re.fullmatch('[0-9]{1,20}',query):raise ValueError('Busque apenas por números')
        page=max(0,int(data.get('page',0)))
        filters=('imperatriz',kind,'%'+query+'%')
        total=db.execute('SELECT COUNT(*) FROM items WHERE branch=? AND kind=? AND number LIKE ?',filters).fetchone()[0]
        counts={r['kind']:r['n'] for r in db.execute("SELECT kind,COUNT(*) n FROM items WHERE branch='imperatriz' GROUP BY kind")}
        rows=[dict(r) for r in db.execute('SELECT * FROM items WHERE branch=? AND kind=? AND number LIKE ? ORDER BY received_at DESC,number LIMIT 25 OFFSET ?',(*filters,page*25))]
        return {'ok':True,'rows':rows,'total':total,'counts':counts,'page':page}
    raise ValueError('Operação inválida')


if __name__ == '__main__':
    output=Path(sys.argv[4])
    try:
        with connect(sys.argv[2]) as db:
            result=operate(db,sys.argv[1],json.loads(Path(sys.argv[3]).read_text(encoding='utf-8')))
    except (ValueError, KeyError) as error:
        result={'ok':False,'error':str(error) if isinstance(error,ValueError) else 'Requisição incompleta'}
    except Exception:
        result={'ok':False,'error':'Scanner indisponível ou falha de gravação. Confira o Wi-Fi e tente novamente.'}
    output.write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
