extends RefCounted
const UI = preload("res://src/ui/approved_dashboard.gd")
const Design = preload("res://src/ui/app_design_system.gd")

static func build(host: Control) -> Control:
	var body := UI.panel("Relatório de equipamentos", "%s · %s · %s" % [host.selected_branch_name, host.inventory_report_format.to_upper(), host._inventory_report_status_label()])
	var paper := body.get_parent() as PanelContainer
	paper.custom_minimum_size = Vector2(690, 835)
	var paper_style := Design.surface(Color.WHITE, Design.BORDER, 1, 0)
	for side in ["left", "right", "top", "bottom"]: paper_style.set("content_margin_" + side, 25)
	paper.add_theme_stylebox_override("panel", paper_style)
	var accent := ColorRect.new()
	accent.color = Design.ORANGE
	accent.custom_minimum_size.y = 3
	body.add_child(accent)
	var options: Dictionary = host._inventory_report_selected_options()
	var products: Array = host._inventory_report_payload_products()
	if options.get("summary", true):
		body.add_child(UI.text("Resumo do estoque", 19))
		var counts := {"Equipamentos": products.size(), "Em estoque": 0, "Instalados": 0}
		for product in products:
			var status := str(product.get("status", "")).to_lower()
			if status == "estoque": counts["Em estoque"] += 1
			if status == "instalado": counts["Instalados"] += 1
		var metrics := HBoxContainer.new()
		metrics.add_theme_constant_override("separation", 12)
		for key in counts:
			var card := PanelContainer.new()
			card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			var style := Design.surface(Color("#fff2e4") if key == "Em estoque" else Color("#edf5ff"), Color.TRANSPARENT, 0, 10)
			for side in ["left", "right", "top", "bottom"]: style.set("content_margin_" + side, 15)
			card.add_theme_stylebox_override("panel", style)
			var stack := VBoxContainer.new()
			stack.add_child(UI.text(str(counts[key]), 25))
			stack.add_child(UI.text(key, 11))
			card.add_child(stack)
			metrics.add_child(card)
		body.add_child(metrics)
	for section in [["models", "model", "Distribuição por modelo"], ["operators", "operator", "Distribuição por operadora"]]:
		if not options.get(section[0], true): continue
		body.add_child(UI.text(section[2], 19))
		var counts: Dictionary = host._inventory_report_counts(section[1])
		for key in counts: body.add_child(UI.bar(str(key), int(counts[key]), products.size(), Design.BLUE))
	if options.get("list", true):
		body.add_child(UI.text("Lista de equipamentos", 19))
		body.add_child(host._inventory_report_preview_row(["SÉRIE", "IDENTIFICAÇÃO", "MODELO", "OPERADORA", "SITUAÇÃO"], true))
		for product in products.slice(0, 20):
			body.add_child(host._inventory_report_preview_row([product.serial, product.plate, product.model, product.operator, product.status], false))
		if products.size() > 20:
			body.add_child(UI.text("Prévia: 20 de %s registros. A exportação inclui o recorte completo." % products.size(), 11, Design.MUTED))
	body.add_child(UI.text("Grupo RS Central · pré-visualização do recorte selecionado", 10, Design.MUTED))
	return paper
