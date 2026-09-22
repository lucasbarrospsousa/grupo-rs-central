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
var list_rows: VBoxContainer
var list_search: LineEdit
var list_apn: OptionButton
var list_base: OptionButton
var list_status: Label
var list_title: Label
var list_scroll: ScrollContainer
var list_refresh: Button
var list_pages: HBoxContainer
var list_count: Label
var active_branch := ""
var page := 0
var filtered_rows: Array = []
var detail_dialog: Window
const PAGE_SIZE := 8
var page_size:=8
var collapsed_groups:Dictionary={}
var list_base_badge:Label
var list_total_badge:Label

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
	if is_instance_valid(list_dialog): populate_list()

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
	page = 0
	list_dialog = Window.new()
	list_dialog.title = "Manutenção na plataforma"
	list_dialog.size = Vector2i(mini(1262,get_viewport_rect().size.x-32), mini(848,get_viewport_rect().size.y-40))
	list_dialog.transparent_bg=true
	list_dialog.borderless = true
	list_dialog.min_size = Vector2i(820, 420)
	list_dialog.transient = true
	list_dialog.exclusive = true
	list_dialog.close_requested.connect(func(): list_dialog.queue_free())
	list_dialog.window_input.connect(func(event):
		if event is InputEventKey and event.pressed and event.keycode==KEY_ESCAPE:list_dialog.queue_free())
	add_child(list_dialog)
	var light := Theme.new()
	light.default_font = preload("res://assets/fonts/Noto_Sans/static/NotoSans-Regular.ttf")
	light.default_font_size = 14
	for control in ["LineEdit", "OptionButton", "PopupMenu"]:
		light.set_color("font_color", control, Color("#163d61"))
		var field_style := box(Color.WHITE, 6)
		field_style.border_color = Color("#ccdbea")
		field_style.set_border_width_all(1)
		light.set_stylebox("normal", control, field_style)
		light.set_stylebox("panel", control, box(Color.WHITE, 6))
	light.set_color("font_placeholder_color", "LineEdit", Color("#657d94"))
	list_dialog.theme = light
	var shade:=ColorRect.new();shade.color=Color(0.02,0.08,0.19,0.60);get_tree().root.add_child(shade);shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);list_dialog.tree_exiting.connect(shade.queue_free)
	var panel := PanelContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var main_style:=box(Color.WHITE,20);main_style.content_margin_left=30;main_style.content_margin_right=30;main_style.content_margin_top=26;main_style.content_margin_bottom=24
	panel.add_theme_stylebox_override("panel",main_style)
	list_dialog.add_child(panel)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 12)
	panel.add_child(stack)
	var header_panel := PanelContainer.new()
	header_panel.add_theme_stylebox_override("panel", StyleBoxEmpty.new())
	stack.add_child(header_panel)
	var header := HBoxContainer.new()
	header_panel.add_child(header)
	var titles := VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(titles)
	titles.add_child(label("Visão geral   /   Manutenções",13))
	var title_row:=HBoxContainer.new();title_row.add_theme_constant_override("separation",12);titles.add_child(title_row)
	list_title = label("Veículos em manutenção", 29)
	list_title.add_theme_font_override("font",preload("res://assets/fonts/Noto_Sans/static/NotoSans-Bold.ttf"))
	list_title.add_theme_color_override("font_color", Color("#07153f"))
	title_row.add_child(list_title)
	list_base_badge=label("",18);list_base_badge.add_theme_stylebox_override("normal",box(Color("#e0f1ff"),16));list_base_badge.add_theme_color_override("font_color",Color("#0064ca"));title_row.add_child(list_base_badge)
	list_total_badge=label("",17);list_total_badge.add_theme_stylebox_override("normal",box(Color("#045ba9"),20));list_total_badge.add_theme_color_override("font_color",Color.WHITE);title_row.add_child(list_total_badge)
	var subtitle := label("Consulte os veículos da base, organizados por APN.", 13)
	subtitle.add_theme_color_override("font_color", Color("#345885"))
	titles.add_child(subtitle)
	list_refresh = Button.new()
	list_refresh.size_flags_vertical=Control.SIZE_SHRINK_CENTER
	list_refresh.custom_minimum_size.y=46
	list_refresh.text = "↻  Atualizar lista"
	style_button(list_refresh)
	list_refresh.add_theme_stylebox_override("normal", box(Color("#f5faff"), 8))
	list_refresh.add_theme_stylebox_override("hover", box(Color("#e5f2ff"), 8))
	list_refresh.add_theme_color_override("font_color", Color("#005acd"))
	list_refresh.add_theme_color_override("font_hover_color", Color("#005acd"))
	list_refresh.pressed.connect(func(): page = 0; load_all())
	header.add_child(list_refresh)
	var close := Button.new()
	close.text = "×"
	close.size_flags_vertical=Control.SIZE_SHRINK_CENTER
	style_button(close)
	close.add_theme_stylebox_override("normal", box(Color.WHITE, 10))
	close.add_theme_color_override("font_color",Color("#0c2850"))
	close.pressed.connect(func(): list_dialog.queue_free())
	header.add_child(close)
	var filters := HBoxContainer.new()
	stack.add_child(filters)
	list_search = LineEdit.new()
	list_search.placeholder_text = "Buscar cliente, placa ou equipamento"
	list_search.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list_search.text_changed.connect(func(_value): page = 0; populate_list())
	filters.add_child(list_search)
	list_base = OptionButton.new()
	list_base.custom_minimum_size.x = 230
	list_base.add_item("Todas as bases")
	list_base.set_item_metadata(0, "")
	for branch_id in BASES:
		list_base.add_item("Base: "+BASES[branch_id])
		list_base.set_item_metadata(list_base.item_count - 1, branch_id)
		if branch_id == id: list_base.select(list_base.item_count - 1)
	list_base.item_selected.connect(func(index): active_branch = str(list_base.get_item_metadata(index)); page = 0; populate_list())
	filters.add_child(list_base)
	list_apn = OptionButton.new()
	list_apn.custom_minimum_size.x = 230
	list_apn.add_item("APN: Todas")
	list_apn.item_selected.connect(func(_index): page = 0; populate_list())
	filters.add_child(list_apn)
	var notice := PanelContainer.new()
	notice.add_theme_stylebox_override("panel", box(Color("#e4f2ff"), 7))
	stack.add_child(notice)
	list_status = label("", 13)
	list_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	notice.add_child(list_status)
	var headings := PanelContainer.new()
	var heading_style := box(Color("#e0e8f3"), 6)
	heading_style.content_margin_right = 34
	headings.add_theme_stylebox_override("panel", heading_style)
	stack.add_child(headings)
	var heading_row := HBoxContainer.new()
	headings.add_child(heading_row)
	var columns := ["Cliente", "Placa", "Equipamento", "APN", "Telefone chip", "Última comunicação"]
	for index in range(6):
		var heading := cell(columns[index], index)
		heading.add_theme_color_override("font_color", Color("#07153f"))
		heading_row.add_child(heading)
	list_scroll = ScrollContainer.new()
	list_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	list_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	list_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_ALWAYS
	stack.add_child(list_scroll)
	list_rows = VBoxContainer.new()
	list_rows.add_theme_constant_override("separation", 1)
	list_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list_scroll.add_child(list_rows)
	var footer := HBoxContainer.new()
	stack.add_child(footer)
	list_count = label("", 12)
	list_count.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	footer.add_child(list_count)
	var per_page:=OptionButton.new();per_page.add_item("8 por página");per_page.add_item("16 por página");per_page.add_item("25 por página");per_page.item_selected.connect(func(index):page_size=[8,16,25][index];page=0;populate_list());footer.add_child(per_page)
	list_pages = HBoxContainer.new()
	footer.add_child(list_pages)
	populate_list()
	list_dialog.popup_centered()
	list_dialog.position.x=mini(get_viewport_rect().size.x-list_dialog.size.x-20,(get_viewport_rect().size.x+95-list_dialog.size.x)/2)

