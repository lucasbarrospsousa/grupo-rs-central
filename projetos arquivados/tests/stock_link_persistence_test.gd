extends SceneTree
const Service = preload("res://src/services/stock_link.gd")
class Host extends Node:
	var store: InventoryStore
	var selected_branch_id := "imperatriz"
	var logged := false
	func _ensure_local_database_modification_saved(sku: String, expected: Dictionary) -> Dictionary:
		store.reload_db_from_disk()
		var actual := store.get_product(sku)
		return {"ok": actual.get("plate") == expected.get("plate") and actual.get("status") == "Estoque" and actual.get("client") == "RS300"}
	func _log_system_action(_action: String, _detail: String, _sku: String) -> void: logged = true
func _init() -> void: run.call_deferred()
func run() -> void:
	var h := Host.new()
	root.add_child(h)
	h.store = InventoryStore.new()
	h.store.configure_isolated_sqlite_for_testing(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("stock-link-synthetic.sqlite"))
	h.store.load_db()
	var before := h.store.upsert_product_replacing_sku("000000001", {"sku":"000000001","imei":"000000001","plate":"OLD - 001","client":"Titular fictício anterior","status":"Manutenção","tracker_status":"Manutenção","model":"V7.1.6","chip_number":"00000000000000000001","stock":0})
	assert(not before.is_empty())
	var service := Service.new()
	service.host = h
	service.branch = "imperatriz"
	service.bound_store = h.store
	h.add_child(service)
	assert((await service.persist("000000001",before,"GRS - 021")).ok)
	h.store.reload_db_from_disk()
	var after := h.store.get_product("000000001")
	assert(after.plate == "GRS - 021" and after.identification_plate == "GRS - 021" and after.vehicle_plate == "")
	assert(after.client == "RS300" and after.status == "Estoque" and after.stock == 1)
	assert(after.model == "V7.1.6" and after.chip_number == before.chip_number)
	assert(h.logged)
	h.free()
	print("STOCK_LINK_PERSISTENCE PASS: isolated SQLite reread, stock/identity/client, historical hardware version and chip preserved")
	quit()
