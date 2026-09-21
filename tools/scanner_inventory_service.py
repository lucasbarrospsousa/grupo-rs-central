"""Manual warehouse intake. Never opens or changes the operational inventory database."""
import json, re, sqlite3, sys, time, uuid
from pathlib import Path


def connect(path):
    db = sqlite3.connect(path, timeout=5)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA synchronous=FULL')
    db.executescript('''
      CREATE TABLE IF NOT EXISTS removals(branch TEXT NOT NULL,kind TEXT NOT NULL,number TEXT NOT NULL,
        removed_at INTEGER NOT NULL,PRIMARY KEY(branch,kind,number));
      CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS items(branch TEXT NOT NULL,kind TEXT NOT NULL,number TEXT NOT NULL,
        received_at INTEGER NOT NULL,PRIMARY KEY(branch,kind,number));
      CREATE TABLE IF NOT EXISTS receipts(source TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,
        PRIMARY KEY(source,id));
      CREATE TABLE IF NOT EXISTS chip_usage(number TEXT PRIMARY KEY,device_serial TEXT NOT NULL,
        used_branch TEXT NOT NULL,registered_at TEXT NOT NULL,detected_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS movements(id TEXT PRIMARY KEY,payload TEXT NOT NULL,
        destination TEXT NOT NULL,mode TEXT NOT NULL,note TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS movement_items(movement_id TEXT NOT NULL,branch TEXT NOT NULL,
        kind TEXT NOT NULL,number TEXT NOT NULL,PRIMARY KEY(branch,kind,number),
        FOREIGN KEY(movement_id) REFERENCES movements(id));
    ''')
    return db


def register(db, data):
    kind, number = data.get('kind'), data.get('number')
    if kind not in ('equipment', 'chip') or not isinstance(number, str):
        raise ValueError('Selecione aparelho ou chip e informe o número')
    number = number.strip()
    pattern = r'[0-9]{9}' if kind == 'equipment' else r'89[0-9]{17,18}'
    if not re.fullmatch(pattern, number):
        raise ValueError('Informe a série com 9 dígitos' if kind == 'equipment' else 'Informe o ICCID com 19 ou 20 dígitos, começando por 89')
    with db:
        db.execute('BEGIN IMMEDIATE')
        if db.execute('SELECT 1 FROM items WHERE kind=? AND number=?', (kind, number)).fetchone():
            raise ValueError('Este número já está no Armazém. O cadastro e seu histórico foram preservados.')
        db.execute('INSERT INTO items VALUES(?,?,?,?)', ('imperatriz', kind, number, int(time.time())))
    return {'ok': True, 'kind': kind, 'number': number}


BASES = {'imperatriz':'Imperatriz','araguaina':'Araguaína','acailandia':'Açailândia','maraba':'Marabá'}


OPERATIONAL_DB = Path('C:/GRUPO RS CENTRAL/database/grupo_rs_central.sqlite')
PARTITIONS = {**{k:k for k in BASES}, **{'backups_'+k:k for k in BASES if k!='imperatriz'}}


def reconcile_usage(db, source_path):
    """Read committed registrations only. Never create/write the source database."""
    candidates=[r[0] for r in db.execute("SELECT i.number FROM items i LEFT JOIN chip_usage u ON u.number=i.number WHERE i.kind='chip' AND u.number IS NULL AND NOT EXISTS (SELECT 1 FROM removals r WHERE r.branch=i.branch AND r.kind=i.kind AND r.number=i.number)")]
    if not candidates:return {'ok':True,'used':0,'ambiguous':0,'used_numbers':[],'checked':0}
    matches={}
    try:
        source=sqlite3.connect(Path(source_path).resolve().as_uri()+'?mode=ro',uri=True,timeout=2)
        try:
            source.execute('PRAGMA query_only=ON');source.execute('BEGIN')
            for offset in range(0,len(candidates),400):
                batch=candidates[offset:offset+400]
                rows=source.execute('SELECT branch_id,sku,iccid,updated_at FROM devices WHERE iccid IN ('+','.join('?' for _ in batch)+')',batch)
                for branch,serial,number,stamp in rows:matches.setdefault(number,[]).append((branch,serial,stamp))
        finally:source.close()
    except (sqlite3.Error,OSError,ValueError):
        return {'ok':False,'error':'Verificação de uso pendente: banco compartilhado indisponível. Nenhum chip alterado.'}
    confirmed=[];ambiguous=0
    for number,rows in matches.items():
        if len(rows)!=1 or rows[0][0] not in PARTITIONS or not isinstance(rows[0][1],str) or not re.fullmatch(r'[0-9]{9}',rows[0][1]):
            ambiguous+=1;continue
        branch,serial,stamp=rows[0]
        confirmed.append((number,serial,PARTITIONS[branch],str(stamp or ''),int(time.time())))
    used=[]
    with db:
        db.execute('BEGIN IMMEDIATE')
        for row in confirmed:
            if db.execute('INSERT OR IGNORE INTO chip_usage VALUES(?,?,?,?,?)',row).rowcount:used.append(row[0])
    return {'ok':True,'used':len(used),'used_numbers':used,'ambiguous':ambiguous,'checked':len(candidates)}


