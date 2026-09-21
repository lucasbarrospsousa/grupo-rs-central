extends VBoxContainer
const Service = preload("res://src/services/maintenance_visits.gd")
const Motion = preload("res://src/ui/card_hover_motion.gd")
const STATES := {"pendente": "Em análise", "aguardando_peca": "Aguardando peça", "aguardando_cliente": "Aguardando cliente", "concluido": "Concluída", "cancelado": "Cancelada"}
var host: Node
var service: Node
var branch := ""
var generation := 0
var body: VBoxContainer
var notice: Label
var search: LineEdit
var picker: VBoxContainer
var vehicle: OptionButton
var device: LineEdit
var reason: OptionButton
var state: OptionButton
var technician: LineEdit
var note: TextEdit
var diagnosis: TextEdit
var solution: TextEdit
var departure: LineEdit
var departure_box: VBoxContainer
var save_button: Button
var timer: Timer
var selected_client: Dictionary = {}
var vehicles: Array = []
var editing: Dictionary = {}
var list_search: LineEdit
var list_state: OptionButton
var cards: GridContainer
var count: Label
var lookup_busy := false
var date_filter: LineEdit
var filtered: Array = []
var metrics: HBoxContainer
var list_scroll: ScrollContainer
var form_layer: CanvasLayer
var form_panel: PanelContainer
var list_notice: Label

func text(value: String, font_size: int = 15, color: String = "#173b5d") -> Label:
	var node := Label.new()
	node.text = value
	node.add_theme_font_size_override("font_size", font_size)
	node.add_theme_color_override("font_color", Color(color))
	node.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return node

func button(value: String, callback: Callable, primary: bool = false) -> Button:
	return host._make_action_button(value, Color("#ff8d1b") if primary else Color.WHITE, Color("#cbddeb"), Color("#173b5d"), Vector2(125, 42), callback)

func panel(parent: Node) -> VBoxContainer:
	var surface := PanelContainer.new()
	var style: StyleBoxFlat = host._style_box(Color.WHITE, Color("#d8e5ef"), 1, 16, true)
	for side in [SIDE_LEFT, SIDE_RIGHT, SIDE_TOP, SIDE_BOTTOM]: style.set_content_margin(side, 18)
	surface.add_theme_stylebox_override("panel", style)
	parent.add_child(surface)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 12)
	surface.add_child(box)
	return box

func setup(controller: Node, injected: Node = null) -> void:
	host = controller
	branch = str(host.selected_branch_id)
	name = "MaintenanceVisits"
	theme = Theme.new()
	theme.default_font = preload("res://assets/fonts/Noto_Sans/static/NotoSans-Regular.ttf")
	theme.default_font_size = 15
	for kind in ["LineEdit", "TextEdit", "OptionButton"]:
		for style_name in ["normal", "read_only", "disabled", "hover", "pressed", "focus"]:
			var style: StyleBoxFlat = host._style_box(Color("#f7faff") if style_name in ["read_only", "disabled"] else Color.WHITE, Color("#cbddeb"), 1, 9)
			for side in [SIDE_LEFT, SIDE_RIGHT]: style.set_content_margin(side, 12)
			for side in [SIDE_TOP, SIDE_BOTTOM]: style.set_content_margin(side, 9)
			theme.set_stylebox(style_name, kind, style)
		for color_name in ["font_color", "font_hover_color", "font_pressed_color", "font_readonly_color", "font_uneditable_color", "font_disabled_color"]:
			theme.set_color(color_name, kind, Color("#193c5c"))
		theme.set_color("font_placeholder_color", kind, Color("#67839a"))
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 14)
	service = injected if injected != null else Service.new()
	add_child(service)
	if injected == null:
		service.decode_body = host._decode_http_body_bytes
		var vault: Node = host._secret_vault()
		if vault != null:
			var config: Dictionary = vault.merge_secrets("app", {}, host.SecretVaultScript.APP_SECRET_KEYS)
			service.credentials = {"username": config.get("grupo_rs_modern_user", ""), "password": config.get("grupo_rs_modern_password", "")}
	notice = text("", 14, "#55758e")
	list_notice = notice
	add_child(notice)
	var scroll := ScrollContainer.new()
	list_scroll = scroll
	# Hide the bar without disabling wheel, touch or keyboard scrolling.
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(scroll)
	body = VBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 16)
	scroll.add_child(body)
	timer = Timer.new()
	timer.one_shot = true
	timer.wait_time = 0.5
	timer.timeout.connect(find_clients)
	add_child(timer)
	show_list()

