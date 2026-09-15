extends RefCounted
## Approved HTML composition, with live stock data and existing operational actions.
const Design = preload("res://src/ui/app_design_system.gd")
const Backdrop = preload("res://src/ui/metric_backdrop.gd")
const Regular = preload("res://assets/fonts/Noto_Sans/static/NotoSans-Regular.ttf")
const Semibold = preload("res://assets/fonts/Noto_Sans/static/NotoSans-SemiBold.ttf")

static func text(value: String, pixels: int = 14, ink: Color = Design.TEXT) -> Label:
	var label := Label.new()
	label.text = value
	label.add_theme_font_override("font", Semibold if pixels >= 19 else Regular)
	label.add_theme_font_size_override("font_size", pixels)
	label.add_theme_color_override("font_color", ink)
	return label

static func panel(title: String, subtitle: String = "") -> VBoxContainer:
	var outer := PanelContainer.new()
	preload("res://src/ui/card_hover_motion.gd").attach(outer)
	outer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var style := Design.surface(Color.WHITE, Color("#e0e8f0"), 1, 19, true)
	style.shadow_color = Color(0.09, 0.23, 0.35, 0.04)
	style.content_margin_left = 30
	style.content_margin_right = 30
	style.content_margin_top = 30
	style.content_margin_bottom = 30
	outer.add_theme_stylebox_override("panel", style)
	var body := VBoxContainer.new()
	body.add_theme_constant_override("separation", 18)
	outer.add_child(body)
	body.add_child(text(title, 19))
	if not subtitle.is_empty():
		body.add_child(text(subtitle, 14, Design.MUTED))
	return body

static func action(host: Control, caption: String, callback: Callable, primary: bool = false) -> Button:
	var result: Button = host._make_action_button(caption, Design.ORANGE if primary else Color.WHITE, Design.ORANGE if primary else Design.BORDER, Design.TEXT, Vector2(160, 46), callback)
	var icon_name := "box"
	if caption.begins_with("Salvar"): icon_name = "check"
	elif caption.begins_with("Voltar"): icon_name = "arrow"
	elif "SMS" in caption: icon_name = "mail"
	elif "Atualizar" in caption: icon_name = "refresh"
	elif "cadastro" in caption.to_lower(): icon_name = "file"
	result.icon = load("res://assets/icons/approved/%s.svg" % icon_name)
	result.expand_icon = true
	result.add_theme_constant_override("icon_max_width", 18)
	return result