def dispatch(db, data):
    request_id = data.get('id','')
    if str(uuid.UUID(request_id)) != request_id:raise ValueError('Identificador inválido')
    mode = data.get('mode')
    destination = data.get('destination','')
    note = data.get('note','')
    if not isinstance(destination,str) or not isinstance(note,str):raise ValueError('Destino inválido')
    destination=destination.strip();note=note.strip()
    if mode not in ('base','custom') or (mode=='base' and destination not in BASES):raise ValueError('Selecione uma base válida')
    if not 1<=len(destination)<=120 or len(note)>500:raise ValueError('Confira o destino e a observação')
    rows=data.get('items')
    if not isinstance(rows,list) or not 1<=len(rows)<=250:raise ValueError('Selecione entre 1 e 250 itens')
    selected=[]
    for row in rows:
        if not isinstance(row,dict) or set(row)!={'kind','number'}:raise ValueError('Item inválido')
        kind,number=row['kind'],row['number']
        if kind not in ('equipment','chip') or not isinstance(number,str):raise ValueError('Item inválido')
        if not re.fullmatch(r'[0-9]{9}' if kind=='equipment' else r'89[0-9]{17,18}',number):raise ValueError('Número inválido')
        selected.append((kind,number))
    if len(set(selected))!=len(selected):raise ValueError('Seleção repetida')
    payload=json.dumps({'mode':mode,'destination':destination,'note':note,'items':sorted(selected)},sort_keys=True)
    with db:
        db.execute('BEGIN IMMEDIATE')
        old=db.execute('SELECT payload FROM movements WHERE id=?',(request_id,)).fetchone()
        if old:
            if old[0]!=payload:raise ValueError('Envio repetido com conteúdo diferente')
            return {'ok':True,'sent':len(selected),'id':request_id,'repeated':True}
        for kind,number in selected:
            exists=db.execute('SELECT 1 FROM items WHERE branch=? AND kind=? AND number=?',('imperatriz',kind,number)).fetchone()
            sent=db.execute('SELECT 1 FROM movement_items WHERE branch=? AND kind=? AND number=?',('imperatriz',kind,number)).fetchone()
            used=kind=='chip' and db.execute('SELECT 1 FROM chip_usage WHERE number=?',(number,)).fetchone()
            removed=db.execute('SELECT 1 FROM removals WHERE branch=? AND kind=? AND number=?',('imperatriz',kind,number)).fetchone()
            if not exists or sent or used or removed:raise ValueError('Um item não está mais disponível. Atualize e revise a seleção.')
        db.execute('INSERT INTO movements VALUES(?,?,?,?,?,?)',(request_id,payload,destination,mode,note,int(time.time())))
        db.executemany('INSERT INTO movement_items VALUES(?,?,?,?)',[(request_id,'imperatriz',k,n) for k,n in selected])
    return {'ok':True,'sent':len(selected),'id':request_id,'repeated':False}