func clear_body() -> void:
	close_form()
	generation += 1
	timer.stop()
	for node in body.get_children():
		body.remove_child(node)
		node.queue_free()

func valid(ticket: int) -> bool:
	return is_inside_tree() and generation == ticket and str(host.selected_branch_id) == branch

func show_list() -> void:
	clear_body()
	var heading := HBoxContainer.new()
	body.add_child(heading)
	var title := text("Manutenções", 28)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	heading.add_child(title)
	heading.add_child(button("Exportar PDF", export_pdf))
	heading.add_child(button("Novo atendimento", func(): show_form(), true))
	metrics = HBoxContainer.new()
	metrics.add_theme_constant_override("separation", 12)
	body.add_child(metrics)
	var filters := HBoxContainer.new()
	panel(body).add_child(filters)
	list_search = LineEdit.new()
	list_search.placeholder_text = "Nome, placa ou série"
	list_search.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	filters.add_child(list_search)
	list_state = OptionButton.new()
	list_state.add_item("Todas as situações")
	for key in STATES: list_state.add_item(STATES[key])
	filters.add_child(list_state)
	date_filter = LineEdit.new()
	date_filter.placeholder_text = "Entrada desde AAAA-MM-DD"
	date_filter.custom_minimum_size.x = 240
	filters.add_child(date_filter)
	count = text("")
	body.add_child(count)
	cards = GridContainer.new()
	cards.columns = 2
	cards.add_theme_constant_override("h_separation", 16)
	cards.add_theme_constant_override("v_separation", 16)
	body.add_child(cards)
	list_search.text_changed.connect(func(_value): render_cards())
	list_state.item_selected.connect(func(_index): render_cards())
	date_filter.text_changed.connect(func(_value): render_cards())
	render_cards()

func render_cards() -> void:
	for node in cards.get_children():
		cards.remove_child(node)
		node.queue_free()
	var shown := 0
	filtered.clear()
	var rows: Array = host.store.get_maintenances(true)
	rows.reverse()
	for item in rows:
		var query := list_search.text.strip_edges().to_lower()
		if query != "" and not (str(item.client) + " " + str(item.plate) + " " + str(item.serial)).to_lower().contains(query): continue
		var state_key := str(item.status)
		if list_state.selected > 0 and state_key != STATES.keys()[list_state.selected - 1]: continue
		if date_filter.text != "" and str(item.get("created_at", "")).left(10) < date_filter.text: continue
		shown += 1
		filtered.append(item.duplicate(true))
		var box := panel(cards)
		var color := "#19865a" if state_key == "concluido" else ("#ac701c" if state_key == "pendente" else "#317ab5")
		var card_style: StyleBoxFlat = box.get_parent().get_theme_stylebox("panel").duplicate()
		card_style.border_color = Color(color)
		card_style.border_width_left = 4
		box.get_parent().add_theme_stylebox_override("panel", card_style)
		box.get_parent().size_flags_horizontal = Control.SIZE_EXPAND_FILL
		box.add_child(text(str(item.plate), 21))
		box.add_child(text(str(item.client), 15, "#607d96"))
		box.add_child(text(str(STATES.get(state_key, state_key)), 14, color))
		box.add_child(text("Entrada: " + str(item.get("created_at", "")), 13))
		var out := str(item.get("departure_serial", ""))
		box.add_child(text("Chegada: " + str(item.serial) + "    →    Saída: " + (out if out != "" else "A definir"), 14))
		box.add_child(text(str(item.get("reason", "")), 16))
		box.add_child(text(str(item.get("note", "")), 14, "#607d96"))
		var open_button := button("Ver relatório", func(): show_form(item))
		open_button.size_flags_horizontal = Control.SIZE_SHRINK_END
		box.add_child(open_button)
		Motion.attach(box.get_parent())
	count.text = "%d atendimento(s) • histórico preservado por visita" % shown
	for node in metrics.get_children():
		metrics.remove_child(node)
		node.queue_free()
	var totals := [filtered.size(), 0, 0, 0]
	for item in filtered:
		if item.status == "pendente": totals[1] += 1
		if item.status in ["aguardando_peca", "aguardando_cliente"]: totals[2] += 1
		if item.status == "concluido": totals[3] += 1
	for i in range(4):
		var box := panel(metrics)
		box.get_parent().size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var style: StyleBoxFlat = box.get_parent().get_theme_stylebox("panel").duplicate()
		style.bg_color = Color(["#2879bf", "#ff931f", "#ffffff", "#234969"][i])
		box.get_parent().add_theme_stylebox_override("panel", style)
		var color := "#ffffff" if i in [0, 3] else "#173b5d"
		box.add_child(text(["Atendimentos", "Em análise", "Aguardando", "Concluídos"][i], 14, color))
		box.add_child(text(str(totals[i]), 30, color))
		Motion.attach(box.get_parent())

