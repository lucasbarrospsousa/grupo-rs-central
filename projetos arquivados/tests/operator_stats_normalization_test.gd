extends SceneTree


func _init() -> void:
	var store = load("res://src/inventory_store.gd").new()
	store.set("_loaded", true)
	store.set("_db", {
		"products": [
			{"sku": "OP-1", "operator": "Claro", "tracker_status": "Estoque"},
			{"sku": "OP-2", "operator": " CLARO ", "tracker_status": "Estoque"},
			{"sku": "OP-3", "operator": "Tim", "tracker_status": "Estoque"},
			{"sku": "OP-4", "operator": "TIM", "tracker_status": "Estoque"},
			{"sku": "OP-5", "operator": "Vivo", "tracker_status": "Estoque"},
			{"sku": "OP-6", "operator": "VIVO", "tracker_status": "Estoque"},
			{"sku": "OP-7", "operator": "", "tracker_status": "Estoque"},
		]
	})

	var operators: Dictionary = (store.get_tracker_stats() as Dictionary).get("operators", {})
	var expected := {"CLARO": 2, "TIM": 2, "VIVO": 2, "Sem operadora": 1}
	if operators != expected:
		push_error("Agrupamento de operadoras incorreto: %s" % operators)
		quit(1)
		return

	print("OK: operadoras agrupadas sem duplicacao por capitalizacao.")
	quit(0)
