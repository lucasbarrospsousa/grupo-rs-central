extends Node
## Read-only portal lookup. Credentials/session stay in memory; no inventory writes.
const ROOT := "https://imp.ogrupors.com.br"
const Communication = preload("res://src/inventory_communication_status.gd")
var credentials: Dictionary = {}
var cookies: Dictionary = {}
var authenticated := false
var decode_body: Callable
var last_communication: Dictionary = {}

func request(path: String, fields: Dictionary = {}) -> Dictionary:
	var http := HTTPRequest.new()
	http.timeout = 15
	http.max_redirects = 0 # Never forward credentials/cookies to a different origin.
	add_child(http)
	var headers := PackedStringArray(["User-Agent: GrupoRSCentral/Consulta"])
	var pairs := PackedStringArray()
	for key in cookies: pairs.append(str(key) + "=" + str(cookies[key]))
	if not pairs.is_empty(): headers.append("Cookie: " + "; ".join(pairs))
	var body := ""
	if not fields.is_empty():
		headers.append("Content-Type: application/x-www-form-urlencoded")
		pairs.clear()
		for key in fields: pairs.append(str(key).uri_encode() + "=" + str(fields[key]).uri_encode())
		body = "&".join(pairs)
	var error := http.request(ROOT + path, headers, HTTPClient.METHOD_GET if fields.is_empty() else HTTPClient.METHOD_POST, body)
	if error != OK:
		http.queue_free()
		return {"ok":false, "message":"Não foi possível iniciar a consulta."}
	var result: Array = await http.request_completed
	http.queue_free()
	for header in result[2]:
		if str(header).to_lower().begins_with("set-cookie:"):
			var cookie: String = str(header).substr(11).strip_edges().split(";")[0]
			var separator := cookie.find("=")
			if separator > 0: cookies[cookie.left(separator)] = cookie.substr(separator + 1)
	var text: String=decode_body.call(result[3]) if decode_body.is_valid() else result[3].get_string_from_utf8()
	return {"ok":result[0] == HTTPRequest.RESULT_SUCCESS or (result[0] == HTTPRequest.RESULT_REDIRECT_LIMIT_REACHED and int(result[1]) in [302, 303]), "code":int(result[1]), "body":text}

static func display_state(state: Dictionary, now_unix: int = 0) -> Dictionary:
	var result:=state.duplicate(true)
	var now:=now_unix if now_unix>0 else Communication._now_unix()
	if int(result.get("server_unix",0))>0 and now-int(result.server_unix)>int(result.get("communication_limit_seconds",600)):
		result.color_key="amarelo";result.label="Desatualizado";result.reason="Última comunicação acima do limite. Clique em Atualizar consulta para obter nova leitura."
	return result

func login() -> Dictionary:
	if str(credentials.get("username", "")).is_empty() or str(credentials.get("password", "")).is_empty():
		return {"ok":false, "message":"Configure o acesso ao portal de Imperatriz nas preferências."}
	cookies.clear()
	var result := await request("/login.php")
	if not result.ok: return result
	result = await request("/login.php", {"usuario":credentials.username, "senha":credentials.password})
	if not result.ok or int(result.get("code", 0)) not in [200, 302, 303]:
		return {"ok":false, "message":"Não foi possível autenticar no portal de Imperatriz."}
	authenticated = true
	return {"ok":true}

func json_get(path: String, retry: bool = true) -> Dictionary:
	if not authenticated:
		var auth := await login()
		if not auth.ok: return auth
	var result := await request(path)
	if not result.ok: return {"ok":false, "message":"Consulta indisponível ou tempo esgotado. Tente novamente."}
	var parsed: Variant = JSON.parse_string(str(result.get("body", "")))
	if int(result.get("code", 0)) != 200 or (not parsed is Array and not parsed is Dictionary):
		if retry:
			authenticated = false
			return await json_get(path, false)
		return {"ok":false, "message":"A sessão foi recusada ou a resposta da consulta é inválida."}
	return {"ok":true, "data":parsed}

