extends Node
## Only this explicit, confirmed workflow may create a test association.
signal progress(message: String)
signal finished(result: Dictionary)
var host: Node
var busy := false
var last_result: Dictionary = {}
var branch := ""
var bound_store: Variant
var journal_path := "user://stock_link_pending.json"

static func eligible(product: Dictionary) -> bool:
	return str(product.get("tracker_status", product.get("status", ""))).to_lower().replace("ç", "c").replace("ã", "a") in ["reserva", "manutencao"]

static func plate_key(value: String) -> String:
	return value.strip_edges().to_upper().replace(" ", "").replace("-", "")

static func format_plate(value: String) -> String:
	var key := plate_key(value)
	var regex := RegEx.new()
	regex.compile("^(AAA|GRS|XRS)-?[0-9]{1,6}$")
	return key.substr(0, 3) + " - " + key.substr(3) if regex.search(key) != null else ""

func valid_context() -> bool:
	return host.selected_branch_id == branch and host.store == bound_store

func fail(message: String) -> Dictionary:
	return {"ok": false, "message": message}

func run(sku: String, requested_plate: String) -> Dictionary:
	if busy: return fail("Já existe uma vinculação em andamento.")
	if host.selected_branch_id != "imperatriz": return fail("Vinculação disponível somente em Imperatriz nesta versão.")
	busy = true
	branch = str(host.selected_branch_id)
	bound_store = host.store
	last_result = await execute(sku, requested_plate)
	busy = false
	finished.emit(last_result)
	return last_result

func execute(sku: String, requested_plate: String) -> Dictionary:
	var plate := format_plate(requested_plate)
	if plate == "": return fail("Informe uma identificação AAA, GRS ou XRS seguida do número.")
	if bound_store == null: return fail("Banco local indisponível.")
	var before: Dictionary = bound_store.get_product(sku).duplicate(true)
	var serial := str(before.get("imei", before.get("equipment_number", sku))).strip_edges()
	if serial == "" or not serial.is_valid_int(): return fail("Número de série inválido.")
	var journal := read_journal()
	if journal.has("_invalid"): return fail("Registro de tentativa pendente ilegível. Nenhuma gravação remota foi feita.")
	var key := branch + ":" + serial
	var local_recovery: bool = journal.has(key) and str(before.get("status", "")) == "Estoque" and plate_key(str(before.get("plate", ""))) == plate_key(plate) and str(before.get("client", "")).to_upper() == "RS300"
	if not eligible(before) and not local_recovery: return fail("Selecione um aparelho em Reserva ou Manutenção.")
	if journal.has(key) and str(journal[key].get("plate", "")) != plate:
		return fail("Há uma tentativa anterior para %s. Confira essa identificação antes de usar outra." % str(journal[key].get("plate", "")))
	progress.emit("Conferindo aparelho e disponibilidade da identificação…")
	var equipment := await read_equipment(serial)
	if not valid_context(): return fail("A filial mudou; operação interrompida.")
	if not equipment.get("ok", false): return equipment
	var equipment_id := int(equipment.get("equipment_id", 0))
	if equipment_id <= 0: return fail("A API não identificou o código exato do aparelho.")
	var vehicle := await read_vehicle(plate, serial, equipment_id)
	if not valid_context(): return fail("A filial mudou; operação interrompida.")
	if not vehicle.get("ok", false): return vehicle
	var portal := await read_portal(serial)
	if not valid_context(): return fail("A filial mudou; operação interrompida.")
	if not portal.get("ok", false): return portal
	var already_confirmed: bool = vehicle.get("matched", false) and portal_matches(portal, plate)
	if not already_confirmed:
		if vehicle.get("exists", false) or not str(portal.get("plate", "")).strip_edges() in ["", "-"]:
			return fail("A identificação ou o aparelho já possui vínculo diferente. Nenhuma associação foi substituída.")
		if journal.has(key): return fail("Tentativa anterior ainda sem confirmação. O envio não foi repetido; confira a plataforma e tente consultar novamente.")
		var client := await read_client()
		if not valid_context(): return fail("A filial mudou; operação interrompida.")
		if not client.get("ok", false): return client
		if not unchanged(sku, before): return fail("O cadastro local mudou. Selecione o aparelho novamente.")
		journal[key] = {"plate": plate, "created_at": Time.get_datetime_string_from_system(true)}
		if not write_journal(journal): return fail("Não foi possível registrar a tentativa com segurança. Nenhum vínculo foi enviado.")
		progress.emit("Criando vínculo com RS300…")
		var sent := await create_vehicle({"placa": plate, "codEquipamento": equipment_id, "codCliente": int(client.client_id), "codTipoVeiculo": 1, "status": "A"})
		if not valid_context(): return fail("A filial mudou após o envio. Confirmação pendente; não repita o cadastro.")
		# Even a timeout/500 can follow an accepted write. Always read; never replay.
		progress.emit("Confirmando série, identificação e titular na plataforma…")
		vehicle = await read_vehicle(plate, serial, equipment_id)
		if not valid_context(): return fail("A filial mudou; confirmação pendente.")
		portal = await read_portal(serial)
		if not valid_context(): return fail("A filial mudou; confirmação pendente.")
		# The write and the two read indexes do not necessarily become visible together.
		# Retry reads only; a 409 must never trigger a second creation or reassignment.
		for attempt in range(2):
			if vehicle.get("matched", false) and portal_matches(portal, plate): break
			if int(sent.get("response_code", 0)) not in [0, 200, 201, 202, 409, 500, 502, 503, 504]: break
			progress.emit("Aguardando confirmação da plataforma · conferência %d de 3…" % (attempt + 2))
			await get_tree().create_timer(0.8).timeout
			if not valid_context(): return fail("A filial mudou; confirmação pendente.")
			vehicle = await read_vehicle(plate, serial, equipment_id)
			if not valid_context(): return fail("A filial mudou; confirmação pendente.")
			portal = await read_portal(serial)
			if not valid_context(): return fail("A filial mudou; confirmação pendente.")
		if not vehicle.get("ok", false) or not vehicle.get("matched", false) or not portal_matches(portal, plate):
			# Definitive rejections may be retried after fixing access/input. Ambiguous
			# transport errors retain the durable fence across restarts.
			if int(sent.get("response_code", 0)) in [400, 401, 403, 404, 405, 422] and vehicle.get("ok", false) and not vehicle.get("exists", false) and portal.get("ok", false) and str(portal.get("plate", "")).strip_edges() in ["", "-"]:
				journal.erase(key)
				if not write_journal(journal): return fail("Rejeição da plataforma; a pendência não pôde ser atualizada. Consulte novamente antes de tentar criar o vínculo.")
				return fail("A plataforma rejeitou o cadastro (HTTP %s). Nenhum vínculo foi encontrado. Revise os dados e o acesso antes de tentar novamente." % str(sent.get("response_code", 0)))
			if vehicle.get("matched", false):
				return fail("A API confirmou %s → %s; falta confirmar o titular RS300 no portal. Use Conferir pendência. O cadastro não será enviado novamente." % [serial, plate])
			if int(sent.get("response_code", 0)) == 409:
				return fail("A plataforma informou conflito (HTTP 409). O vínculo ainda não foi confirmado nas consultas. Use Conferir pendência para consultar novamente; nenhuma associação será substituída.")
			return fail("Confirmação pendente (HTTP %s). Use Conferir pendência para consultar novamente. Cadastro local preservado; nenhum envio será repetido." % str(sent.get("response_code", 0)))
	if not unchanged(sku, before): return fail("Vínculo remoto confirmado, mas o cadastro local mudou. Confira o aparelho antes de concluir o estoque.")
	progress.emit("Salvando e conferindo Estoque no banco local…")
	var saved := await persist(sku, before, plate)
	if not saved.get("ok", false): return saved
	journal.erase(key)
	write_journal(journal)
	return {"ok": true, "serial": serial, "plate": plate, "client": "RS300", "message": "%s · %s · RS300 — confirmado em Estoque." % [serial, plate]}