func export_pdf() -> void:
	var snapshot := filtered.duplicate(true)
	if snapshot.is_empty(): notice.text = "Nenhum atendimento para exportar."; return
	var dialog := FileDialog.new()
	dialog.file_mode = FileDialog.FILE_MODE_SAVE_FILE
	dialog.access = FileDialog.ACCESS_FILESYSTEM
	dialog.use_native_dialog = true
	dialog.filters = PackedStringArray(["*.pdf ; Relatório PDF"])
	dialog.current_file = "Manutencoes-" + branch + ".pdf"
	add_child(dialog)
	dialog.file_selected.connect(func(path):
		var result: Dictionary = host._run_inventory_report_generator({"report_type": "maintenance", "branch": branch, "visits": snapshot}, "pdf", path)
		notice.text = "PDF salvo em " + path if result.get("ok", false) else "Não foi possível gerar o PDF: " + str(result.get("error", ""))
		dialog.queue_free())
	dialog.canceled.connect(dialog.queue_free)
	dialog.popup_centered_ratio(0.7)

func field(parent: Node, title: String, control: Control) -> VBoxContainer:
	var box := VBoxContainer.new()
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.add_child(text(title, 14))
	control.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	control.custom_minimum_size.y = maxf(control.custom_minimum_size.y, 42)
	box.add_child(control)
	parent.add_child(box)
	return box

