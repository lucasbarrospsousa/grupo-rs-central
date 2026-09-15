extends RefCounted
const UI = preload("res://src/ui/approved_dashboard.gd")
const Design = preload("res://src/ui/app_design_system.gd")

static func build(host: Control, sku: String) -> Control:
	var body := UI.panel("Resumo do equipamento", "Revise o destino antes de confirmar.")
	var panel := body.get_parent() as PanelContainer
	panel.custom_minimum_size.x = 330
	panel.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	host.form_summary_status_label = UI.text("NOVO CADASTRO" if sku.is_empty() else "EDIÇÃO / REENTRADA", 12, Design.BLUE)
	body.add_child(host.form_summary_status_label)
	# Retain the existing summary model for compatibility with validation and
	# remote/local registration diagnostics; render its values as aligned rows.
	host.form_summary_label = UI.text("")
	host.form_summary_label.visible = false
	body.add_child(host.form_summary_label)
	var labels := {}
	for key in ["Identificação", "Filial", "Tipo", "Status", "Operadora", "Vínculo"]:
		var row := HBoxContainer.new()
		row.custom_minimum_size.y = 30
		row.add_theme_constant_override("separation", 20)
		row.add_child(UI.text(key, 13, Design.MUTED))
		var value := UI.text("—", 13)
		value.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		value.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		row.add_child(value)
		labels[key] = value
		body.add_child(row)
		var rule := HSeparator.new()
		var style := StyleBoxLine.new()
		style.color = Design.BORDER
		rule.add_theme_stylebox_override("separator", style)
		body.add_child(rule)
	host.form_summary_label.set_meta("value_labels", labels)
	var diagnostic := UI.text("", 12, Design.MUTED)
	diagnostic.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.add_child(diagnostic)
	host.form_summary_label.set_meta("diagnostic_label", diagnostic)
	var note := UI.text("Confirme os dados antes de salvar. As consultas e validações do cadastro permanecem obrigatórias.", 13, Design.MUTED)
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.add_child(note)
	body.add_child(UI.action(host, "Salvar alterações" if not sku.is_empty() else "Salvar cadastro", host._request_save_form, true))
	body.add_child(UI.action(host, "Salvar somente no estoque", host._request_save_as_stock_form))
	if not sku.is_empty():
		host.form_grupo_rs_reassign_button = UI.action(host, "Modificar vínculo", host._request_modify_grupo_rs_equipment)
		body.add_child(host.form_grupo_rs_reassign_button)
	body.add_child(UI.action(host, "Voltar ao estoque", host._show_list))
	return panel

static func update_values(host: Control) -> void:
	if not is_instance_valid(host.form_summary_label): return
	var labels: Dictionary = host.form_summary_label.get_meta("value_labels", {})
	var plate: String = host._format_grupo_rs_vehicle_plate(host._field_text("plate"))
	var values := {
		"Identificação": host._field_text("imei"),
		"Filial": host.selected_branch_name,
		"Tipo": host._selected_option_text(host.form_options.get("model"), true),
		"Status": host._selected_option_text(host.form_options.get("tracker_status"), false),
		"Operadora": host._selected_option_text(host.form_options.get("operator"), true),
		"Vínculo": plate if not plate.is_empty() else "Sem veículo"
	}
	for key in labels:
		labels[key].text = str(values.get(key, "")) if str(values.get(key, "")) != "" else "Ainda não informado"
		labels[key].tooltip_text = labels[key].text
	var diagnostic: Label = host.form_summary_label.get_meta("diagnostic_label", null)
	if is_instance_valid(diagnostic):
		var lines: PackedStringArray = []
		for line in host.form_summary_label.text.split("\n"):
			if line.begins_with("Vinculo remoto:") or line.begins_with("Registro Banco"):
				lines.append(line)
		diagnostic.text = "\n".join(lines)
		diagnostic.visible = not lines.is_empty()
