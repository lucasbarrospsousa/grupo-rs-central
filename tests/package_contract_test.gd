## Load the exported EXE's package using the matching runtime and --main-pack.
## Does not attach the production dashboard to the tree or open any database.
extends SceneTree
var failures: Array[String] = []

func _init() -> void:
	call_deferred("_run")

func _run() -> void:
	_check(str(ProjectSettings.get_setting("application/config/version")) == "4.3.0", "Wrong package version")
	var script := load("res://src/inventory_dashboard.gd") as Script
	_check(script != null, "Dashboard script missing")
	if script != null:
		var dashboard = script.new()
		for removed in ["_show_vehicle_location_monitor", "_show_smart_4g_monitor", "_build_online_lookup_panel", "_request_online_lookup_from_search", "_schedule_online_lookup_confirmed_api_reconcile", "_setup_st310_location_poll_timer"]:
			_check(not dashboard.has_method(removed), "Retired method in package: " + removed)
		for kept in ["_show_list", "_show_location_lookup", "_refresh_table", "_generate_inventory_report", "_show_consult", "_show_records", "_show_route", "_show_stock_link", "_show_maintenance_visits", "_show_scanner_inventory"]:
			_check(dashboard.has_method(kept), "Required method missing: " + kept)
		dashboard.free()
	for required in ["res://tools/local_sqlite_service.py", "res://tools/inventory_report_generator.py", "res://tools/sms_gateway_service.py", "res://tools/scanner_inventory_service.py", "res://assets/icons/report/pdf.svg"]:
		_check(FileAccess.file_exists(required) or ResourceLoader.exists(required), "Required resource missing: " + required)
	for required in ["res://src/services/tracking_records.gd","res://src/ui/tracking_records.gd","res://src/ui/records_map.gd","res://assets/icons/records/history.svg"]:
		_check(ResourceLoader.exists(required), "Records resource missing: " + required)
	for required in ["res://src/services/tracking_route.gd","res://src/ui/tracking_route.gd","res://src/ui/route_map.gd","res://assets/icons/route/car.svg"]:
		_check(ResourceLoader.exists(required), "Route resource missing: " + required)
	for required in ["res://src/ui/location_dialog.gd", "res://src/ui/location_map.gd", "res://assets/icons/location/marker.png"]:
		_check(ResourceLoader.exists(required), "Location resource missing: " + required)
	for required in ["res://src/services/stock_link.gd", "res://src/ui/stock_link.gd"]:
		_check(ResourceLoader.exists(required), "Stock link resource missing: " + required)
	_check(FileAccess.file_exists("res://assets/icons/location/LEAFLET-LICENSE.txt"), "Marker license missing")
	for required in ["res://src/services/maintenance_visits.gd", "res://src/ui/maintenance_visits.gd"]:
		_check(ResourceLoader.exists(required), "Maintenance resource missing: " + required)
	for required in ["res://src/services/hub_maintenance.gd", "res://src/ui/hub_maintenance.gd"]:
		_check(ResourceLoader.exists(required), "Hub maintenance resource missing: " + required)
	if not OS.has_feature("editor") or "--audit-package" in OS.get_cmdline_user_args():
		_audit_directory("res://")
	if failures.is_empty():
		print("PACKAGE_CONTRACT_TEST: OK | 4.3.0 | retired entry points absent; stock and individual location preserved")
		quit(0)
	else:
		for failure in failures: push_error(failure)
		quit(1)

func _audit_directory(path: String) -> void:
	var dir := DirAccess.open(path)
	if dir == null: return
	dir.include_hidden = true
	for name in dir.get_files():
		var file := path.path_join(name)
		_check(not file.contains("/big_map/") and not file.contains("/assets/maps/"), "Retired resource shipped: " + file)
		_check(file.get_extension() not in ["sqlite", "db", "vault", "enc", "jsonl", "log"], "Private data file shipped: " + file)
		_check(not file.begins_with("res://tests/") and not file.begins_with("res://reports/") and not file.begins_with("res://backups/"), "Private/test directory shipped")
		if file.ends_with(".py"):
			_check(file in ["res://tools/local_sqlite_service.py", "res://tools/inventory_report_generator.py", "res://tools/sms_gateway_service.py", "res://tools/scanner_inventory_service.py"], "Unreviewed Python script shipped: " + file)
	for name in dir.get_directories():
		_audit_directory(path.path_join(name))

func _check(condition: bool, message: String) -> void:
	if not condition: failures.append(message)