static func cell(value: String, index: int) -> Label:
	var node := label(value, 14)
	node.custom_minimum_size.x = [230, 135, 155, 110, 190, 190][index]
	if index == 0: node.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	node.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	node.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	node.clip_text = true
	node.tooltip_text = value
	return node

static func badge(value: String, width: float, color: Color) -> Control:
	var holder := HBoxContainer.new()
	holder.custom_minimum_size.x = width
	holder.alignment = BoxContainer.ALIGNMENT_BEGIN
	var panel := PanelContainer.new()
	panel.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var style := box(color, 7)
	style.content_margin_left = 8
	style.content_margin_right = 8
	style.content_margin_top = 3
	style.content_margin_bottom = 3
	panel.add_theme_stylebox_override("panel", style)
	holder.add_child(panel)
	var text := label(value, 14)
	text.add_theme_color_override("font_color", Color.WHITE)
	text.clip_text = true
	text.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	text.custom_minimum_size.x = minf(width - 20, maxf(44, value.length() * 8))
	text.tooltip_text = value
	panel.add_child(text)
	return holder

static func group_key(row: Dictionary) -> String:
	return str(row.base) + "|" + str(row.apn).strip_edges().to_lower()

static func ignore_mouse(node: Control) -> void:
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for child in node.get_children():
		if child is Control: ignore_mouse(child)