func clients(query: String, branch: String) -> Dictionary:
	if branch != "imperatriz": return {"ok":false, "message":"Busca por cliente disponível em Imperatriz. Série, placa e status continuam locais nesta base."}
	var rows: Array = []
	var seen := {}
	for page in range(1, 21):
		var result := await json_get("/get_data.php?acao=clientes_select2&q=%s&term=%s&page=%d" % [query.uri_encode(), query.uri_encode(), page])
		if not result.ok: return result
		var data: Variant = result.data
		if not data is Dictionary or not data.get("items") is Array:
			return {"ok":false, "message":"Formato de clientes não reconhecido; nenhum resultado presumido."}
		for item in data.items:
			if not item is Dictionary or not item.has("id") or not item.has("text"): continue
			var id := str(int(item.id)) if str(item.id).is_valid_float() else ""
			if id == "" or int(id) <= 0 or seen.has(id): continue
			seen[id] = true
			rows.append({"id":id, "name":str(item.text).strip_edges()})
		if not bool(data.get("more", false)): return {"ok":true, "clients":rows}
	return {"ok":false, "message":"Busca ampla demais. Digite um nome mais completo."}

func links(client_id: String, branch: String) -> Dictionary:
	if branch != "imperatriz" or not client_id.is_valid_int() or int(client_id) <= 0:
		return {"ok":false, "message":"Cliente ou base inválidos."}
	var result := await json_get("/get_data.php?acao=veiculos&cliente=%s&mapa_rapido=1&leve=1" % client_id.uri_encode())
	if not result.ok: return result
	if not result.data is Array: return {"ok":false, "message":"Formato de vínculos não reconhecido."}
	var serials: Array[String] = []
	var records: Array = []
	var unresolved := 0
	for row in result.data:
		if not row is Dictionary: return {"ok":false, "message":"Vínculo inválido na resposta."}
		var serial := str(row.get("equipamento", "")).strip_edges()
		# Keep leading zeros. Numeric JSON serials cannot be safely reconstructed.
		if not row.get("equipamento") is String or serial == "":
			unresolved += 1
		else:
			if not serials.has(serial): serials.append(serial)
			records.append(row)
	return {"ok":true, "serials":serials, "records":records, "unresolved":unresolved}

static func plate_key(value: String) -> String:
	return value.strip_edges().to_upper().replace(" ", "").replace("-", "")

static func communication(row: Dictionary, now_unix: int = 0, previous: Dictionary = {}) -> Dictionary:
	var unknown := {"color_key":"cinza", "label":"Sem informação", "reason":"Comunicação não confirmada.", "server_at":"", "gps_at":"", "ignition_state":-1}
	var sample := {"server_at":row.get("DataComunicacaoServidor",row.get("UltimaComunicacao",row.get("DataComunicacao",""))), "gps_at":row.get("DataGPS",""), "ignition":row.get("ignicao"), "lat":row.get("lat"), "lng":row.get("lng")}
	if Communication.parse_datetime(sample.server_at) <= 0:
		unknown.reason="Data de comunicação ausente ou inválida."; return unknown
	var result := Communication.classify(sample, previous, now_unix)
	if result.communication_age_seconds < -60:
		unknown.reason="Data de comunicação no futuro; confira os horários."; return unknown
	if result.communication_age_seconds > result.communication_limit_seconds: result.label="Desatualizado"; return result
	if not row.has("DataGPS") or not row.has("lat") or not row.has("lng"):
		unknown.reason="Resposta incompleta: não é possível avaliar o GPS."; return unknown
	if result.color_key == "roxo": result.label="Possível falha GPS"
	elif result.ignition_state < 0:
		unknown.reason="Estado da ignição não informado."; return unknown
	elif result.color_key == "verde": result.label="Ligado"
	return result

