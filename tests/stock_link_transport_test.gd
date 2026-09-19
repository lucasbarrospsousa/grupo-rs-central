extends SceneTree
const Service = preload("res://src/services/stock_link.gd")
class Reader extends "res://src/inventory_dashboard.gd":
	var payload: Variant = []
	var http := 200
	var client_payload: Dictionary = {}
	func _ready() -> void: pass
	func _process(_delta: float) -> void: pass
	func _grupo_rs_api_get(_path: String, _retry: bool = true, _force: bool = false) -> Dictionary:
		return {"ok": http == 200, "response_code": http, "body": JSON.stringify(payload)}
	func _modern_grupo_rs_read_get(_path: String) -> Dictionary:
		return {"ok": true, "body": JSON.stringify(client_payload)}

func _init() -> void: run.call_deferred()
func run() -> void:
	var h := Reader.new()
	h.selected_branch_id = "imperatriz"
	root.add_child(h)
	var service := Service.new()
	h.add_child(service)
	service.host = h
	service.branch = "imperatriz"
	service.bound_store = h.store
	h.payload = [{"codEquipamento":42,"numeroSerie":"000000001","ativo":"A"}]
	assert((await service.read_equipment("000000001")).equipment_id == 42)
	h.payload.append(h.payload[0].duplicate())
	assert(not (await service.read_equipment("000000001")).ok)
	h.payload = [{"codVeiculo":8,"placa":"GRS - 021"}]
	assert(not (await service.read_vehicle("GRS - 021","000000001",42)).matched)
	h.payload = [{"codVeiculo":8,"placa":"GRS - 021","codEquipamento":42,"numeroSerie":"000000001"}]
	assert((await service.read_vehicle("GRS - 021","000000001",42)).matched)
	h.payload.append(h.payload[0].duplicate())
	assert(not (await service.read_vehicle("GRS - 021","000000001",42)).ok)
	h.payload.pop_back()
	h.payload[0].numeroSerie = "000000002"
	assert(not (await service.read_vehicle("GRS - 021","000000001",42)).matched)
	h.payload = {"error":"query failed"}
	assert(not (await service.read_vehicle("GRS - 021","000000001",42)).ok)
	h.client_payload = {"results":[{"id":7,"text":"RS300 similar"}]}
	assert(not (await service.read_client()).ok)
	h.client_payload = {"results":[{"id":7,"text":"RS300"}]}
	assert((await service.read_client()).client_id == 7)
	h.client_payload.results.append({"id":9,"text":"RS300"})
	assert(not (await service.read_client()).ok)
	service.journal_path = "user://synthetic-link-journal.json"
	assert(service.write_journal({"synthetic":{"plate":"GRS - 021"}}))
	assert(service.read_journal().synthetic.plate == "GRS - 021")
	h.free()
	print("STOCK_LINK_TRANSPORT PASS: exact serial, duplicate rejection, plate-only insufficient, mismatched serial, explicit API errors, unique exact holder, journal persistence")
	quit()