static func build(host: Control) -> Control:
	var stats: Dictionary = host._inventory_summary_stats()
	var scroll := ScrollContainer.new()
	scroll.name = "DashboardScroll"
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var root := VBoxContainer.new()
	root.name = "ApprovedDashboard"
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 24)
	scroll.add_child(root)
	var heading := HBoxContainer.new()
	heading.add_theme_constant_override("separation", 18)
	var titles := VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_theme_constant_override("separation", 9)
	titles.add_child(text("GRUPO RS CENTRAL / " + host.selected_branch_name.to_upper(), 11, Color("#6284a7")))
	titles.add_child(text("Visão geral da operação", 36))
	titles.add_child(text("Estoque, equipamentos e rotina da filial em um só lugar.", 14, Design.MUTED))
	heading.add_child(titles)
	var open := action(host, "Abrir estoque →", host._show_list, true)
	open.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	heading.add_child(open)
	root.add_child(heading)
	var metrics := GridContainer.new()
	metrics.name = "DashboardMetricCards"
	metrics.columns = 4
	metrics.add_theme_constant_override("h_separation", 18)
	metrics.add_theme_constant_override("v_separation", 18)
	root.add_child(metrics)
	var definitions := [
		["Equipamentos na base", "total", "Cadastros da filial", Color("#236fba"), "all", "cadastros"],
		["Disponíveis em estoque", "available", "Prontos para a próxima operação", Design.ORANGE, "estoque", "cadastros"],
		["Inativos" if host._is_regional_branch() else "Em manutenção", "inactive" if host._is_regional_branch() else "maintenance", "Acompanhamento técnico", Color.WHITE, "inativo" if host._is_regional_branch() else "manutencao", "manutencoes"],
		["Instalados", "installed", "Vinculados na filial", Color("#163e61"), "instalado", "localizacao"]]
	for item in definitions:
		metrics.add_child(metric(host, item, int(stats.get(item[1], 0))))
	var charts := HBoxContainer.new()
	charts.add_theme_constant_override("separation", 22)
	root.add_child(charts)
	var operators := panel("Distribuição por operadora", "Chips dos equipamentos da filial")
	operators.get_parent().size_flags_stretch_ratio = 1.55
	charts.add_child(operators.get_parent())
	var counts: Dictionary = stats.get("operators", {})
	var names: Array = ["Vivo", "Claro", "TIM", "Multioperadora"]
	for key in counts:
		var found := false
		for name in names:
			if str(name).to_lower() == str(key).to_lower(): found = true
		if not found: names.append(key)
	for name in names:
		var count := int(host._dashboard_operator_value(counts, str(name)))
		var colors := {"vivo":"#713fba", "claro":"#de3b4b", "tim":"#1478d0", "multioperadora":"#ef8b20"}
		operators.add_child(bar(str(name), count, int(stats.get("total", 0)), Color(colors.get(str(name).to_lower(), "#60758c"))))
	var profile := panel("Perfil da base", "Organização para decidir com clareza")
	charts.add_child(profile.get_parent())
	var profile_row := HBoxContainer.new()
	profile_row.add_theme_constant_override("separation", 30)
	profile_row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	profile_row.alignment = BoxContainer.ALIGNMENT_CENTER
	profile.add_child(profile_row)
	var chart := preload("res://src/ui/approved_profile_chart.gd").new()
	chart.available = int(stats.get("available", 0))
	chart.installed = int(stats.get("installed", 0))
	chart.total = int(stats.get("total", 0))
	chart.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	profile_row.add_child(chart)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	chart.add_child(center)
	var count_stack := VBoxContainer.new()
	center.add_child(count_stack)
	var count_label := text(str(chart.total), 30)
	count_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	count_stack.add_child(count_label)
	count_stack.add_child(text("equipamentos", 11, Design.MUTED))
	var legend := VBoxContainer.new()
	legend.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	legend.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	legend.add_theme_constant_override("separation", 20)
	profile_row.add_child(legend)
	for item in [["Em estoque", chart.available], ["Instalados", chart.installed], ["Outros estados", maxi(0, chart.total - chart.available - chart.installed)]]:
		var line := HBoxContainer.new()
		var caption := text(item[0], 13)
		caption.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		line.add_child(caption)
		line.add_child(text(str(item[1]), 13))
		legend.add_child(line)
		legend.add_child(HSeparator.new())
	var bottom := HBoxContainer.new()
	bottom.add_theme_constant_override("separation", 22)
	root.add_child(bottom)
	var devices := panel("Equipamentos da filial")
	devices.get_parent().size_flags_stretch_ratio = 1.55
	bottom.add_child(devices.get_parent())
	var products: Array = host.store.get_products()
	for product in products.slice(0, 4):
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 16)
		var serial := text(str(product.get("sku", "")))
		serial.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(serial)
		row.add_child(text(str(product.get("plate", "Sem veículo")), 13, Design.MUTED))
		row.add_child(text(str(product.get("tracker_status", "")), 13))
		devices.add_child(row)
	devices.add_child(action(host, "Ver todos →", host._show_list))
	var attention := panel("Atenção da central")
	bottom.add_child(attention.get_parent())
	attention.add_child(text("%s equipamentos disponíveis nesta filial." % stats.get("available", 0), 14, Design.MUTED))
	if not host._is_regional_branch():
		attention.add_child(action(host, "Em reserva: %s →" % stats.get("reserved", 0), Callable(host, "_show_list_with_status").bind("reserva")))
	attention.add_child(action(host, "Inativos: %s →" % stats.get("inactive", 0), Callable(host, "_show_list_with_status").bind("inativo")))
	attention.add_child(action(host, "Cadastro em massa →", host._show_bulk_registration))
	if not host._is_regional_branch():
		attention.add_child(action(host, "Painel SMS →", host._show_sms_panel))
	attention.add_child(action(host, "Atualizar indicadores", host._refresh_dashboard_data))
	return scroll

static func bar(caption: String, count: int, total: int, color: Color) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.custom_minimum_size.y = 34
	row.add_theme_constant_override("separation", 16)
	var name := text(caption, 13)
	name.custom_minimum_size.x = 104
	row.add_child(name)
	var track := ProgressBar.new()
	track.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	track.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	track.custom_minimum_size.y = 15
	track.show_percentage = false
	track.max_value = maxi(total, 1)
	track.value = count
	track.add_theme_stylebox_override("background", Design.surface(Color("#edf3f9"), Color.TRANSPARENT, 0, 5))
	track.add_theme_stylebox_override("fill", Design.surface(color, Color.TRANSPARENT, 0, 5))
	row.add_child(track)
	var value := text(str(count), 13)
	value.custom_minimum_size.x = 38
	value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(value)
	return row

static func metric(host: Control, item: Array, value: int) -> Button:
	var button := Button.new()
	button.name = "Metric_" + str(item[1])
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.custom_minimum_size.y = 182
	button.pressed.connect(Callable(host, "_show_list_with_status").bind(item[4]))
	var fill: Color = item[3]
	var ink := Color.WHITE if item[1] in ["total", "installed"] else Design.TEXT
	for state in ["normal", "hover", "pressed", "focus"]:
		button.add_theme_stylebox_override(state, Design.surface(fill, Design.BORDER, 1, 19, state == "hover"))
	if fill != Color.WHITE:
		var background := Backdrop.new()
		background.base_color = fill
		button.add_child(background)
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for side in ["left", "right", "top", "bottom"]: margin.add_theme_constant_override("margin_" + side, 24)
	button.add_child(margin)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 6)
	margin.add_child(stack)
	var top := HBoxContainer.new()
	var title := text(item[0], 13, ink)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(title)
	var icon: Control = host._make_sidebar_icon(item[5], ink)
	icon.custom_minimum_size = Vector2(24, 38)
	top.add_child(icon)
	stack.add_child(top)
	stack.add_child(text(str(value), 44, ink))
	stack.add_child(text(item[2], 12, ink))
	ignore_mouse(stack)
	preload("res://src/ui/card_hover_motion.gd").attach(button)
	return button

static func ignore_mouse(node: Control) -> void:
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for child in node.get_children():
		if child is Control: ignore_mouse(child)