func show_form(item: Dictionary = {}) -> void:
	close_form()
	generation += 1
	timer.stop()
	editing = item.duplicate(true)
	selected_client = {}
	vehicles = []
	form_layer = CanvasLayer.new()
	form_layer.layer = 20
	add_child(form_layer)
	var backdrop := ColorRect.new()
	backdrop.color = Color(0.04, 0.1, 0.17, 0.25)
	form_layer.add_child(backdrop)
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var center := CenterContainer.new()
	form_layer.add_child(center)
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	form_panel = PanelContainer.new()
	form_panel.theme = theme
	form_panel.custom_minimum_size.x = 1140
	form_panel.add_theme_stylebox_override("panel", host._style_box(Color("#f4f8fc"), Color("#cbddeb"), 1, 18))
	center.add_child(form_panel)
	var shell := VBoxContainer.new()
	shell.add_theme_constant_override("separation", 0)
	form_panel.add_child(shell)
	var banner := PanelContainer.new()
	var banner_style := StyleBoxTexture.new()
	banner_style.texture = preload("res://assets/ui/sms_header.svg")
	for side in [SIDE_LEFT, SIDE_RIGHT, SIDE_TOP]: banner_style.set_texture_margin(side, 18)
	for side in [SIDE_LEFT, SIDE_RIGHT]: banner_style.set_content_margin(side, 22)
	for side in [SIDE_TOP, SIDE_BOTTOM]: banner_style.set_content_margin(side, 14)
	banner.add_theme_stylebox_override("panel", banner_style)
	shell.add_child(banner)
	var header := HBoxContainer.new()
	banner.add_child(header)
	var title := text("Cadastro de manutenção" if item.is_empty() else "Relatório de manutenção", 23, "#ffffff")
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	header.add_child(button("Fechar ×", close_form))
	var margin := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]: margin.add_theme_constant_override("margin_" + side, 18)
	shell.add_child(margin)
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation", 12)
	margin.add_child(content)
	var columns := HBoxContainer.new()
	columns.add_theme_constant_override("separation", 18)
	content.add_child(columns)
	var left := VBoxContainer.new()
	left.custom_minimum_size.x = 680
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_theme_constant_override("separation", 12)
	columns.add_child(left)
	var identity := panel(left)
	identity.add_theme_constant_override("separation", 8)
	search = LineEdit.new()
	search.placeholder_text = "Digite o nome do cliente"
	field(identity, "Nome do cliente", search)
	picker = VBoxContainer.new()
	identity.add_child(picker)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	identity.add_child(row)
	vehicle = OptionButton.new()
	vehicle.add_item("Selecione primeiro o cliente")
	vehicle.disabled = true
	field(row, "Veículo / placa", vehicle)
	device = LineEdit.new()
	device.editable = false
	device.placeholder_text = "Aparelho vinculado"
	field(row, "Aparelho de chegada", device)
	var report := panel(left)
	report.add_theme_constant_override("separation", 8)
	reason = OptionButton.new()
	for value in ["Selecione o motivo", "Sem comunicação", "Localização errada", "Troca de aparelho"]: reason.add_item(value)
	field(report, "Motivo da manutenção", reason)
	note = TextEdit.new()
	note.custom_minimum_size.y = 64
	field(report, "Relato do cliente / observações", note)
	var technical := HBoxContainer.new()
	technical.add_theme_constant_override("separation", 16)
	report.add_child(technical)
	diagnosis = TextEdit.new()
	solution = TextEdit.new()
	for entry in [diagnosis, solution]: entry.custom_minimum_size.y = 84
	field(technical, "Diagnóstico técnico", diagnosis)
	field(technical, "Solução / serviço realizado", solution)
	var details := panel(columns)
	details.custom_minimum_size.x = 310
	details.add_theme_constant_override("separation", 14)
	var side_style: StyleBoxFlat = details.get_parent().get_theme_stylebox("panel").duplicate()
	side_style.bg_color = Color("#e4eef7")
	details.get_parent().add_theme_stylebox_override("panel", side_style)
	details.add_child(text("ATENDIMENTO", 15))
	state = OptionButton.new()
	for key in STATES: state.add_item(STATES[key])
	field(details, "Situação", state)
	technician = LineEdit.new()
	field(details, "Responsável", technician)
	departure = LineEdit.new()
	departure_box = field(details, "Aparelho de saída após a troca", departure)
	departure_box.visible = false
	details.add_child(text("O vínculo de chegada fica preservado. A troca na plataforma deve ser confirmada separadamente.", 13, "#52738e"))
	notice = text("", 13, "#52738e")
	details.add_child(notice)
	save_button = button("Salvar atendimento", save, true)
	save_button.disabled = true
	save_button.size_flags_horizontal = Control.SIZE_SHRINK_END
	content.add_child(save_button)
	search.text_changed.connect(func(_value): invalidate_selection(); timer.start())
	search.text_submitted.connect(func(_value): timer.stop(); find_clients())
	vehicle.item_selected.connect(select_vehicle)
	reason.item_selected.connect(func(_index): departure_box.visible = reason.selected == 3)
	if not item.is_empty():
		search.text = str(item.client)
		search.editable = false
		timer.stop()
		vehicle.clear()
		vehicle.add_item(str(item.plate))
		device.text = str(item.serial)
		note.text = str(item.get("note", ""))
		diagnosis.text = str(item.get("diagnosis", ""))
		solution.text = str(item.get("solution", ""))
		technician.text = str(item.get("technician", ""))
		departure.text = str(item.get("departure_serial", ""))
		for i in range(reason.item_count):
			if reason.get_item_text(i) == str(item.get("reason", "")): reason.select(i)
		state.select(maxi(0, STATES.keys().find(str(item.status))))
		departure_box.visible = reason.selected == 3
		save_button.disabled = false
		notice.text = "Dados de identificação preservados do atendimento original."
	else: notice.text = "Digite ao menos 2 letras. Consulta de clientes e vínculos pelo portal autenticado."

