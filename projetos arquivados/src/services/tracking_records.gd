extends "res://src/services/equipment_consultation.gd"
## Explicit, read-only history requests. No inventory, SMS or persistent cache writes.
const MAX_RANGE := 7 * 86400
const MAX_ROWS := 20000

static func datetime_value(text: String) -> int:
	var expression := RegEx.new()
	expression.compile("^(\\d{2})/(\\d{2})/(\\d{4}) (\\d{2}):(\\d{2})(?::(\\d{2}))?$")
	var match_value := expression.search(text.strip_edges())
	if match_value == null: return 0
	var year:=int(match_value.get_string(3));var month:=int(match_value.get_string(2));var day:=int(match_value.get_string(1))
	if year<1970 or year>2100 or month<1 or month>12 or day<1:return 0
	var days:=[31,29 if year%4==0 and (year%100!=0 or year%400==0) else 28,31,30,31,30,31,31,30,31,30,31]
	if day>days[month-1] or int(match_value.get_string(4))>23 or int(match_value.get_string(5))>59 or int(match_value.get_string(6))>59:return 0
	var stamp := "%s-%s-%sT%s:%s:%s" % [match_value.get_string(3), match_value.get_string(2), match_value.get_string(1), match_value.get_string(4), match_value.get_string(5), match_value.get_string(6) if match_value.get_string(6) != "" else "00"]
	var parsed := Time.get_unix_time_from_datetime_string(stamp)
	return parsed if parsed > 0 and Time.get_datetime_string_from_unix_time(parsed) == stamp else 0

static func period(start: String, end: String) -> Dictionary:
	var first := datetime_value(start)
	var last := datetime_value(end)
	if first <= 0 or last <= 0: return {"ok":false,"message":"Informe datas válidas: dd/mm/aaaa hh:mm."}
	if last < first: return {"ok":false,"message":"O fim deve ser igual ou posterior ao início."}
	if last - first > MAX_RANGE: return {"ok":false,"message":"Consulte até 7 dias por vez para evitar uma busca excessiva."}
	return {"ok":true,"start":Time.get_datetime_string_from_unix_time(first).replace("T"," "),"end":Time.get_datetime_string_from_unix_time(last).replace("T"," "),"first":first,"last":last}

func resolve(product: Dictionary, branch: String, parser: Callable) -> Dictionary:
	if branch != "imperatriz": return {"ok":false,"message":"Registros disponíveis nesta versão apenas para Imperatriz."}
	if serial(product) == "" or plate_key(str(product.get("plate",""))) == "": return {"ok":false,"message":"O equipamento precisa de série e placa para confirmar o vínculo."}
	if not authenticated:
		var auth := await login()
		if not auth.ok: return auth
	var response := await request("/cadastro/veiculos_listar.php?busca=%s&status=Todos" % serial(product).uri_encode())
	if not response.ok or response.get("code",0) != 200: return {"ok":false,"message":"Não foi possível confirmar o veículo no portal."}
	if not str(response.body).contains('id="tabelaVeiculos"'):
		authenticated = false
		return {"ok":false,"message":"Sessão expirada ou resposta inválida. Busque novamente."}
	var matches: Array = []
	for vehicle in parser.call(response.body):
		if str(vehicle.get("serial","")) == serial(product) and plate_key(str(vehicle.get("plate",""))) == plate_key(str(product.plate)): matches.append(vehicle)
	if matches.size() != 1: return {"ok":false,"message":"Não foi possível confirmar uma única associação exata de placa e série."}
	var vehicle: Dictionary = matches[0]
	var name_value := str(vehicle.get("client",""))
	if name_value == "": return {"ok":false,"message":"Veículo sem associado confirmado."}
	var candidates := await clients(name_value, branch)
	if not candidates.ok: return candidates
	var exact: Array = candidates.clients.filter(func(item): return str(item.name).strip_edges().to_lower() == name_value.strip_edges().to_lower())
	if exact.size() > 5: return {"ok":false,"message":"Vários homônimos: vínculo não confirmado automaticamente."}
	var verified: Array = []
	for candidate in exact:
		var related := await links(str(candidate.id), branch)
		if not related.ok: return related
		var record := matched_record(related.get("records",[]), product)
		if not record.is_empty() and str(int(record.get("CodVeiculo",record.get("id",0)))) == str(vehicle.get("edit_id","")):
			verified.append({"ok":true,"client_id":str(candidate.id),"vehicle_id":str(vehicle.edit_id),"client":name_value,"plate":str(product.plate),"serial":serial(product)})
	return verified[0] if verified.size() == 1 else {"ok":false,"message":"Vínculo do associado não confirmado. Nenhum histórico consultado."}

static func query(context: Dictionary, window: Dictionary) -> String:
	return "cliente=%s&veiculo=%s&inicio=%s&fim=%s" % [str(context.client_id).uri_encode(),str(context.vehicle_id).uri_encode(),str(window.start).uri_encode(),str(window.end).uri_encode()]