def remove_item(db, data):
    kind, number = data.get('kind'), data.get('number')
    if kind not in ('equipment','chip') or not isinstance(number,str):raise ValueError('Item inválido')
    with db:
        db.execute('BEGIN IMMEDIATE')
        key=('imperatriz',kind,number)
        if not db.execute('SELECT 1 FROM items WHERE branch=? AND kind=? AND number=?',key).fetchone():raise ValueError('Item não encontrado')
        if db.execute('SELECT 1 FROM removals WHERE branch=? AND kind=? AND number=?',key).fetchone():return {'ok':True,'repeated':True}
        if db.execute('SELECT 1 FROM movement_items WHERE branch=? AND kind=? AND number=?',key).fetchone() or (kind=='chip' and db.execute('SELECT 1 FROM chip_usage WHERE number=?',(number,)).fetchone()):
            raise ValueError('Itens enviados ou utilizados não podem ser removidos da lista disponível.')
        db.execute('INSERT INTO removals VALUES(?,?,?,?)',(*key,int(time.time())))
    return {'ok':True,'repeated':False}


def operate(db, op, data):
    if op == 'reconcile_usage':return reconcile_usage(db,OPERATIONAL_DB)
    if op == 'dispatch':return dispatch(db,data)
    if op == 'register':return register(db,data)
    if op == 'remove':return remove_item(db,data)
    if op == 'list':
        kind=data.get('kind','equipment')
        if kind not in ('equipment','chip','movements'):raise ValueError('Tipo inválido')
        query=str(data.get('query','')).strip()
        if query and not re.fullmatch('[0-9]{1,20}',query):raise ValueError('Busque apenas por números')
        page=max(0,int(data.get('page',0)))
        joins=" FROM items i LEFT JOIN movement_items mi ON mi.branch=i.branch AND mi.kind=i.kind AND mi.number=i.number LEFT JOIN movements m ON m.id=mi.movement_id LEFT JOIN chip_usage u ON i.kind='chip' AND u.number=i.number LEFT JOIN removals r ON r.branch=i.branch AND r.kind=i.kind AND r.number=i.number "
        state=data.get('state','available')
        if state not in ('available','sent','used','all'):raise ValueError('Filtro inválido')
        where="WHERE i.branch='imperatriz' AND i.number LIKE ?"
        params=['%'+query+'%']
        if kind=='movements':where+=' AND (mi.movement_id IS NOT NULL OR u.number IS NOT NULL OR r.number IS NOT NULL)'
        else:
            where+=' AND i.kind=? AND r.number IS NULL';params.append(kind)
            if state=='available':where+=' AND mi.movement_id IS NULL AND u.number IS NULL'
            elif state=='sent':where+=' AND mi.movement_id IS NOT NULL AND u.number IS NULL'
            elif state=='used':where+=' AND u.number IS NOT NULL'
        total=db.execute('SELECT COUNT(*)'+joins+where,params).fetchone()[0]
        page=min(page,max(0,(total-1)//12))
        counts={r['kind']:r['n'] for r in db.execute('SELECT i.kind,COUNT(*) n'+joins+"WHERE i.branch='imperatriz' AND mi.movement_id IS NULL AND u.number IS NULL AND r.number IS NULL GROUP BY i.kind")}
        # Fortaleza is UTC-3; the count is independent from the Windows timezone.
        today=int((time.time()-10800)//86400)*86400+10800
        counts['sent_today']=db.execute('SELECT COUNT(*) FROM movement_items mi JOIN movements m ON m.id=mi.movement_id WHERE m.created_at>=?',(today,)).fetchone()[0]
        rows=[dict(r) for r in db.execute("SELECT i.*,m.id movement_id,m.destination,m.mode,m.note,m.created_at sent_at,u.device_serial,u.used_branch,u.registered_at,u.detected_at,r.removed_at,CASE WHEN r.number IS NOT NULL THEN 'removed' WHEN u.number IS NOT NULL THEN 'used' WHEN mi.movement_id IS NULL THEN 'available' ELSE 'sent' END state"+joins+where+' ORDER BY COALESCE(r.removed_at,u.detected_at,m.created_at,i.received_at) DESC,i.number LIMIT 12 OFFSET ?',(*params,page*12))]
        for row in rows:
            if row['mode']=='base':row['destination']=BASES.get(row['destination'],row['destination'])
            if row['used_branch']:row['used_branch']=BASES[row['used_branch']]
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
        result={'ok':False,'error':'Armazém indisponível ou falha de gravação. Tente novamente.'}
    output.write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