func close_form() -> void:
	generation += 1
	if is_instance_valid(timer): timer.stop()
	if is_instance_valid(form_layer):
		remove_child(form_layer)
		form_layer.queue_free()
	form_layer = null
	notice = list_notice

func invalidate_selection() -> void:
	generation += 1
	selected_client.clear()
	vehicles.clear()
	device.text = ""
	vehicle.clear()
	vehicle.add_item("Selecione primeiro o cliente")
	vehicle.disabled = true
	save_button.disabled = true
	for node in picker.get_children():
		picker.remove_child(node)
		node.queue_free()

func find_clients() -> void:
	if not editing.is_empty(): return
	if lookup_busy: timer.start(); return
	var query := search.text.strip_edges()
	if query.length() < 2: return
	invalidate_selection()
	var ticket := generation
	notice.text = "Consultando clientes…"
	lookup_busy = true
	var result: Dictionary = await service.clients(query, branch)
	lookup_busy = false
	if not valid(ticket): return
	if not result.get("ok", false): notice.text = str(result.get("message", "Falha na consulta.")); return
	var clients: Array = result.get("clients", [])
	notice.text = "Selecione o cliente correto." if not clients.is_empty() else "Nenhum cliente encontrado."
	if not clients.is_empty():
		var results := OptionButton.new()
		results.custom_minimum_size.y = 38
		results.add_item("Selecione o cliente encontrado (%d)" % clients.size())
		results.fit_to_longest_item = false
		for client in clients: results.add_item(str(client.name) + " · cadastro " + str(client.id))
		results.item_selected.connect(func(index):
			if index > 0: choose_client(clients[index - 1]))
		picker.add_child(results)

func choose_client(client: Dictionary) -> void:
	if lookup_busy: return
	invalidate_selection()
	selected_client = client.duplicate(true)
	search.text = str(client.name)
	var ticket := generation
	picker.add_child(text("Cliente selecionado: " + str(client.name)))
	notice.text = "Consultando veículos…"
	lookup_busy = true
	var result: Dictionary = await service.vehicles(str(client.id), branch)
	lookup_busy = false
	if not valid(ticket): return
	if not result.get("ok", false): notice.text = str(result.get("message", "Falha ao consultar veículos.")); return
	vehicles = result.get("vehicles", [])
	vehicle.clear()
	vehicle.add_item("Selecione um veículo" if not vehicles.is_empty() else "Nenhum veículo vinculado")
	for entry in vehicles: vehicle.add_item(str(entry.plate) + " · " + str(entry.get("model", "")))
	vehicle.disabled = vehicles.is_empty()
	notice.text = "%d veículo(s) encontrado(s). Selecione apenas um." % vehicles.size()

func select_vehicle(index: int) -> void:
	device.text = str(vehicles[index - 1].serial) if index > 0 and index <= vehicles.size() else ""
	save_button.disabled = device.text == ""
	notice.text = "Vínculo consultado. Série registrada como aparelho de chegada." if device.text != "" else "Sem aparelho confirmado para este veículo. Confira o vínculo na plataforma."

func save() -> void:
	if str(host.selected_branch_id) != branch: notice.text = "A filial mudou. Abra novamente o atendimento."; return
	if reason.selected == 0: notice.text = "Selecione o motivo da manutenção."; return
	var values := editing.duplicate(true)
	if values.is_empty():
		if vehicle.selected <= 0 or device.text == "" or selected_client.is_empty(): return
		values = vehicles[vehicle.selected - 1].duplicate(true)
		values.client = selected_client.name
		values.client_id = selected_client.id
	values.reason = reason.get_item_text(reason.selected)
	values.status = STATES.keys()[state.selected]
	values.note = note.text
	values.diagnosis = diagnosis.text
	values.solution = solution.text
	values.technician = technician.text
	values.departure_serial = departure.text
	var result: Dictionary = host.store.save_maintenance_visit(values)
	notice.text = str(result.get("message", "Falha ao salvar."))
	if result.get("ok", false):
		show_list()
		notice.text = str(result.get("message", "Atendimento salvo."))
