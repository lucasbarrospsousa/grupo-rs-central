extends SceneTree
func _initialize() -> void:
	var ui = preload("res://src/ui/approved_dashboard.gd")
	var raw := {"Vivo":521,"Claro":747,"TIM":1963,"Multioperadora":0,"MULTI OPERADORA":40,"NLT":1}
	var snapshot := raw.duplicate()
	var counts: Dictionary = ui.operator_counts(raw)
	assert(counts.size() == 5 and counts.Multioperadora == 40)
	assert(counts.NLT == 1 and counts.TIM == 1963)
	assert(raw == snapshot)
	assert(ui.operator_counts({"multi-operadora":2,"multi_operadora":3}).Multioperadora == 5)
	print("OPERATOR_CHART_OK: aliases merged, counts conserved, source unchanged")
	quit()