func local_pending() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var journal := read_journal()
	if host.store == null: return result
	for product in host.store.get_products():
		var serial := str(product.get("imei", product.get("sku", "")))
		var key := str(host.selected_branch_id) + ":" + serial
		if journal.has(key) and (eligible(product) or str(product.get("status", "")) == "Estoque"):
			result.append({"sku": product.get("sku", ""), "serial": serial, "plate": journal[key].get("plate", "")})
	return result

func unchanged(sku: String, before: Dictionary) -> bool:
	return valid_context() and bound_store.get_product(sku) == before

func portal_matches(row: Dictionary, plate: String) -> bool:
	return row.get("ok", false) and plate_key(str(row.get("plate", ""))) == plate_key(plate) and str(row.get("client", "")).strip_edges().to_upper() == "RS300"

func read_equipment(serial: String) -> Dictionary:
	var response: Dictionary = await host._grupo_rs_api_get("/endpoints/equipamentos.php?q=%s&skip=0&take=50" % serial.uri_encode(), true, true)
	if not response.get("ok", false): return fail("Não foi possível consultar o aparelho na API.")
	var body: Variant = JSON.parse_string(str(response.get("body", "")))
	if not (body is Dictionary or body is Array) or host._grupo_rs_api_response_has_explicit_failure(response): return fail("Resposta inválida da API de aparelhos.")
	var rows: Array = host._grupo_rs_api_equipment_rows(body)
	if rows.size() >= 50: return fail("Busca de aparelhos ampla demais para confirmar uma única série.")
	var matches: Array = []
	for row in rows:
		if host._grupo_rs_api_serial_from_row(row) == serial: matches.append(row)
	if matches.size() != 1: return fail("A API não confirmou um único aparelho para essa série.")
	if host._grupo_rs_api_equipment_is_inactive(matches[0]): return fail("O aparelho está inativo na plataforma.")
	return {"ok": true, "equipment_id": host._grupo_rs_api_equipment_id_from_row(matches[0], true)}

