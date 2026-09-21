extends SceneTree
const Service = preload("res://src/services/stock_link.gd")
const View = preload("res://src/ui/stock_link.gd")
const Dashboard = preload("res://src/inventory_dashboard.gd")

class FakeStore extends RefCounted:
	var product := {"sku": "000000001", "imei": "000000001", "status": "Reserva", "tracker_status": "Reserva", "plate": "", "model": "V7.3.2"}
	func get_product(_sku: String) -> Dictionary: return product.duplicate(true)
	func get_products() -> Array: return [get_product("")]
	func reload_db_from_disk() -> Dictionary: return {}

class Host extends Control:
	var selected_branch_id := "imperatriz"
	var store := FakeStore.new()

class FakeService extends Service:
	var posts := 0
	var persisted := 0
	var linked := false
	var conflict := false
	var ambiguous := false
	var client_failure := false
	var wrong_client := false
	var switched := false
	var local_failure := false
	var late_conflict := false
	var rejected_conflict := false
	var portal_reads := 0
	var journal: Dictionary = {}
	func read_equipment(_serial: String) -> Dictionary:
		if switched: host.selected_branch_id = "maraba"
		return {"ok": true, "equipment_id": 42}
	func read_vehicle(_plate: String, _serial: String, _id: int) -> Dictionary:
		return {"ok": true, "exists": conflict or linked, "matched": linked and not conflict}
	func read_portal(_serial: String) -> Dictionary:
		portal_reads += 1
		if late_conflict and portal_reads >= 3: linked = true
		return {"ok": true, "plate": "GRS - 021" if linked else "-", "client": "Outro" if wrong_client else "RS300"}
	func read_client() -> Dictionary: return {"ok": not client_failure, "client_id": 7, "message": "Titular ambíguo"}
	func create_vehicle(payload: Dictionary) -> Dictionary:
		assert(payload == {"placa": "GRS - 021", "codEquipamento": 42, "codCliente": 7, "codTipoVeiculo": 1, "status": "A"})
		posts += 1
		linked = not ambiguous and not late_conflict and not rejected_conflict
		return {"response_code": 409 if late_conflict or rejected_conflict else (500 if ambiguous else 201)}
	func persist(_sku: String, _before: Dictionary, _plate: String) -> Dictionary:
		persisted += 1
		host.store.product.status = "Estoque"
		host.store.product.tracker_status = "Estoque"
		host.store.product.plate = "GRS - 021"
		host.store.product.client = "RS300"
		if local_failure: return fail("Conferência local pendente")
		return {"ok": true}
	func read_journal() -> Dictionary: return journal.duplicate(true)
	func write_journal(value: Dictionary) -> bool: journal = value.duplicate(true); return true

func _init() -> void: run.call_deferred()

func run() -> void:
	assert(Service.format_plate("aaa0123") == "AAA - 0123")
	assert(Service.format_plate("GRS - 021") == "GRS - 021")
	assert(Service.format_plate("ZZZ - 123") == "")
	assert(Service.eligible({"status": "Manutenção"}))
	for scenario in ["success", "maintenance", "conflict", "timeout", "client", "wrong_client", "branch", "existing", "local_failure", "late_409", "second_device", "rejected_409"]:
		var h := Host.new()
		root.add_child(h)
		var service := FakeService.new()
		service.host = h
		h.add_child(service)
		match scenario:
			"maintenance": h.store.product.status = "Manutenção"; h.store.product.tracker_status = "Manutenção"
			"conflict": service.conflict = true
			"timeout": service.ambiguous = true
			"client": service.client_failure = true
			"wrong_client": service.wrong_client = true
			"branch": service.switched = true
			"existing": service.linked = true
			"local_failure": service.local_failure = true
			"late_409": service.late_conflict = true
			"rejected_409": service.rejected_conflict = true
		var result := await service.run("000000001", "GRS - 021")
		if scenario in ["success", "maintenance", "existing", "late_409", "second_device"]:
			assert(result.ok and service.persisted == 1)
			assert(service.posts == (0 if scenario == "existing" else 1))
		elif scenario != "local_failure":
			assert(not result.ok and service.persisted == 0)
			assert(Service.eligible(h.store.product))
		if scenario == "local_failure":
			assert(not result.ok and service.local_pending().size() == 1)
			service.local_failure = false
			assert((await service.run("000000001", "GRS - 021")).ok)
			assert(service.posts == 1 and service.journal.is_empty())
		if scenario in ["timeout", "rejected_409"]:
			assert(service.posts == 1 and not service.journal.is_empty())
			assert(service.local_pending().size() == 1)
			assert(not (await service.run("000000001", "GRS - 021")).ok)
			assert(service.posts == 1)
			assert(not (await service.run("000000001", "AAA - 022")).ok)
			service.linked = true
			assert((await service.run("000000001", "GRS - 021")).ok)
			assert(service.posts == 1 and service.journal.is_empty())
		if scenario == "second_device":
			h.store.product = {"sku":"000000002", "imei":"000000002", "status":"Manutenção", "tracker_status":"Manutenção"}
			service.linked = false
			service.ambiguous = true
			assert(not (await service.run("000000002", "GRS - 021")).ok)
			assert(service.posts == 2 and service.journal.has("imperatriz:000000002"))
			service.linked = true
			assert((await service.run("000000002", "GRS - 021")).ok)
			assert(service.posts == 2 and service.journal.is_empty())
		h.free()
	print("STOCK_LINK_TEST PASS: explicit association, reserve/maintenance, collision, missing holder, wrong holder, branch isolation, durable retry fence, reconciliation")
	quit()