func observe(row: Dictionary) -> Dictionary:
	var key:=str(row.get("equipamento",""))
	var result:=communication(row,0,last_communication.get(key,{}))
	if key!="": last_communication[key]=result
	return result

static func matched_record(records: Array, product: Dictionary) -> Dictionary:
	var matches: Array = []
	var plate := plate_key(str(product.get("plate", "")))
	for row in records:
		if row is Dictionary and row.get("equipamento") is String and str(row.equipamento).strip_edges()==serial(product) and plate_key(str(row.get("placa","")))==plate:
			matches.append(row)
	return matches[0] if matches.size()==1 else {}

func details(product: Dictionary, branch: String, parser: Callable) -> Dictionary:
	if branch != "imperatriz": return {"ok":false,"message":"Comunicação e associado remotos disponíveis apenas em Imperatriz."}
	if not parser.is_valid(): return {"ok":false,"message":"Leitor do portal indisponível."}
	if not authenticated:
		var auth := await login()
		if not auth.ok: return auth
	# GET only. Read the existing portal table and require BOTH exact identities.
	var response := await request("/cadastro/veiculos_listar.php?busca=%s&status=Todos" % serial(product).uri_encode())
	if not response.ok or int(response.get("code",0)) != 200:
		return {"ok":false,"message":"Não foi possível conferir o associado no portal."}
	var html := str(response.get("body",""))
	if not html.contains('id="tabelaVeiculos"'):
		authenticated=false
		return {"ok":false,"message":"Sessão expirada ou formato do portal indisponível. Busque novamente."}
	var matches: Array = []
	for row in parser.call(html):
		if str(row.get("serial",""))==serial(product) and plate_key(str(row.get("plate","")))==plate_key(str(product.get("plate",""))): matches.append(row)
	if matches.size()!=1: return {"ok":false,"message":"Vínculo não confirmado: placa e série devem corresponder exatamente e sem ambiguidade."}
	var vehicle: Dictionary=matches[0]
	var client := str(vehicle.get("client","")).strip_edges()
	var result := {"ok":true,"client":client,"communication":{},"message":"Associado confirmado no portal; comunicação indisponível."}
	if client=="": result.message="Associado não informado no portal."; return result
	var candidates := await clients(client, branch)
	if not candidates.ok: return result
	var exact: Array=candidates.clients.filter(func(item): return str(item.name).strip_edges().to_lower()==client.to_lower())
	if exact.size()>5: result.message="Homônimos demais para validar automaticamente a comunicação."; return result
	var matched: Array=[]
	for candidate in exact:
		var related := await links(str(candidate.id),branch)
		if not related.ok: return result
		var record := matched_record(related.get("records",[]),product)
		if not record.is_empty() and str(int(record.get("CodVeiculo",record.get("id",0))))==str(vehicle.get("edit_id","")):
			matched.append(record)
	if matched.size()==1:
		result.communication=observe(matched[0]); result.message="Associado: portal • comunicação: API • cadastro local preservado."
	return result

static func serial(product: Dictionary) -> String:
	var value := str(product.get("imei", "")).strip_edges()
	return value if value != "" else str(product.get("sku", "")).strip_edges()

static func local_results(products: Array, query: String, status: String, serials: Variant = null) -> Array:
	var output: Array = []
	var clean := query.strip_edges().to_lower().replace(" ", "").replace("-", "")
	for product in products:
		if not product is Dictionary: continue
		if serials != null and not serials.has(serial(product)): continue
		if status != "Todos os status" and str(product.get("tracker_status", product.get("status", ""))).to_lower() != status.to_lower(): continue
		if serials == null and clean != "":
			var plate := str(product.get("vehicle_plate", "")) + " " + str(product.get("plate", ""))
			if serial(product) != query.strip_edges() and not plate.to_lower().replace(" ", "").replace("-", "").contains(clean): continue
		output.append(product.duplicate(true))
	return output
