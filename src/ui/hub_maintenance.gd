extends PanelContainer
const Service = preload("res://src/services/hub_maintenance.gd")
const BASES := {"acailandia":"Açailândia", "araguaina":"Araguaína", "maraba":"Marabá", "imperatriz":"Imperatriz"}
var credentials_for: Callable
var results: Dictionary = {}
var bars: Dictionary = {}
var refresh: Button
var summary: Label
var busy := false
var list_dialog: Window
var list_tree: Tree
var list_search: LineEdit
var list_apn: OptionButton
var list_count: Label
var active_branch := ""

static func label(value: String, size: int = 14) -> Label:
	var node := Label.new()
	node.text = value
	node.add_theme_font_size_override("font_size", size)
	node.add_theme_color_override("font_color", Color("#163d61"))
	return node

static func box(color: Color, radius: int = 12) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(radius)
	style.content_margin_left = 18
	style.content_margin_right = 18
	style.content_margin_top = 12
	style.content_margin_bottom = 12
	return style

static func style_button(button: Button) -> void:
	button.add_theme_stylebox_override("normal", box(Color("#157bc5"), 8))
	button.add_theme_stylebox_override("hover", box(Color("#218ee0"), 8))
	button.add_theme_stylebox_override("pressed", box(Color("#135c98"), 8))
	button.add_theme_stylebox_override("disabled", box(Color("#dbe6ef"), 8))
	button.add_theme_color_override("font_color", Color.WHITE)
	button.add_theme_color_override("font_hover_color", Color.WHITE)
	button.add_theme_color_override("font_pressed_color", Color.WHITE)
	button.add_theme_color_override("font_disabled_color", Color("#536b82"))
	button.add_theme_font_size_override("font_size", 14)

func _ready() -> void:
	name = "HubMaintenance"
	add_theme_font_override("font", preload("res://assets/fonts/Noto_Sans/static/NotoSans-Regular.ttf"))
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	add_theme_stylebox_override("panel", box(Color.WHITE, 18))
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 8)
	add_child(stack)
	var heading := HBoxContainer.new()
	stack.add_child(heading)
	var title := label("Veículos em manutenção por base", 20)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	heading.add_child(title)
	refresh = Button.new()
	refresh.text = "Atualizar gráfico"
	style_button(refresh)
	refresh.pressed.connect(load_all)
	heading.add_child(refresh)
	summary = label("Consulta à categoria Manutenção das plataformas", 12)
	stack.add_child(summary)
	for id in BASES:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		stack.add_child(row)
		var name_label := label(BASES[id])
		name_label.custom_minimum_size.x = 105
		row.add_child(name_label)
		var track := Control.new()
		track.custom_minimum_size.y = 34
		track.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(track)
		var backdrop := Panel.new()
		backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		backdrop.add_theme_stylebox_override("panel", box(Color("#eff4f9"), 7))
		backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
		track.add_child(backdrop)
		var bar := Button.new()
		bar.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		bar.text = "Aguardando consulta"
		bar.add_theme_font_size_override("font_size", 13)
		bar.pressed.connect(open_list.bind(id))
		track.add_child(bar)
		var number := label("—")
		number.custom_minimum_size.x = 48
		number.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		row.add_child(number)
		bars[id] = {"bar":bar, "number":number}
	stack.add_child(label("Passe o mouse para ver o total • Clique na barra para abrir a lista", 12))
	stack.add_child(label("Menor quantidade  ● verde → amarelo → laranja → vermelho  Maior quantidade", 11))
	render()
	if credentials_for.is_valid(): load_all.call_deferred()

func load_all() -> void:
	if busy or not credentials_for.is_valid(): return
	busy = true
	refresh.disabled = true
	# Bounded sequential queries; independent sessions, no selected-branch mutation.
	for id in ["imperatriz", "araguaina", "maraba", "acailandia"]:
		summary.text = "Consultando %s…" % BASES[id]
		results[id] = {"ok":false, "message":"Consultando…"}
		render()
		var service := Service.new()
		service.branch = id
		service.credentials = credentials_for.call(id)
		add_child(service)
		results[id] = await service.fetch()
		service.credentials.clear()
		service.cookies.clear()
		service.queue_free()
		render()
	busy = false
	refresh.disabled = false
	var confirmed := results.values().filter(func(item): return bool(item.get("ok", false))).size()
	summary.text = "%d de 4 bases consultadas • Falhas aparecem como pendentes, sem presumir zero" % confirmed

func render() -> void:
	var counts: Array = []
	for result in results.values():
		if result.get("ok", false): counts.append(int(result.count))
	var maximum := 1
	for count in counts: maximum = maxi(maximum, count)
	for id in BASES:
		var result: Dictionary = results.get(id, {})
		var bar: Button = bars[id].bar
		var ok := bool(result.get("ok", false))
		var count := int(result.get("count", 0))
		var color := Service.color_for(count, counts) if ok else Color("#e4eaf1")
		bar.add_theme_stylebox_override("normal", box(color, 7))
		bar.add_theme_stylebox_override("hover", box(color.lightened(0.12), 7))
		bar.add_theme_stylebox_override("pressed", box(color.darkened(0.1), 7))
		bar.add_theme_stylebox_override("disabled", box(color, 7))
		bar.add_theme_color_override("font_disabled_color", Color("#536b82"))
		bar.anchor_right = maxf(0.025, float(count) / maximum) if ok else 1.0
		bar.offset_right = 0
		bar.text = "" if ok else str(result.get("message", "Aguardando consulta"))
		bar.disabled = not ok
		bar.tooltip_text = "%s • %d veículos\n%s\nConsultado em %s\nClique para ver a lista" % [BASES[id], count, result.get("source", ""), result.get("queried_at", "")] if ok else str(result.get("message", "Aguardando consulta"))
		bars[id].number.text = str(count) if ok else "—"
		bars[id].number.tooltip_text = bar.tooltip_text
	if is_instance_valid(list_dialog): populate_list()

