extends AcceptDialog
## Read-only individual location. Same visual vocabulary as SMSComposer.
const Map = preload("res://src/ui/location_map.gd")
var host: Node
var location: Dictionary = {}
var branch := ""
var map: Control
var values: Dictionary = {}
var refresh_button: Button
var feedback: Label
var refreshing := false
var network_enabled := true

static func voltage(value: Variant) -> String:
	var text := str(value).strip_edges()
	if text == "" or text == "<null>" or text == "-": return "Não informado"
	# Preserve explicit units; never turn a percentage into volts.
	var numeric := text.replace(",", ".")
	return text + " V" if numeric.is_valid_float() else text

static func valid_coordinates(data: Dictionary) -> bool:
	var lat_text := str(data.get("lat", "")).replace(",", ".")
	var lng_text := str(data.get("lng", "")).replace(",", ".")
	if not lat_text.is_valid_float() or not lng_text.is_valid_float(): return false
	var lat := lat_text.to_float()
	var lng := lng_text.to_float()
	return is_finite(lat) and is_finite(lng) and absf(lat) <= 85.0511 and absf(lng) <= 180 and not (lat == 0 and lng == 0)

func open(owner_node: Node, data: Dictionary) -> void:
	host = owner_node
	branch = str(host.selected_branch_id)
	location = data.duplicate(true)
	name = "LocationDialog"
	borderless = true
	transparent_bg = true
	transparent = true
	unresizable = true
	get_ok_button().hide()
	var palette := Theme.new()
	palette.default_font = preload("res://assets/fonts/Noto_Sans/static/NotoSans-Regular.ttf")
	palette.default_font_size = 14
	palette.set_color("font_color", "Label", Color("#123555"))
	palette.set_stylebox("panel", "AcceptDialog", style("#f5f8fc", "#d9e5f0", 18))
	theme = palette
	# Match SMSComposer: a fixed host avoids Window/autowrap minimum-size feedback.
	var layout_host := Control.new()
	layout_host.custom_minimum_size = Vector2(1000, 630)
	add_child(layout_host)
	var shell := VBoxContainer.new()
	shell.add_theme_constant_override("separation", 0)
	layout_host.add_child(shell)
	shell.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var banner := PanelContainer.new()
	var banner_style := StyleBoxTexture.new()
	banner_style.texture = preload("res://assets/ui/sms_header.svg")
	for side in [SIDE_LEFT, SIDE_RIGHT, SIDE_TOP]: banner_style.set_texture_margin(side, 18)
	for side in [SIDE_LEFT, SIDE_RIGHT]: banner_style.set_content_margin(side, 24)
	for side in [SIDE_TOP, SIDE_BOTTOM]: banner_style.set_content_margin(side, 14)
	banner.add_theme_stylebox_override("panel", banner_style)
	shell.add_child(banner)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 16)
	banner.add_child(header)
	var heading := VBoxContainer.new()
	heading.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(heading)
	heading.add_child(label("Localização do veículo", 23, Color.WHITE))
	heading.add_child(label("Última posição e informações do rastreador.", 14, Color("#d8eaff")))
	header.add_child(button("Abrir no Maps", func(): OS.shell_open("https://www.google.com/maps/search/?api=1&query=%s,%s" % [str(location.lat), str(location.lng)])))
	var close := button("×", queue_free)
	close.flat = true
	close.add_theme_color_override("font_color", Color.WHITE)
	header.add_child(close)
	var margin := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]: margin.add_theme_constant_override("margin_" + side, 20)
	shell.add_child(margin)
	margin.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var columns := HBoxContainer.new()
	columns.add_theme_constant_override("separation", 24)
	margin.add_child(columns)
	var left := VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_theme_constant_override("separation", 12)
	columns.add_child(left)
	var identities := HBoxContainer.new()
	identities.add_theme_constant_override("separation", 14)
	left.add_child(identities)
	for pair in [["client", "CLIENTE"], ["plate", "PLACA"]]:
		var panel := PanelContainer.new()
		panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		panel.add_theme_stylebox_override("panel", style("#ffffff", "#cfe0f1", 18))
		identities.add_child(panel)
		var box := VBoxContainer.new()
		panel.add_child(padded(box, 15))
		box.add_child(label(pair[1], 12, Color("#587895")))
		var value := label("", 16, Color("#1678d4"))
		value.clip_text = true
		value.custom_minimum_size.x = 160
		box.add_child(value)
		values[pair[0]] = value
	map = Map.new()
	map.name = "LocationMap"
	map.network_enabled = network_enabled
	map.custom_minimum_size = Vector2(420, 280)
	left.add_child(map)
	var controls := HBoxContainer.new()
	controls.add_theme_constant_override("separation", 8)
	left.add_child(controls)
	controls.add_child(button("+", func(): map.change_zoom(1)))
	controls.add_child(button("−", func(): map.change_zoom(-1)))
	controls.add_child(button("Centralizar", func(): map.fit_route()))
	var credit := LinkButton.new()
	credit.text = "© OpenStreetMap contributors"
	credit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	credit.size_flags_horizontal = Control.SIZE_EXPAND | Control.SIZE_SHRINK_END
	credit.add_theme_font_size_override("font_size", 11)
	for state in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]: credit.add_theme_color_override(state, Color("#476982"))
	credit.pressed.connect(func(): OS.shell_open("https://www.openstreetmap.org/copyright"))
	controls.add_child(credit)
	var address := label("", 12, Color("#587895"))
	address.clip_text = true
	left.add_child(address)
	values.address = address
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 10)
	left.add_child(actions)
	refresh_button = button("Atualizar localização", refresh, true)
	refresh_button.name = "RefreshLocation"
	actions.add_child(refresh_button)
	actions.add_child(button("Copiar coordenadas", func(): DisplayServer.clipboard_set("%s, %s" % [str(location.lat), str(location.lng)])))
	actions.add_child(button("Fechar", queue_free))
	feedback = label("Arraste o mapa para mover • Use a roda do mouse para zoom", 12, Color("#587895"))
	feedback.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	left.add_child(feedback)
	var right := PanelContainer.new()
	right.custom_minimum_size.x = 290
	right.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	right.add_theme_stylebox_override("panel", style("#e3edf6", "#bfd2e5", 18))
	columns.add_child(right)
	var right_box := VBoxContainer.new()
	right_box.add_theme_constant_override("separation", 16)
	right.add_child(padded(right_box, 20))
	right_box.add_child(label("ÚLTIMA COMUNICAÇÃO", 14))
	var white := PanelContainer.new()
	white.add_theme_stylebox_override("panel", style("#ffffff", "#d1dfec", 16))
	right_box.add_child(white)
	var details := VBoxContainer.new()
	details.add_theme_constant_override("separation", 12)
	white.add_child(padded(details, 18))
	for pair in [["updated_at", "Recebida em"], ["ignition", "Status da ignição"], ["battery_voltage", "Tensão da bateria"], ["external_battery", "Bateria externa"]]:
		if details.get_child_count() > 0:
			var separator := HSeparator.new()
			var line := StyleBoxLine.new()
			line.color = Color("#e5edf3")
			separator.add_theme_stylebox_override("separator", line)
			details.add_child(separator)
		details.add_child(label(pair[1], 12, Color("#587895")))
		var value := label("", 17 if pair[0] == "updated_at" else 22)
		value.name = "Value_" + pair[0]
		value.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		value.custom_minimum_size.x = 215
		details.add_child(value)
		values[pair[0]] = value
		if pair[0] == "ignition": details.add_child(label("Na última posição", 12, Color("#587895")))
	var source := label("", 12, Color("#315774"))
	source.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	right_box.add_child(source)
	values.source = source
	host.add_child(self)
	canceled.connect(queue_free)
	apply_location(data)
	var available: Vector2 = host.get_viewport_rect().size
	popup_centered(Vector2i(minf(1140, available.x - 40), minf(700, available.y - 40)))

