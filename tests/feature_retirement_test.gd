## Exercises the actual stock filters/UI with synthetic SQLite data only.
extends SceneTree

const Shell := preload("res://tests/fixtures/offline_main_dashboard.gd")
const Store := preload("res://src/inventory_store.gd")
var failures: Array[String] = []

class TestShell extends Shell:
	var lookup_calls := 0
	func _fetch_grupo_rs_equipment_rows(_query: String) -> Array[Dictionary]:
		lookup_calls += 1
		return []
	func _setup_integration_maintenance() -> void:
		pass
	func _setup_online_plate_sync() -> void:
		pass
	func _branch_supports_operational_apis() -> bool:
		return true

func _init() -> void:
	create_timer(90.0).timeout.connect(func(): push_error("Feature retirement test timed out"); quit(1))
	call_deferred("_run")

func _run() -> void:
	var sqlite := ProjectSettings.globalize_path("user://retirement-isolated.sqlite")
	var branches := ["imperatriz", "araguaina", "acailandia", "maraba"]
	for branch in branches:
		var storage_branch: String = branch if branch == "imperatriz" else "backups_" + branch
		var store := Store.new()
		store.configure_isolated_sqlite_for_testing(sqlite, storage_branch)
		store.load_db()
		for i in range(13):
			var row := {"sku": "099900%03d" % i, "imei": "099900%03d" % i, "plate": "TST-%03d" % i, "name": "Equipamento fictício", "category": "Rastreador", "tracker_status": "Estoque", "stock": 1, "quantity": 1, "operator": "CLARO", "updated_at": "2026-09-15 10:00:00"}
			_check(not store.upsert_product(row).is_empty(), "Synthetic insert failed: " + branch)
		var before := JSON.stringify(store.get_products())
		var shell := TestShell.new()
		shell.store = store
		shell.online_data_available = true
		shell.selected_branch_id = branch
		shell.selected_branch_name = branch
		root.add_child(shell)
		await process_frame
		_check(shell._is_regional_branch() == (branch != "imperatriz"), "Wrong regional UI selected")
		_check(not shell.sidebar_buttons.has("monitor_4g"), "Retired sidebar entry")
		_check(not shell.has_method("_show_vehicle_location_monitor"), "Retired map route exists")
		_check(not shell.has_method("_request_online_lookup_from_search"), "Online search still exists")
		_check(not shell.has_method("_schedule_online_tracker_records"), "Online queue still exists")
		_check(not shell.has_method("_schedule_online_lookup_confirmed_api_reconcile"), "Search can still reconcile stock")
		shell._start_online_services()
		for node in shell.get_children():
			_check(not (node is Timer), "Map timer was created")
		shell._show_list()
		await process_frame
		_check(shell._filtered_products().size() == 13, "Wrong branch stock count")
		for query in ["099900003", "TST-003", "TST003", "not-found", ""]:
			shell.search_input.text = query
			shell._submit_search()
			await process_frame
			var count := shell._filtered_products().size()
			_check(count == (13 if query == "" else (0 if query == "not-found" else 1)), "Wrong filter: " + query)
		_check(shell.lookup_calls == 0, "Search called remote equipment lookup")
		shell.table_current_page = 1
		shell._refresh_table()
		_check(shell.table_current_page == 1, "Pagination lost second page")
		shell._clear_search()
		_check(shell.table_current_page == 0, "Clear search did not reset page")
		_check(JSON.stringify(store.get_products()) == before, "Search changed stock data")
		if DisplayServer.get_name() != "headless":
			await create_timer(0.4).timeout
			await process_frame
			# Low-processor mode does not draw unchanged frames automatically.
			RenderingServer.force_draw()
			var filename := OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("stock-" + branch + ".png")
			_check(root.get_texture().get_image().save_png(filename) == OK, "Capture failed")
		root.remove_child(shell)
		shell.queue_free()
		await process_frame
		var reopened := Store.new()
		reopened.configure_isolated_sqlite_for_testing(sqlite, storage_branch)
		reopened.load_db()
		_check(JSON.stringify(reopened.get_products()) == before, "Branch persistence changed")
		print("BRANCH_UI_OK: " + branch)
	var registry := root.get_node("ModuleRegistry")
	_check(not registry.module_ids().has("big_map"), "Map module registered")
	_check(not registry.module_ids().has("monitor_4g"), "Retired monitor registered")
	if failures.is_empty():
		print("FEATURE_RETIREMENT_TEST: OK | 4 branches | search, pagination, persistence, no lookup or map timers")
		quit(0)
	else:
		for failure in failures: push_error(failure)
		quit(1)

func _check(condition: bool, message: String) -> void:
	if not condition: failures.append(message)
