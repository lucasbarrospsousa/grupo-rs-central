extends Node
## Branch-scoped API reads; only explicit selection may change local stock.
const ORIGINS = preload("res://src/services/hub_maintenance.gd").ORIGINS
signal progress(done: int, total: int)
var host: Node
var branch := ""
var bound_store: Variant
var token := ""
var portal: Node
var busy := false
var cancelled := false
var rows: Array[Dictionary] = []

func context_ok() -> bool:
	return is_instance_valid(host) and host.selected_branch_id == branch and host.store == bound_store

func request(path: String, fields: Dictionary = {}) -> Dictionary:
	if not ORIGINS.has(branch):return {"ok":false,"category":"error","message":"Base não reconhecida."}
	var http:=HTTPRequest.new();http.timeout=15;http.max_redirects=0;add_child(http)
	var headers:=PackedStringArray(["Accept: application/json","Content-Type: application/json"])
	if token!="":headers.append("Authorization: Bearer "+token)
	var error:=http.request(str(ORIGINS[branch])+"/api_rest_app"+path,headers,HTTPClient.METHOD_GET if fields.is_empty() else HTTPClient.METHOD_POST,"" if fields.is_empty() else JSON.stringify(fields))
	if error!=OK:http.queue_free();return {"ok":false,"category":"error","message":"Não foi possível iniciar a consulta."}
	var response:Array=await http.request_completed;http.queue_free()
	var code:=int(response[1])
	if response[0]!=HTTPRequest.RESULT_SUCCESS or code<200 or code>=300:return {"ok":false,"category":"error","code":code,"message":"Consulta indisponível (HTTP %d)." % code}
	var decoder:=JSON.new()
	if decoder.parse(response[3].get_string_from_utf8())!=OK:return {"ok":false,"category":"error","message":"A API não retornou JSON válido."}
	return {"ok":true,"data":decoder.data}

func login() -> Dictionary:
	token=""
	if is_instance_valid(portal):portal.queue_free();portal=null
	var credentials:Dictionary=host._grupo_rs_api_credentials() if branch=="imperatriz" else host._hub_maintenance_credentials(branch)
	if str(credentials.get("username",""))=="" or str(credentials.get("password",""))=="":return {"ok":false,"category":"error","message":"Configure o acesso desta base nas Configurações."}
	var reply:=await request("/endpoints/v1/auth/login.php",{"usuario":credentials.username,"senha":credentials.password})
	if not reply.ok:reply["category"]="error";return reply
	token=host._grupo_rs_api_find_token(reply.data)
	return {"ok":token!="","category":"error","message":"A API não confirmou a autenticação desta base."}

func lookup(serial: String) -> Dictionary:
	var result:=await lookup_details(serial)
	if not result.has("category"):result.category="eligible" if result.ok else "review"
	return result

func lookup_details(serial: String) -> Dictionary:
	var reply:=await request("/endpoints/veiculos.php?q=%s&skip=0&take=50" % serial.uri_encode())
	if not reply.ok:reply["category"]="error";return reply
	var payload:Variant=reply.data
	if not payload is Dictionary and not payload is Array:return {"ok":false,"message":"Resposta incompleta da API."}
	if payload is Dictionary and host._grupo_rs_api_response_has_explicit_failure({"ok":true,"body":JSON.stringify(payload)}):return {"ok":false,"category":"error","message":"A API recusou a consulta."}
	var candidates:Array=host._grupo_rs_api_extract_rows(payload)
	if candidates.size()>=50 or host._grupo_rs_api_pagination_state(payload,0,candidates.size()).get("has_more",false):return {"ok":false,"message":"Consulta ampla; vínculo único não confirmado."}
	var matches:Array=[]
	for raw in candidates:
		if host._grupo_rs_api_serial_from_row(raw)==serial:matches.append(host._grupo_rs_api_normalize_location(raw))
	if matches.is_empty():return {"ok":false,"message":"Nenhum vínculo exato retornado; estoque preservado."}
	if matches.size()!=1:return {"ok":false,"message":"Mais de um vínculo para a série; revisão necessária."}
	var row:Dictionary=matches[0]
	var plate:=str(row.get("plate","")).strip_edges()
	var client:=str(row.get("client","")).strip_edges()
	var compact:=plate.replace("-","").replace(" ","").to_upper()
	var pattern:=RegEx.new();pattern.compile("^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$")
	if client=="":
		var owner:=await lookup_client(serial,plate)
		if not owner.ok:return {"ok":false,"plate":plate,"client":"","message":owner.message,"category":owner.get("category","review")}
		client=owner.client
	if client.to_upper()=="RS300" and (host._is_internal_stock_plate(plate) or pattern.search(compact)==null):return {"ok":false,"plate":plate,"client":client,"category":"stock","message":"Permanece em estoque • vínculo confirmado com RS300."}
	if host._is_internal_stock_plate(plate) or pattern.search(compact)==null:return {"ok":false,"plate":plate,"client":client,"message":"Identificação de estoque ou placa não confirmada."}
	if client=="" or client.to_upper()=="RS300":return {"ok":false,"plate":plate,"client":client,"message":"Cliente não confirmado."}
	return {"ok":true,"plate":plate,"client":client,"message":"Pronto para baixa local"}

