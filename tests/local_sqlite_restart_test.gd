extends SceneTree
const StoreScript := preload("res://src/inventory_store.gd")
const TEST_DB := "user://local_sqlite_real_data_test.sqlite"
func _init() -> void: call_deferred("_run")
func _run() -> void:
	var store:InventoryStore=StoreScript.new(); store.configure_isolated_sqlite_for_testing(ProjectSettings.globalize_path(TEST_DB),"imperatriz_test"); store.load_db()
	var products:=store.get_products("TESTE-SQLITE")
	var ok:=products.size()==2 and store.get_product("TESTE-SQLITE-002").is_empty() and str(store.get_product("TESTE-SQLITE-001").get("tracker_status","")).to_lower().contains("instal") and store.get_recent_movements(20).size()>=1 and store.get_system_logs(50).size()>=5
	print(JSON.stringify({"ok":ok,"products":products.size(),"movements":store.get_recent_movements(20).size(),"audit":store.get_system_logs(50).size()}))
	print("LOCAL_SQLITE_RESTART_TEST_OK" if ok else "LOCAL_SQLITE_RESTART_TEST_FAILED"); quit(0 if ok else 1)