func read_vehicle(plate: String, serial: String, equipment_id: int) -> Dictionary:
	var found: Array = []
	# The serial index may already expose a link while the plate index is stale.
	for query in [plate, plate_key(plate), serial]:
		var response: Dictionary = await host._grupo_rs_api_get("/endpoints/veiculos.php?q=%s&skip=0&take=50" % query.uri_encode(), true, true)
		if not valid_context(): return fail("A filial mudou.")
		if not response.get("ok", false): return fail("Não foi possível verificar a disponibilidade da identificação.")
		var payload: Variant = JSON.parse_string(str(response.get("body", "")))
		if not (payload is Dictionary or payload is Array) or host._grupo_rs_api_response_has_explicit_failure(response): return fail("Resposta inválida ao consultar vínculos.")
		var rows: Array = host._grupo_rs_api_extract_rows(payload)
		if rows.size() >= 50: return fail("Consulta de identificação ampla demais. Nenhum vínculo foi criado.")
		for raw in rows:
			var row: Dictionary = host._grupo_rs_api_normalize_location(raw)
			if plate_key(str(row.get("plate", ""))) == plate_key(plate) or (query == serial and str(row.get("serial", "")) == serial): found.append(row)
		if not found.is_empty(): break
	if found.size() > 1: return fail("Há mais de um vínculo para a identificação.")
	if found.is_empty(): return {"ok": true, "exists": false, "matched": false}
	var row: Dictionary = found[0]
	var remote_serial := str(row.get("serial", ""))
	var remote_id := str(row.get("equipment_id", ""))
	var matches := plate_key(str(row.get("plate", ""))) == plate_key(plate) and (remote_serial == serial or remote_id == str(equipment_id)) and (remote_serial == "" or remote_serial == serial) and (remote_id == "" or remote_id == str(equipment_id))
	return {"ok": true, "exists": true, "matched": matches}

func read_portal(serial: String) -> Dictionary:
	var response: Dictionary = await host._modern_grupo_rs_read_get("equipamentos_listar.php?busca=%s&status=todos" % serial.uri_encode())
	var html := str(response.get("body", ""))
	if not response.get("ok", false) or host._modern_grupo_rs_page_is_login(html): return fail("Não foi possível confirmar o aparelho no portal.")
	var row: Dictionary = host._choose_modern_grupo_rs_equipment_row_by_serial_exact(host._parse_grupo_rs_equipment_rows(html), serial)
	if row.is_empty(): return fail("O portal não confirmou uma única série.")
	return {"ok": true, "plate": row.get("plate", ""), "client": row.get("client", "")}

func read_client() -> Dictionary:
	var response: Dictionary = await host._modern_grupo_rs_read_get(host._grupo_rs_client_lookup_url("RS300"))
	var parsed: Variant = JSON.parse_string(str(response.get("body", "")))
	if not response.get("ok", false) or not parsed is Dictionary: return fail("Não foi possível consultar o titular RS300.")
	var matches: Array = []
	for item in parsed.get("items", parsed.get("results", [])):
		if item is Dictionary and str(item.get("text", "")).strip_edges().to_upper() == "RS300": matches.append(item)
	if matches.size() != 1 or int(matches[0].get("id", 0)) <= 0: return fail("O catálogo não confirmou um único titular RS300.")
	return {"ok": true, "client_id": int(matches[0].id)}

func create_vehicle(payload: Dictionary) -> Dictionary:
	return await host._grupo_rs_api_json_request("/endpoints/veiculos.php", HTTPClient.METHOD_POST, payload, false)

func persist(sku: String, before: Dictionary, plate: String) -> Dictionary:
	var product := before.duplicate(true)
	product.merge({"plate": plate, "identification_plate": plate, "vehicle_plate": "", "client": "RS300", "tracker_status": "Estoque", "status": "Estoque", "location": "Estoque", "stock": 1, "active": true, "remote_registration_status": "vinculo_confirmado_api"}, true)
	if product.has("quantity"): product.quantity = 1
	if str(product.get("model", "")).to_lower() in ["", "rs300", "não informado", "-"]:
		product.model = preload("res://src/tracker_versions.gd").from_plate(plate)
	var saved: Dictionary = bound_store.upsert_product_replacing_sku(sku, product)
	if saved.is_empty(): return fail("Vínculo confirmado; banco local não confirmou a gravação. Consulte novamente para concluir.")
	var verified: Dictionary = await host._ensure_local_database_modification_saved(sku, saved)
	if not verified.get("ok", false): return fail("Vínculo confirmado; conferência do banco local pendente. Não crie outro vínculo.")
	host._log_system_action("Vinculação para estoque", "Série %s | %s | RS300 | origem API e conferência web | situação anterior: %s" % [sku, plate, str(before.get("status", ""))], sku)
	return {"ok": true}

func read_journal() -> Dictionary:
	if not FileAccess.file_exists(journal_path): return {}
	var value: Variant = JSON.parse_string(FileAccess.get_file_as_string(journal_path))
	return value if value is Dictionary else {"_invalid": true}

func write_journal(value: Dictionary) -> bool:
	var file := FileAccess.open(journal_path, FileAccess.WRITE)
	if file == null: return false
	file.store_string(JSON.stringify(value))
	file.flush()
	var error := file.get_error()
	file.close()
	return error == OK