func lookup_client(serial:String,plate:String) -> Dictionary:
	if not is_instance_valid(portal):
		portal=preload("res://src/services/hub_maintenance.gd").new();portal.branch=branch;portal.decode_body=host._decode_http_body_bytes;add_child(portal)
		var credentials:Dictionary=host._hub_maintenance_credentials(branch)
		var first:Dictionary=await portal.request("/login.php")
		if not first.ok:return {"ok":false,"category":"error","message":"Consulta do cliente indisponível no portal."}
		var auth:Dictionary=await portal.request("/login.php",{"usuario":credentials.get("username",""),"senha":credentials.get("password","")})
		if not auth.ok or int(auth.get("code",0)) not in [200,302,303]:return {"ok":false,"category":"error","message":"Acesso ao cliente não confirmado no portal."}
	var response:Dictionary=await portal.request("/cadastro/veiculos_listar.php?busca=%s&status=Todos" % serial.uri_encode())
	if not response.ok or response.get("code",0)!=200:return {"ok":false,"category":"error","message":"Falha ao conferir o cliente no portal."}
	var matches:Array=[]
	for row in host._parse_modern_grupo_rs_vehicle_rows(str(response.body)):
		if str(row.serial)==serial and host._normalize_location_plate(str(row.plate))==host._normalize_location_plate(plate):matches.append(row)
	if matches.size()!=1 or str(matches[0].client)=="":return {"ok":false,"message":"O portal não confirmou cliente, série e placa únicos."}
	return {"ok":true,"client":str(matches[0].client)}

static func product_serial(product:Dictionary)->String:
	# Regional equipment_number can contain the stock identification (XRS/AAA/GRS).
	# Match the stock table's canonical series fields, preserving leading zeros.
	var pattern:=RegEx.new();pattern.compile("^[0-9]{6,17}$")
	for key in ["imei","sku","serial","equipment_number"]:
		var value:=str(product.get(key,"")).strip_edges()
		if pattern.search(value)!=null:return value
	return ""

func analyze() -> void:
	if busy:return
	busy=true;cancelled=false;rows.clear();branch=host.selected_branch_id;bound_store=host.store
	if bound_store==null:busy=false;return
	for product in bound_store.get_products():
		if host._status_key_for_selected_branch(product)!="estoque":continue
		var serial:=product_serial(product)
		rows.append({"sku":str(product.sku),"serial":serial,"before":product.duplicate(true),"plate":"","client":"","ok":false,"message":"Aguardando consulta","selected":false})
	var serial_counts:Dictionary={}
	for row in rows:serial_counts[row.serial]=int(serial_counts.get(row.serial,0))+1
	progress.emit(0,rows.size())
	if rows.is_empty():busy=false;return
	var auth:=await login()
	for index in range(rows.size()):
		if cancelled or not context_ok():break
		if rows[index].serial=="":
			rows[index].message="Número de série ausente ou inválido no cadastro local.";rows[index].category="review";progress.emit(index+1,rows.size());continue
		var result:Dictionary={"ok":false,"message":"Série duplicada no estoque local; revisão necessária."} if serial_counts[rows[index].serial]>1 else (await lookup(rows[index].serial) if auth.ok else auth)
		if cancelled or not context_ok():break
		if not result.has("category"):result.category="eligible" if result.ok else "review"
		rows[index].merge(result,true);progress.emit(index+1,rows.size())
		await get_tree().process_frame
	busy=false

func apply_selected() -> Dictionary:
	if busy or not context_ok():return {"ok":false,"message":"Base alterada ou consulta em andamento."}
	busy=true
	var done:=0;var failed:=0
	for row in rows:
		if not row.selected or not row.ok:continue
		row.selected=false;row.category="review"
		if not context_ok():failed+=1;row.ok=false;row.message="Base alterada; aplicação interrompida.";break
		if bound_store.get_product(row.sku)!=row.before:failed+=1;row.ok=false;row.message="Cadastro mudou; analise novamente.";continue
		var current:=await lookup(row.serial)
		if not context_ok() or bound_store.get_product(row.sku)!=row.before:failed+=1;row.ok=false;row.message="Base ou cadastro mudou; baixa bloqueada.";continue
		if not current.ok or current.get("plate")!=row.plate or current.get("client")!=row.client:failed+=1;row.ok=false;row.message="Vínculo mudou ou não foi confirmado. Analise novamente.";continue
		row.ok=false;row.category="review"
		if not bound_store.install_tracker(row.sku,row.plate):failed+=1;row.message="Banco local não confirmou a baixa.";continue
		var saved:Dictionary=bound_store.get_product(row.sku)
		var persisted:Dictionary=await host._ensure_local_database_modification_saved(row.sku,saved)
		if not context_ok():failed+=1;row.message="Verificação interrompida por troca de base.";break
		if not persisted.get("ok",false):failed+=1;row.message="Baixa local registrada; confirmação SQL pendente.";continue
		done+=1;row.message="Baixa aplicada • Instalado"
		host._log_system_action("Baixa por análise API","Base: %s | Placa: %s" % [branch,row.plate],row.sku)
	busy=false
	return {"ok":failed==0,"done":done,"failed":failed}