static func empty_children(container: Node) -> void:
	for child in container.get_children():
		container.remove_child(child)
		child.queue_free()

func populate_list() -> void:
	if not is_instance_valid(list_rows): return
	empty_children(list_rows)
	empty_children(list_pages)
	var apn_selection := list_apn.get_item_text(list_apn.selected) if list_apn.selected > 0 else ""
	var apns: Array = []
	for id in BASES:
		if active_branch != "" and id != active_branch: continue
		for row in results.get(id, {}).get("rows", []):
			if not str(row.apn).is_empty() and not apns.has(row.apn): apns.append(row.apn)
	apns.sort()
	list_apn.clear()
	list_apn.add_item("APN: Todas")
	for apn in apns:
		list_apn.add_item(str(apn))
		if apn == apn_selection: list_apn.select(list_apn.item_count - 1)
	if not apns.has(apn_selection): apn_selection = ""
	var confirmed: Array = []
	var pending: Array = []
	for id in BASES:
		if results.get(id, {}).get("ok", false): confirmed.append(BASES[id])
		else: pending.append(BASES[id])
	list_refresh.disabled = busy or not credentials_for.is_valid()
	list_status.text = "Consulta completa • 4 bases disponíveis" if pending.is_empty() else "Consulta parcial • Disponíveis: %s • Pendentes: %s" % [", ".join(confirmed) if not confirmed.is_empty() else "nenhuma", ", ".join(pending)]
	if busy: list_status.text = "Atualizando listas… • " + list_status.text
	list_status.tooltip_text = "\n".join(BASES.keys().map(func(id): return "%s • %s • %s" % [BASES[id], results.get(id, {}).get("source", ""), results.get(id, {}).get("queried_at", results.get(id, {}).get("message", "Aguardando"))]))
	var query := list_search.text.strip_edges().to_lower()
	filtered_rows.clear()
	for id in BASES:
		if active_branch != "" and id != active_branch: continue
		var result: Dictionary = results.get(id, {})
		if not result.get("ok", false): continue
		for source in result.get("rows", []):
			if not query.is_empty() and not (str(source.client) + " " + str(source.plate) + " " + str(source.serial)).to_lower().contains(query): continue
			if apn_selection != "" and source.apn != apn_selection: continue
			var row: Dictionary = source.duplicate()
			row["base"] = id
			row["source"] = result.get("source", "")
			row["queried_at"] = result.get("queried_at", "")
			row["order"] = filtered_rows.size()
			filtered_rows.append(row)
	filtered_rows.sort_custom(func(a, b): return int(a.order) < int(b.order) if group_key(a) == group_key(b) else group_key(a) < group_key(b))
	var group_totals := {}
	for row in filtered_rows:
		var key := group_key(row)
		group_totals[key] = int(group_totals.get(key, 0)) + 1
	list_title.text = "Veículos em manutenção"
	list_base_badge.text=BASES.get(active_branch,"Todas as bases")
	list_total_badge.text="%d veículos" % filtered_rows.size()
	if confirmed.is_empty() or (active_branch != "" and not results.get(active_branch, {}).get("ok", false)):
		list_total_badge.text="Consulta pendente"
	var pages := maxi(1, ceili(float(filtered_rows.size()) / page_size))
	page = clampi(page, 0, pages - 1)
	var previous_group := ""
	for index in range(page * page_size, mini((page + 1) * page_size, filtered_rows.size())):
		var data: Dictionary = filtered_rows[index]
		var key := group_key(data)
		if key != previous_group:
			var group := PanelContainer.new()
			group.set_meta("apn_group", key)
			group.set_meta("group_count", group_totals[key])
			group.add_theme_stylebox_override("panel", box(Color("#e6f3ff"), 7))
			var group_row := HBoxContainer.new()
			group_row.add_theme_constant_override("separation", 16)
			group.add_child(group_row)
			var group_text := label("⌄  %sAPN: %s" % [(str(BASES[data.base]) + "  •  ") if active_branch == "" else "", str(data.apn).to_upper() if str(data.apn) != "" else "NÃO INFORMADA"], 17)
			group_text.add_theme_color_override("font_color", Color("#102653"))
			group_row.add_child(group_text)
			var counter := PanelContainer.new()
			var counter_style := box(Color("#c7e4ff"), 14)
			counter_style.content_margin_top = 3
			counter_style.content_margin_bottom = 3
			counter_style.content_margin_left = 10
			counter_style.content_margin_right = 10
			counter.add_theme_stylebox_override("panel", counter_style)
			var counter_text := label(str(group_totals[key])+" veículos", 13)
			counter_text.add_theme_color_override("font_color", Color("#005acd"))
			counter.add_child(counter_text)
			counter.tooltip_text = "Total deste grupo nos filtros atuais, incluindo outras páginas"
			group_row.add_child(counter)
			list_rows.add_child(group)
			ignore_mouse(group_row)
			group.gui_input.connect(func(event):
				if event is InputEventMouseButton and event.button_index==MOUSE_BUTTON_LEFT and event.pressed:
					collapsed_groups[key]=not bool(collapsed_groups.get(key,false));populate_list())
			previous_group = key
		if collapsed_groups.get(key,false):continue
		var panel := PanelContainer.new()
		panel.set_meta("vehicle_row", data)
		var style := box(Color.WHITE if index % 2 == 0 else Color("#f5f7fa"), 0)
		style.content_margin_top = 3
		style.content_margin_bottom = 3
		panel.add_theme_stylebox_override("panel", style)
		list_rows.add_child(panel)
		var row := HBoxContainer.new()
		panel.add_child(row)
		var values := [data.client, data.plate, data.serial]
		for column in range(3):
			var text_cell:=cell(str(values[column]), column)
			if column==1:text_cell.add_theme_font_override("font",preload("res://assets/fonts/Noto_Sans/static/NotoSans-Bold.ttf"))
			row.add_child(text_cell)
		row.add_child(badge(str(data.apn) if str(data.apn) != "" else "Não informada", 110, Color("#168955")))
		var phone:=HBoxContainer.new();phone.custom_minimum_size.x=190;var phone_label:=label(str(data.phone) if str(data.phone)!="" else "Não informado",14);phone.add_child(phone_label);var copy:=Button.new();copy.text="▢";copy.add_theme_color_override("font_color",Color("#0064c9"));copy.flat=true;copy.tooltip_text="Copiar telefone do chip";copy.pressed.connect(func():DisplayServer.clipboard_set(str(data.phone)));phone.add_child(copy);row.add_child(phone)
		row.add_child(cell(str(data.updated_at).replace(" ","\n"), 5))
		for child in row.get_children():
			if child!=phone:ignore_mouse(child)
		panel.tooltip_text = "Clique para ver detalhes • " + str(BASES[data.base])
		panel.gui_input.connect(func(event):
			if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed: show_details(data))
	if filtered_rows.is_empty():
		var unavailable: bool = confirmed.is_empty() or (active_branch != "" and not results.get(active_branch, {}).get("ok", false))
		list_rows.add_child(label("Lista indisponível. Confira as bases pendentes no aviso da consulta." if unavailable else "Nenhum veículo encontrado com estes filtros.", 14))
	list_count.text = "%d–%d de %d veículos • Clique na linha para detalhes" % [0 if filtered_rows.is_empty() else page * page_size + 1, mini((page + 1) * page_size, filtered_rows.size()), filtered_rows.size()]
	page_button("Anterior", page - 1, page == 0)
	var page_numbers: Array = [0]
	for number in range(maxi(0, page - 1), mini(pages, page + 3)):
		if not page_numbers.has(number): page_numbers.append(number)
	if not page_numbers.has(pages - 1): page_numbers.append(pages - 1)
	var previous := -1
	for number in page_numbers:
		if previous >= 0 and number > previous + 1: list_pages.add_child(label("…"))
		page_button(str(number + 1), number, false)
		previous = number
	page_button("Próxima", page + 1, page == pages - 1)

