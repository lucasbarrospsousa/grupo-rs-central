extends SceneTree
func _initialize() -> void:
	var bridge = preload("res://src/local_sqlite_bridge.gd").new()
	for operation in ["load", "save", "restore", "append_audit"]:
		var response: Dictionary = bridge.execute(operation, "C:/GRUPO RS CENTRAL/database/grupo_rs_central.sqlite", {})
		if response.get("ok", false) or not str(response.get("error", "")).contains("bloqueado"):
			quit(1)
			return
	print("OPERATIONAL_DB_GUARD_OK")
	quit(0)
