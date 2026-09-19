extends VBoxContainer
const Service = preload("res://src/services/stock_link.gd")
var host: Node
var service: Node
var selected := ""
var filter := "Todos"
var search: LineEdit
var plate: LineEdit
var rows: VBoxContainer
var pending: VBoxContainer
var editor: VBoxContainer
var selection: Label
var current_status: Label
var feedback: Label
var count: Label
var submit: Button
var refresh_button: Button
var filters: Array[Button] = []
var confirmation: ConfirmationDialog

func setup(owner_node: Node) -> void:
	host = owner_node
	service = host._stock_link_service()
	service.progress.connect(show_progress)
	service.finished.connect(show_result)
	theme = Theme.new()
	theme.default_font = preload("res://assets/fonts/Noto_Sans/static/NotoSans-Regular.ttf")
	theme.default_font_size = 15
	theme.set_color("font_color", "Label", Color("#17395f"))
	theme.set_color("font_color", "LineEdit", Color("#17395f"))
	theme.set_color("font_placeholder_color", "LineEdit", Color("#627b9b"))
	var field_style := StyleBoxFlat.new()
	field_style.bg_color = Color.WHITE
	field_style.border_color = Color("#ccdeef")
	field_style.set_border_width_all(1)
	field_style.set_corner_radius_all(9)
	field_style.content_margin_left = 14
	field_style.content_margin_right = 14
	theme.set_stylebox("normal", "LineEdit", field_style)
	var focus_style := field_style.duplicate()
	focus_style.border_color = Color("#0879d9")
	theme.set_stylebox("focus", "LineEdit", focus_style)
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 16)
	add_child(label("GRUPO RS CENTRAL / " + str(host.selected_branch_name).to_upper(), 12, "#627b9b"))
	var heading := HBoxContainer.new()
	add_child(heading)
	var title := label("Preparar aparelhos para estoque", 30)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	heading.add_child(title)
	refresh_button = button("Atualizar lista", refresh)
	heading.add_child(refresh_button)
	add_child(label("Selecione a série e informe a identificação para vincular ao cliente RS300.", 15, "#627b9b"))
	feedback = label("", 15)
	feedback.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	feedback.hide()
	add_child(feedback)
	var columns := HBoxContainer.new()
	columns.add_theme_constant_override("separation", 22)
	add_child(columns)
	var left := panel()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.size_flags_stretch_ratio = 1.4
	columns.add_child(left)
	var list := VBoxContainer.new()
	list.add_theme_constant_override("separation", 14)
	left.add_child(list)
	count = label("Aparelhos pendentes", 20)
	list.add_child(count)
	search = LineEdit.new()
	search.name = "StockLinkSearch"
	search.placeholder_text = "Buscar número de série…"
	search.custom_minimum_size.y = 44
	list.add_child(search)
	search.text_changed.connect(func(_text): render_rows())
	var filter_row := HBoxContainer.new()
	list.add_child(filter_row)
	for text in ["Todos", "Reserva", "Manutenção"]:
		var entry := button(text, func(): filter = text; render_rows())
		entry.toggle_mode = true
		filters.append(entry)
		filter_row.add_child(entry)
	var header := HBoxContainer.new()
	list.add_child(header)
	var serial_header := label("Série / tipo", 13, "#627b9b")
	serial_header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(serial_header)
	header.add_child(label("Situação atual", 13, "#627b9b"))
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size.y = 380
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	list.add_child(scroll)
	rows = VBoxContainer.new()
	rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(rows)
	list.add_child(label("Reserva e Manutenção · banco local da filial", 12, "#627b9b"))
	pending = VBoxContainer.new()
	list.add_child(pending)
	var right := panel()
	right.custom_minimum_size.x = 370
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	columns.add_child(right)
	editor = VBoxContainer.new()
	editor.add_theme_constant_override("separation", 15)
	right.add_child(editor)
	var banner := PanelContainer.new()
	var skin := StyleBoxTexture.new()
	skin.texture = preload("res://assets/ui/sms_header.svg")
	for side in [SIDE_LEFT, SIDE_TOP, SIDE_RIGHT, SIDE_BOTTOM]: skin.set_content_margin(side, 16)
	banner.add_theme_stylebox_override("panel", skin)
	editor.add_child(banner)
	var banner_text := VBoxContainer.new()
	banner.add_child(banner_text)
	banner_text.add_child(label("Criar vínculo", 23, "#ffffff"))
	banner_text.add_child(label("Identificação de teste · cliente RS300", 13, "#e0efff"))
	editor.add_child(label("APARELHO SELECIONADO", 12, "#627b9b"))
	selection = label("Selecione uma série", 25)
	editor.add_child(selection)
	current_status = label("", 14, "#627b9b")
	editor.add_child(current_status)
	editor.add_child(HSeparator.new())
	editor.add_child(label("Placa / identificação", 15))
	plate = LineEdit.new()
	plate.name = "StockLinkPlate"
	plate.placeholder_text = "Ex.: GRS - 021"
	plate.custom_minimum_size.y = 48
	plate.add_theme_font_size_override("font_size", 20)
	editor.add_child(plate)
	editor.add_child(label("Cliente titular", 14, "#627b9b"))
	editor.add_child(label("RS300", 21))
	editor.add_child(label("Após confirmar o vínculo → Estoque", 16, "#087f58"))
	submit = button("Revisar vinculação", review, true)
	submit.name = "StockLinkReview"
	editor.add_child(submit)
	var hint := label("O cadastro só passa para Estoque após a confirmação na plataforma.", 13, "#627b9b")
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	editor.add_child(hint)
	confirmation = ConfirmationDialog.new()
	confirmation.title = "Confirmar vinculação"
	confirmation.ok_button_text = "Confirmar vínculo"
	confirmation.cancel_button_text = "Voltar"
	confirmation.confirmed.connect(confirm_link)
	add_child(confirmation)
	render_rows()
	set_busy(service.busy)
	if service.busy:
		show_progress("Vinculação em andamento. Aguarde a confirmação.")
	elif not service.last_result.is_empty(): show_result(service.last_result)
	if host.selected_branch_id != "imperatriz":
		show_progress("Vinculação disponível somente em Imperatriz nesta versão.")
		submit.disabled = true

