extends SceneTree


func _init() -> void:
	var dashboard = load("res://src/inventory_dashboard.gd").new()
	for value in ["Claro", "CLARO", " claro ", "TIM", "Tim", "Vivo", "VIVO", "Sem operadora"]:
		if not bool(dashboard.call("_dashboard_operator_is_primary", value)):
			push_error("Operadora principal seria duplicada no grafico: %s" % value)
			quit(1)
			return
	if bool(dashboard.call("_dashboard_operator_is_primary", "MULTI OPERADORA")):
		push_error("Operadora adicional foi ocultada indevidamente.")
		quit(1)
		return
	print("OK: o grafico nao repete operadoras por capitalizacao.")
	dashboard.free()
	quit(0)