func apply_location(data: Dictionary) -> void:
	location = data.duplicate(true)
	for key in ["client", "plate"]:
		values[key].text = present(data.get(key, ""))
		values[key].tooltip_text = values[key].text
	values.updated_at.text = present(data.get("updated_at", "")).replace("T", " ")
	var state := int(host._location_ignition_state(data.get("ignition", null)))
	values.ignition.text = "Ligada" if state == 1 else ("Desligada" if state == 0 else "Não informada")
	values.ignition.add_theme_color_override("font_color", Color("#098458") if state == 1 else Color("#587895"))
	var ignition_style := style("#e6f6ee" if state == 1 else "#f3f6f9", "#e6f6ee" if state == 1 else "#f3f6f9", 7)
	ignition_style.content_margin_left = 10
	ignition_style.content_margin_top = 4
	ignition_style.content_margin_bottom = 4
	values.ignition.add_theme_stylebox_override("normal", ignition_style)
	var battery: Variant = data.get("battery_voltage", "")
	if str(battery).strip_edges() == "": battery = data.get("battery", "")
	values.battery_voltage.text = voltage(battery)
	values.external_battery.text = voltage(data.get("external_battery", ""))
	values.address.text = str(data.get("address", "")).strip_edges()
	if values.address.text == "": values.address.text = "Endereço não informado pela origem"
	values.address.tooltip_text = values.address.text
	var source := "API oficial" if data.get("source", "") == "grupo_rs_api" else "Portal web"
	values.source.text = "Aparelho %s\n%s • %s" % [present(data.get("serial", "")), branch.capitalize(), source]
	map.set_location(data)