func label(text: String, font_size: int = 15, color: String = "#17395f") -> Label:
	var result := Label.new()
	result.text = text
	result.add_theme_font_size_override("font_size", font_size)
	result.add_theme_color_override("font_color", Color(color))
	return result

func panel() -> PanelContainer:
	var result := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color.WHITE
	style.border_color = Color("#d7e4f3")
	style.set_border_width_all(1)
	style.set_corner_radius_all(16)
	for side in [SIDE_LEFT, SIDE_TOP, SIDE_RIGHT, SIDE_BOTTOM]: style.set_content_margin(side, 22)
	result.add_theme_stylebox_override("panel", style)
	return result

func button(text: String, action: Callable, primary: bool = false) -> Button:
	var result: Button = host._make_action_button(text, Color("#0879d9") if primary else Color.WHITE, Color("#d7e4f3"), Color.WHITE if primary else Color("#17395f"), Vector2(0, 44), action)
	var pressed := StyleBoxFlat.new()
	pressed.bg_color = Color("#0879d9") if primary else Color("#edf6ff")
	pressed.border_color = Color("#0879d9")
	pressed.set_border_width_all(1)
	pressed.set_corner_radius_all(9)
	pressed.content_margin_left = 12
	pressed.content_margin_right = 12
	result.add_theme_stylebox_override("pressed", pressed)
	var normal: StyleBox = result.get_theme_stylebox("normal").duplicate()
	normal.content_margin_left = 12
	normal.content_margin_right = 12
	result.add_theme_stylebox_override("normal", normal)
	return result

func refresh() -> void:
	if service.busy: return
	host.store.reload_db_from_disk()
	render_rows()

