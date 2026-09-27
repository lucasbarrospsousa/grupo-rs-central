extends "res://src/services/equipment_consultation.gd"
## Read-only JSON endpoints of the authenticated portal; no remote mutations.
func vehicles(client_id: String, branch: String) -> Dictionary:
	if branch != "imperatriz" or not client_id.is_valid_int() or int(client_id) <= 0:
		return {"ok": false, "message": "Consulta disponível em Imperatriz com cliente selecionado."}
	var response := await json_get("/get_data.php?acao=veiculos&cliente=%s&mapa_rapido=1&leve=1" % client_id.uri_encode())
	if not response.ok: return response
	return normalize_vehicles(response.data)

static func normalize_vehicles(data: Variant) -> Dictionary:
	if not data is Array: return {"ok": false, "message": "Resposta de veículos inválida. Tente novamente."}
	var rows: Array = []
	var seen := {}
	for raw in data:
		if not raw is Dictionary: return {"ok": false, "message": "Resposta de veículos incompleta."}
		var plate := str(raw.get("placa", "")).strip_edges()
		var key := plate_key(plate)
		if key == "" or seen.has(key): return {"ok": false, "message": "Placa ausente ou vínculo ambíguo. Confira na plataforma."}
		seen[key] = true
		var device := str(raw.get("equipamento", "")).strip_edges() if raw.get("equipamento") is String else ""
		rows.append({"plate": plate, "serial": device, "vehicle_id": str(raw.get("CodVeiculo", raw.get("id", ""))), "model": str(raw.get("modelo", ""))})
	return {"ok": true, "vehicles": rows}
