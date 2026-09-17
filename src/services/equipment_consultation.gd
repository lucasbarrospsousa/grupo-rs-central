extends Node
## Read-only portal lookup. Credentials/session stay in memory; no inventory writes.
const ROOT := "https://imp.ogrupors.com.br"
var credentials: Dictionary = {}
var cookies: Dictionary = {}
var authenticated := false

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
	return {"ok":result[0] == HTTPRequest.RESULT_SUCCESS or (result[0] == HTTPRequest.RESULT_REDIRECT_LIMIT_REACHED and int(result[1]) in [302, 303]), "code":int(result[1]), "body":result[3].get_string_from_utf8()}

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
	var unresolved := 0
	for row in result.data:
		if not row is Dictionary: return {"ok":false, "message":"Vínculo inválido na resposta."}
		var serial := str(row.get("equipamento", "")).strip_edges()
		# Keep leading zeros. Numeric JSON serials cannot be safely reconstructed.
		if not row.get("equipamento") is String or serial == "":
			unresolved += 1
		elif not serials.has(serial): serials.append(serial)
	return {"ok":true, "serials":serials, "unresolved":unresolved}

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