func refresh() -> void:
	if refreshing: return
	if str(host.selected_branch_id) != branch:
		feedback.text = "A filial mudou. Feche esta janela e consulte novamente."
		return
	refreshing = true
	refresh_button.disabled = true
	feedback.text = "Consultando última posição…"
	var result: Dictionary = await host._lookup_grupo_rs_location(str(location.get("serial", "")), Callable(), "", str(location.get("plate", "")), str(location.get("client", "")))
	if not is_inside_tree(): return
	refreshing = false
	refresh_button.disabled = false
	if str(host.selected_branch_id) != branch:
		feedback.text = "A filial mudou. O resultado foi descartado."
		return
	if not result.get("ok", false) or not valid_coordinates(result):
		feedback.text = "Falha ao atualizar. A posição anterior foi mantida."
		feedback.tooltip_text = str(result.get("message", "Coordenadas indisponíveis"))
		return
	apply_location(result)
	feedback.text = "Consulta atualizada. Dados conforme a última comunicação recebida."

static func present(value: Variant) -> String:
	var text := str(value).strip_edges()
	return "Não informado" if text == "" else text

static func style(background: String, border: String, radius: int) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(background)
	box.border_color = Color(border)
	box.set_border_width_all(1)
	box.set_corner_radius_all(radius)
	return box

static func padded(child: Control, amount: int) -> MarginContainer:
	var margin := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]: margin.add_theme_constant_override("margin_" + side, amount)
	margin.add_child(child)
	return margin

static func label(text: String, font_size: int, color: Color = Color("#123555")) -> Label:
	var result := Label.new()
	result.text = text
	result.add_theme_font_size_override("font_size", font_size)
	result.add_theme_color_override("font_color", color)
	return result

static func button(text: String, action: Callable, primary: bool = false) -> Button:
	var result := Button.new()
	result.text = text
	result.custom_minimum_size.y = 42
	var box := style("#1678d4" if primary else "#ffffff", "#1678d4" if primary else "#c7dcef", 9)
	box.content_margin_left = 14
	box.content_margin_right = 14
	result.add_theme_stylebox_override("normal", box)
	for state in ["hover", "pressed", "disabled"]:
		var alternate := box.duplicate() as StyleBoxFlat
		alternate.bg_color = Color("#1164b5") if primary else Color("#edf5fc")
		result.add_theme_stylebox_override(state, alternate)
	for key in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_disabled_color"]:
		result.add_theme_color_override(key, Color.WHITE if primary else Color("#174c7c"))
	result.pressed.connect(action)
	return result