func page_button(value: String, target: int, disabled: bool) -> void:
	var button := Button.new()
	button.text = value
	style_button(button)
	button.disabled = disabled
	if target == page: button.add_theme_stylebox_override("normal", box(Color("#0065ce"), 6))
	else:
		button.add_theme_stylebox_override("normal",box(Color("#f3f8ff"),6));button.add_theme_color_override("font_color",Color("#0065ce"))
	button.pressed.connect(func(): page = target; list_scroll.scroll_vertical = 0; populate_list())
	list_pages.add_child(button)

func show_details(data: Dictionary) -> void:
	if is_instance_valid(detail_dialog): detail_dialog.queue_free()
	detail_dialog = Window.new()
	detail_dialog.title = "Detalhes • " + str(data.plate)
	detail_dialog.size = Vector2i(620, 440)
	detail_dialog.transient = true
	detail_dialog.exclusive = true
	detail_dialog.borderless = true
	detail_dialog.theme = list_dialog.theme
	list_dialog.add_child(detail_dialog)
	detail_dialog.close_requested.connect(func(): detail_dialog.queue_free())
	var panel := PanelContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel.add_theme_stylebox_override("panel", box(Color("#f4f8fc")))
	detail_dialog.add_child(panel)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 13)
	panel.add_child(stack)
	stack.add_child(label("%s • %s" % [BASES[data.base], data.plate], 22))
	for field in [["Cliente", "client"], ["Aparelho", "serial"], ["APN", "apn"], ["Telefone do chip", "phone"], ["Última comunicação", "updated_at"], ["Fonte", "source"], ["Consultado em", "queried_at"]]:
		var value := str(data.get(field[1], ""))
		var line := label("%s: %s" % [field[0], value if value != "" else "Não informado pela plataforma"], 14)
		line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		stack.add_child(line)
	var close := Button.new()
	close.text = "Fechar detalhes"
	style_button(close)
	close.pressed.connect(func(): detail_dialog.queue_free())
	stack.add_child(close)
	detail_dialog.popup_centered()