func open_list(id: String) -> void:
	if not results.get(id, {}).get("ok", false): return
	if is_instance_valid(list_dialog): list_dialog.queue_free()
	active_branch = id
	list_dialog = Window.new()
	list_dialog.title = "Veículos em manutenção • " + BASES[id]
	list_dialog.size = Vector2i(1280, 650)
	list_dialog.borderless = true
	list_dialog.min_size = Vector2i(820, 420)
	list_dialog.transient = true
	list_dialog.exclusive = true
	list_dialog.close_requested.connect(func(): list_dialog.queue_free())
	add_child(list_dialog)
	var light := Theme.new()
	light.default_font = preload("res://assets/fonts/Noto_Sans/static/NotoSans-Regular.ttf")
	light.default_font_size = 14
	for control in ["LineEdit", "OptionButton", "Tree"]:
		light.set_color("font_color", control, Color("#163d61"))
		light.set_stylebox("normal", control, box(Color.WHITE, 6))
		light.set_stylebox("panel", control, box(Color.WHITE, 6))
	light.set_color("font_selected_color", "Tree", Color("#163d61"))
	light.set_color("font_placeholder_color", "LineEdit", Color("#657d94"))
	light.set_stylebox("selected", "Tree", box(Color("#dceefe"), 4))
	light.set_stylebox("selected_focus", "Tree", box(Color("#dceefe"), 4))
	light.set_color("title_button_color", "Tree", Color("#163d61"))
	light.set_stylebox("title_button_normal", "Tree", box(Color("#e6eff8"), 4))
	list_dialog.theme = light
	var panel := PanelContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel.add_theme_stylebox_override("panel", box(Color("#f4f8fc")))
	list_dialog.add_child(panel)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 12)
	panel.add_child(stack)
	var header := PanelContainer.new()
	header.add_theme_stylebox_override("panel", box(Color("#175a94"), 10))
	stack.add_child(header)
	var title := label("Veículos em manutenção • " + BASES[id], 24)
	title.add_theme_color_override("font_color", Color.WHITE)
	header.add_child(title)
	var result: Dictionary = results[id]
	stack.add_child(label("Fonte: %s • Consulta: %s" % [result.get("source", ""), result.get("queried_at", "")], 12))
	var filters := HBoxContainer.new()
	stack.add_child(filters)
	list_search = LineEdit.new()
	list_search.placeholder_text = "Buscar cliente, placa ou série"
	list_search.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list_search.text_changed.connect(func(_value): populate_list())
	filters.add_child(list_search)
	list_apn = OptionButton.new()
	list_apn.add_item("Todas as APNs")
	var apns: Array = []
	for row in result.rows:
		if not str(row.apn).is_empty() and not apns.has(row.apn): apns.append(row.apn)
	apns.sort()
	for apn in apns: list_apn.add_item(str(apn))
	list_apn.item_selected.connect(func(_index): populate_list())
	filters.add_child(list_apn)
	list_tree = Tree.new()
	list_tree.columns = 6
	list_tree.hide_root = true
	list_tree.column_titles_visible = true
	list_tree.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var titles := ["Cliente", "Placa", "Equipamento", "APN", "Telefone chip", "Última comunicação"]
	for index in range(6):
		list_tree.set_column_title(index, titles[index])
		list_tree.set_column_expand_ratio(index, 2 if index in [0, 5] else 1)
	stack.add_child(list_tree)
	list_count = label("", 12)
	stack.add_child(list_count)
	var close := Button.new()
	close.text = "Fechar"
	style_button(close)
	close.pressed.connect(func(): list_dialog.queue_free())
	stack.add_child(close)
	populate_list()
	list_dialog.popup_centered()

func populate_list() -> void:
	if not is_instance_valid(list_tree): return
	list_tree.clear()
	var root := list_tree.create_item()
	var count := 0
	var query := list_search.text.strip_edges().to_lower()
	var result: Dictionary = results.get(active_branch, {})
	for row in result.get("rows", []):
		if not query.is_empty() and not (str(row.client) + " " + str(row.plate) + " " + str(row.serial)).to_lower().contains(query): continue
		if list_apn.selected > 0 and row.apn != list_apn.get_item_text(list_apn.selected): continue
		var item := list_tree.create_item(root)
		var keys := ["client", "plate", "serial", "apn", "phone", "updated_at"]
		for index in range(6):
			item.set_text(index, str(row.get(keys[index], "")))
			item.set_tooltip_text(index, str(row.get(keys[index], "")))
		count += 1
	list_count.text = "%d de %d veículos • Consulta somente leitura" % [count, result.get("count", 0)]