func read_bytes(path: String) -> Dictionary:
	# Only the two known read endpoints; never accept an arbitrary host or redirect.
	if not path.begins_with("/get_eventos.php?") and not path.begins_with("/exportar_pdf.php?"):
		return {"ok":false,"message":"Consulta não autorizada."}
	var http := HTTPRequest.new()
	http.timeout = 40; http.max_redirects = 0; http.body_size_limit = 16 * 1024 * 1024
	add_child(http)
	var pairs := PackedStringArray()
	for key in cookies: pairs.append(str(key) + "=" + str(cookies[key]))
	var headers := PackedStringArray(["User-Agent: GrupoRSCentral/Registros", "Cookie: " + "; ".join(pairs)])
	var error := http.request(ROOT + path, headers)
	if error != OK:
		http.queue_free(); return {"ok":false,"message":"Não foi possível iniciar a consulta."}
	var response: Array = await http.request_completed
	http.queue_free()
	if response[0] != HTTPRequest.RESULT_SUCCESS or response[1] != 200:
		return {"ok":false,"message":"Consulta indisponível, sessão expirada ou limite de resposta excedido. Reduza o período e tente novamente."}
	return {"ok":true,"bytes":response[3]}

func history(context: Dictionary, window: Dictionary, branch: String) -> Dictionary:
	if branch != "imperatriz" or not context.get("ok",false) or not window.get("ok",false): return {"ok":false,"message":"Confirme veículo, base e período antes da consulta."}
	var response := await read_bytes("/get_eventos.php?" + query(context,window))
	if not response.ok: return response
	var body: String = decode_body.call(response.bytes) if decode_body.is_valid() else response.bytes.get_string_from_utf8()
	var payload: Variant = JSON.parse_string(body)
	return normalize(payload, context)

static func number(value: Variant) -> Variant:
	if value == null: return null
	var text := str(value).strip_edges().replace(",", ".")
	if not text.is_valid_float(): return null
	var result := float(text)
	return result if is_finite(result) else null

static func event_time(value: Variant) -> int:
	var text := str(value).strip_edges()
	if text.contains("/"): return datetime_value(text)
	return Communication.parse_datetime(text)

static func normalize(payload: Variant, context: Dictionary) -> Dictionary:
	if not payload is Dictionary or not payload.get("eventos") is Array:
		return {"ok":false,"message":"A plataforma não retornou um histórico válido. Isso não significa ausência de registros."}
	if payload.get("success",true)==false or payload.has("error") or payload.has("erro"):
		return {"ok":false,"message":"A plataforma informou falha na consulta; histórico não confirmado."}
	if payload.eventos.size() > MAX_ROWS: return {"ok":false,"message":"Histórico muito grande. Reduza o período (limite de 20 mil registros)."}
	var rows: Array = []
	var seen := {}
	var maximum: Variant = null
	var memory_count := 0
	for raw in payload.eventos:
		if not raw is Dictionary: return {"ok":false,"message":"Registro inválido na resposta; consulta interrompida."}
		if str(int(raw.get("cod_veiculo",0))) != str(context.get("vehicle_id","")):
			return {"ok":false,"message":"A resposta contém um veículo não confirmado. Histórico descartado."}
		var identity := str(raw.get("id",""))
		if identity != "" and seen.has(identity): continue
		if identity != "": seen[identity] = true
		var row: Dictionary = raw.duplicate(true)
		row.gps_time = event_time(raw.get("data_completa",raw.get("data","")))
		row.server_time = event_time(raw.get("data_comunicacao",raw.get("DataComunicacao","")))
		row.is_memory = str(raw.get("memoria",raw.get("Memoria",0))) in ["1","1.0","true"]
		if row.is_memory: memory_count += 1
		row.speed = number(raw.get("velocidade"))
		if row.speed != null and row.speed >= 0: maximum = row.speed if maximum == null else maxf(maximum,row.speed)
		rows.append(row)
	rows.sort_custom(func(a,b): return a.gps_time > b.gps_time if a.gps_time != b.gps_time else a.server_time > b.server_time)
	var reported: Variant = number(payload.get("total"))
	var partial := reported != null and int(reported) > rows.size()
	return {"ok":true,"rows":rows,"distance":number(payload.get("totalPercorrido")),"maximum":maximum,"memory_count":memory_count,"partial":partial,"reported_total":reported,"source":"Plataforma web • Imperatriz"}

static func coordinates(row: Dictionary) -> Dictionary:
	var lat: Variant = number(row.get("lat"))
	var lng: Variant = number(row.get("lng"))
	if lat == null or lng == null: return {}
	if absf(lat)>85.0511 or absf(lng)>180 or (lat==0 and lng==0): return {}
	return {"lat":lat,"lng":lng}

func pdf(context: Dictionary, window: Dictionary, branch: String) -> Dictionary:
	if branch != "imperatriz" or not context.get("ok",false) or not window.get("ok",false): return {"ok":false,"message":"Consulta não confirmada."}
	var response := await read_bytes("/exportar_pdf.php?" + query(context,window))
	if not response.ok: return response
	var bytes: PackedByteArray = response.bytes
	if bytes.size()<5 or bytes.slice(0,5).get_string_from_ascii() != "%PDF-": return {"ok":false,"message":"A plataforma não retornou um PDF válido."}
	return response
