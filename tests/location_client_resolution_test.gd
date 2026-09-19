extends SceneTree
const Dashboard = preload("res://src/inventory_dashboard.gd")
class Fake extends Dashboard:
	var vehicle_result: Dictionary = {"ok": false, "not_found": true}
	var portal_result: Dictionary = {"ok": true, "body": "synthetic"}
	var portal_rows: Array[Dictionary] = []
	var api_enabled := true
	var portal_enabled := true
	var vehicle_calls := 0
	var portal_calls := 0
	var switch_branch := false
	var clicked: Array = []
	func _grupo_rs_api_reads_enabled() -> bool: return api_enabled
	func _grupo_rs_platform_reads_enabled() -> bool: return portal_enabled
	func _grupo_rs_api_find_vehicle(plate: String = "", serial: String = "", force_read: bool = true, allow_full_scan: bool = true) -> Dictionary:
		assert(plate == "ABC1D23" and serial == "000000001" and force_read and not allow_full_scan)
		vehicle_calls += 1
		if switch_branch: selected_branch_id = "maraba"
		return vehicle_result
	func _modern_grupo_rs_read_get(path: String) -> Dictionary:
		assert(path == "equipamentos_listar.php?busca=000000001&status=todos")
		portal_calls += 1
		return portal_result
	func _parse_grupo_rs_equipment_rows(_html: String) -> Array[Dictionary]: return portal_rows
	func _show_location_lookup(serial: String, fallback_plate: String = "", fallback_client: String = "") -> void:
		clicked = [serial, fallback_plate, fallback_client]

func _init() -> void:
	create_timer(25).timeout.connect(func(): push_error("Client resolution timeout"); quit(1))
	run.call_deferred()

func run() -> void:
	var h := Fake.new()
	h.selected_branch_id = "imperatriz"
	var data := {"ok": true, "serial": "000000001", "plate": "ABC1D23", "client": ""}
	var known := data.duplicate()
	known.client = "Cliente conhecido"
	assert((await h._complete_location_client(known)).client == "Cliente conhecido" and h.vehicle_calls == 0)
	h.vehicle_result = {"ok": true, "row": {"client": "Cliente da API"}}
	assert((await h._complete_location_client(data)).client == "Cliente da API" and h.portal_calls == 0)
	h.vehicle_result = {"ok": true, "row": {"client": ""}}
	h.portal_rows = [{"serial": "999999999", "plate": "ABC1D23", "client": "Outro"}, {"serial": "000000001", "plate": "ABC-1D23", "client": "Cliente do portal"}]
	assert((await h._complete_location_client(data)).client == "Cliente do portal")
	var before_api := h.vehicle_calls
	assert((await h._complete_location_client(data, true)).client == "Cliente do portal")
	assert(h.vehicle_calls == before_api)
	# An existing name may be stale; web verification must replace it.
	assert((await h._complete_location_client(known, true)).client == "Cliente do portal")
	h.portal_rows.append(h.portal_rows[1].duplicate())
	assert((await h._complete_location_client(data)).client == "")
	h.portal_rows = [{"serial": "000000001", "plate": "XYZ9Z99", "client": "Vínculo diferente"}]
	assert((await h._complete_location_client(data)).client == "")
	h.portal_result = {"ok": false}
	assert((await h._complete_location_client(data)).client_lookup_status == "unavailable")
	var failed: Dictionary = await h._complete_location_client(known, true)
	assert(failed.client == "" and failed.client_lookup_status == "unavailable")
	h.api_enabled = false
	h.portal_enabled = false
	var calls := h.vehicle_calls + h.portal_calls
	assert((await h._complete_location_client(data)).client_lookup_status == "not_returned")
	assert(h.vehicle_calls + h.portal_calls == calls)
	h.api_enabled = true
	h.switch_branch = true
	assert(not (await h._complete_location_client(data)).ok)
	var cell: Control = h._make_serial_location_cell({"imei": "000000001", "plate": "ABC1D23", "client": "Cliente da linha"}, "000000001")
	var button := find_button(cell)
	assert(button != null)
	button.pressed.emit()
	assert(h.clicked == ["000000001", "ABC1D23", "Cliente da linha"])
	cell.free()
	h.free()
	print("LOCATION_CLIENT_RESOLUTION: PASS | row context, API holder, exact portal association, ambiguity, failures, flags, branch change")
	quit()

func find_button(node: Node) -> Button:
	if node is Button: return node
	for child in node.get_children():
		var found := find_button(child)
		if found != null: return found
	return null
