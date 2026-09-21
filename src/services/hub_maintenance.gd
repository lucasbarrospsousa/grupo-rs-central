extends Node
## Read-only, one independent session per branch. Nothing is persisted.
const ORIGINS := {"imperatriz":"https://imp.ogrupors.com.br", "araguaina":"https://arg.ogrupors.com.br", "maraba":"https://mab.ogrupors.com.br", "acailandia":"https://acl.ogrupors.com.br"}
var branch := ""
var credentials: Dictionary = {}
var cookies: Dictionary = {}
var decode_body: Callable

func request(path: String, fields: Dictionary = {}) -> Dictionary:
	if not ORIGINS.has(branch): return {"ok":false, "message":"Base desconhecida."}
	var http := HTTPRequest.new()
	http.timeout = 12
	http.max_redirects = 0
	add_child(http)
	var headers := PackedStringArray(["User-Agent: GrupoRSCentral/HubConsulta"])
	var pairs := PackedStringArray()
	for key in cookies: pairs.append(str(key) + "=" + str(cookies[key]))
	if not pairs.is_empty(): headers.append("Cookie: " + "; ".join(pairs))
	pairs.clear()
	for key in fields: pairs.append(str(key).uri_encode() + "=" + str(fields[key]).uri_encode())
	if not fields.is_empty(): headers.append("Content-Type: application/x-www-form-urlencoded")
	var error := http.request(str(ORIGINS[branch]) + path, headers, HTTPClient.METHOD_GET if fields.is_empty() else HTTPClient.METHOD_POST, "&".join(pairs))
	if error != OK:
		http.queue_free()
		return {"ok":false, "message":"Não foi possível iniciar a consulta."}
	var response: Array = await http.request_completed
	http.queue_free()
	for header in response[2]:
		if str(header).to_lower().begins_with("set-cookie:"):
			var cookie := str(header).substr(11).strip_edges().split(";")[0]
			var split := cookie.find("=")
			if split > 0: cookies[cookie.left(split)] = cookie.substr(split + 1)
	var code := int(response[1])
	var ok: bool = response[0] == HTTPRequest.RESULT_SUCCESS or (response[0] == HTTPRequest.RESULT_REDIRECT_LIMIT_REACHED and code in [302, 303])
	return {"ok":ok, "code":code, "body":decode_body.call(response[3]) if decode_body.is_valid() else response[3].get_string_from_utf8(), "message":"Plataforma indisponível ou tempo esgotado."}

func fetch() -> Dictionary:
	if str(credentials.get("username", "")).is_empty() or str(credentials.get("password", "")).is_empty():
		return {"ok":false, "message":"Configure o acesso desta base nas preferências."}
	cookies.clear()
	var response := await request("/login.php")
	if not response.ok: return failure(response.message)
	response = await request("/login.php", {"usuario":credentials.username, "senha":credentials.password})
	if not response.ok or int(response.get("code", 0)) not in [200, 302, 303]: return failure("Autenticação indisponível ou recusada.")
	response = await request("/get_veiculos_intervalo.php?intervalo=Manutencao")
	if not response.ok: return failure(response.message)
	if int(response.get("code", 0)) != 200: return failure("Sessão recusada ou expirada; confira o acesso desta base.")
	var result := parse(str(response.body))
	result["source"] = ORIGINS[branch]
	if result.ok: result["queried_at"] = Time.get_datetime_string_from_system().replace("T", " ")
	return result

func failure(message: String) -> Dictionary:
	return {"ok":false, "message":message, "source":ORIGINS.get(branch, "")}

static func plain(html: String) -> String:
	var tags := RegEx.new()
	tags.compile("(?s)<[^>]*>")
	return tags.sub(html, "", true).xml_unescape().replace("&nbsp;", " ").replace("&atilde;", "ã").replace("&ccedil;", "ç").replace("&iacute;", "í").strip_edges()

static func parse(html: String) -> Dictionary:
	var invalid := {"ok":false, "message":"Resposta incompleta ou formato não reconhecido; total não confirmado."}
	if html.to_lower().contains('type="password"') or html.to_lower().contains("txtsenha"): return {"ok":false, "message":"Sessão recusada ou expirada; confira o acesso desta base."}
	var total_pattern := RegEx.new()
	total_pattern.compile("(?i)Ve[ií]culos\\s*\\(\\s*([0-9.]+)\\s*\\)")
	var total_match := total_pattern.search(plain(html))
	if total_match == null: return invalid
	var expected := int(total_match.get_string(1).replace(".", ""))
	var body_pattern := RegEx.new()
	body_pattern.compile("(?is)<tbody[^>]*>(.*?)</tbody>")
	var body_match := body_pattern.search(html)
	if body_match == null: return invalid
	var rows: Array = []
	var tr := RegEx.new()
	tr.compile("(?is)<tr[^>]*>(.*?)</tr>")
	var td := RegEx.new()
	td.compile("(?is)<td[^>]*>(.*?)</td>")
	for row_match in tr.search_all(body_match.get_string(1)):
		var cells := td.search_all(row_match.get_string(1))
		if cells.size() < 6: continue
		var row := {}
		var keys := ["client", "plate", "serial", "apn", "phone", "updated_at"]
		for index in range(6): row[keys[index]] = plain(cells[index].get_string(1))
		rows.append(row)
	if rows.size() != expected: return invalid
	return {"ok":true, "rows":rows, "count":rows.size()}

static func color_for(count: int, counts: Array) -> Color:
	var unique: Array = []
	for value in counts:
		if not unique.has(int(value)): unique.append(int(value))
	unique.sort()
	var colors := [Color("#20ad66"), Color("#e9b91d"), Color("#f18b22"), Color("#e64750")]
	var index := unique.find(count)
	return colors[0 if unique.size() <= 1 else roundi(float(index) * 3.0 / float(unique.size() - 1))]