func render_rows() -> void:
	for child in rows.get_children(): rows.remove_child(child); child.queue_free()
	for child in pending.get_children(): pending.remove_child(child); child.queue_free()
	for item in service.local_pending():
		var recovery := button("Conferir gravação pendente · " + str(item.serial), func(): choose(str(item.sku)); plate.text = str(item.plate); review())
		recovery.disabled = service.busy
		pending.add_child(recovery)
	var available: Array = []
	for product in host.store.get_products():
		if Service.eligible(product): available.append(product)
	count.text = "Aparelhos pendentes · %d" % available.size()
	var shown := 0
	for product in available:
		var state := "Reserva" if str(product.get("status", "")).to_lower() == "reserva" else "Manutenção"
		var serial := str(product.get("imei", product.get("sku", "")))
		var query := search.text.strip_edges()
		if (filter != "Todos" and state != filter) or (query != "" and not serial.contains(query)): continue
		shown += 1
		var entry := button("", func(): choose(str(product.get("sku", ""))))
		entry.custom_minimum_size.y = 65
		entry.tooltip_text = "Selecionar " + serial
		var line := HBoxContainer.new()
		line.mouse_filter = Control.MOUSE_FILTER_IGNORE
		entry.add_child(line)
		line.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		line.offset_left = 14
		line.offset_right = -14
		line.offset_top = 8
		line.offset_bottom = -8
		var detail := VBoxContainer.new()
		detail.mouse_filter = Control.MOUSE_FILTER_IGNORE
		detail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		line.add_child(detail)
		detail.add_child(label(serial, 16))
		detail.add_child(label(str(product.get("model", "")), 12, "#627b9b"))
		var badge := label(state, 13, "#356697" if state == "Reserva" else "#98601a")
		badge.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		line.add_child(badge)
		entry.alignment = HORIZONTAL_ALIGNMENT_LEFT
		entry.toggle_mode = true
		entry.button_pressed = selected == str(product.get("sku", ""))
		entry.disabled = service.busy
		rows.add_child(entry)
	if shown == 0: rows.add_child(label("Nenhum aparelho encontrado.", 15, "#627b9b"))
	for entry in filters: entry.button_pressed = entry.text == filter
	submit.disabled = selected == "" or service.busy or host.selected_branch_id != "imperatriz"

func choose(sku: String) -> void:
	if service.busy: return
	selected = sku
	var product: Dictionary = host.store.get_product(sku)
	selection.text = str(product.get("imei", sku))
	current_status.text = str(product.get("tracker_status", product.get("status", "")))
	render_rows()

func review() -> void:
	if service.busy or selected == "": return
	var normalized := Service.format_plate(plate.text)
	if normalized == "": show_progress("Informe uma identificação como AAA - 0123 ou GRS - 021."); return
	plate.text = normalized
	confirmation.dialog_text = "Série: %s\nIdentificação: %s\nCliente titular: RS300\nApós confirmação: Estoque\n\nCriar e confirmar este vínculo na plataforma?" % [selection.text, plate.text]
	confirmation.popup_centered(Vector2i(500, 250))

func confirm_link() -> void:
	if service.busy or selected == "": return
	set_busy(true)
	# Service belongs to the dashboard, not this view; navigation cannot kill a write.
	service.run(selected, plate.text)

func set_busy(value: bool) -> void:
	plate.editable = not value
	search.editable = not value
	refresh_button.disabled = value
	for entry in filters: entry.disabled = value
	for entry in rows.get_children():
		if entry is Button: entry.disabled = value
	submit.disabled = value or selected == "" or host.selected_branch_id != "imperatriz"
	submit.text = "Confirmando vínculo…" if value else "Revisar vinculação"

func show_progress(message: String) -> void:
	feedback.text = message
	feedback.add_theme_color_override("font_color", Color("#17395f"))
	feedback.show()

func show_result(result: Dictionary) -> void:
	set_busy(false)
	show_progress(str(result.get("message", "")))
	feedback.add_theme_color_override("font_color", Color("#078154") if result.get("ok", false) else Color("#aa5511"))
	if result.get("ok", false):
		selected = ""
		selection.text = "Selecione outra série"
		current_status.text = ""
		plate.text = ""
		render_rows()
