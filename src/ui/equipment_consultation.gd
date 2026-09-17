extends VBoxContainer
const Service = preload("res://src/services/equipment_consultation.gd")
const Motion = preload("res://src/ui/card_hover_motion.gd")
var host: Node
var service: Node
var branch := ""
var search: LineEdit
var status: OptionButton
var mode: OptionButton
var search_button: Button
var notice: Label
var selected: Label
var picker: VBoxContainer
var rows_box: VBoxContainer
var counts: Array[Label] = []
var products: Array = []
var result_rows: Array = []
var linked: Variant = null
var customer := ""
var busy := false
var page := 0
var pagination: Label
var previous: Button
var next: Button
var missing_notice: Label

func label(value: String, font_size: int = 16, color: String = "#173b5d") -> Label:
	var node := Label.new()
	node.text = value
	node.add_theme_font_size_override("font_size", font_size)
	if font_size >= 19: node.add_theme_font_override("font",preload("res://assets/fonts/Noto_Sans/static/NotoSans-SemiBold.ttf"))
	node.add_theme_color_override("font_color", Color(color))
	return node

func card() -> PanelContainer:
	var node := PanelContainer.new()
	var style: StyleBox = host._style_box(Color.WHITE, Color("#d9e5f0"), 1, 18, true)
	for side in [SIDE_LEFT, SIDE_RIGHT]: style.set_content_margin(side, 22)
	for side in [SIDE_TOP, SIDE_BOTTOM]: style.set_content_margin(side, 14)
	node.add_theme_stylebox_override("panel", style)
	return node

func button(value: String, callback: Callable, primary: bool = false) -> Button:
	return host._make_action_button(value, Color("#1378d4") if primary else Color.WHITE, Color("#d1e1f1"), Color.WHITE if primary else Color("#173b5d"), Vector2(108, 42), callback)

func setup(controller: Node) -> void:
	host = controller
	branch = str(host.selected_branch_id)
	name = "EquipmentConsultation"
	theme = Theme.new()
	theme.default_font = preload("res://assets/fonts/Noto_Sans/static/NotoSans-Regular.ttf")
	theme.default_font_size = 15
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 12)
	products = host.store.get_products()
	service = Service.new()
	add_child(service)
	# Merge only; consultation never extracts/migrates settings or writes a vault.
	var vault: Node = host._secret_vault()
	if vault != null:
		var config: Dictionary = vault.merge_secrets("app", {}, host.SecretVaultScript.APP_SECRET_KEYS)
		service.credentials = {"username":config.get("grupo_rs_modern_user", ""), "password":config.get("grupo_rs_modern_password", "")}
	add_child(label("GRUPO RS CENTRAL  /  " + str(host.selected_branch_name).to_upper(), 12, "#65819e"))
	var title_row := HBoxContainer.new(); add_child(title_row)
	var title := label("Consultar",32); title.size_flags_horizontal=Control.SIZE_EXPAND_FILL; title_row.add_child(title)
	title_row.add_child(button("Atualizar vínculos",run_search))
	add_child(label("Encontre clientes e seus aparelhos. Confira somente os registros do banco local.", 15, "#65819e"))
	var search_card := card(); add_child(search_card)
	var filters := VBoxContainer.new(); search_card.add_child(filters); filters.add_theme_constant_override("separation", 14)
	filters.add_child(label("O que você deseja consultar?", 19))
	var line := HBoxContainer.new(); filters.add_child(line); line.add_theme_constant_override("separation", 10)
	mode = OptionButton.new(); mode.add_item("Cliente"); mode.add_item("Série ou placa"); line.add_child(mode); mode.hide()
	search = LineEdit.new(); search.name = "ConsultQuery"; search.placeholder_text = "Nome do cliente, série ou placa"; search.size_flags_horizontal = Control.SIZE_EXPAND_FILL; search.custom_minimum_size.y = 44; line.add_child(search)
	mode.item_selected.connect(func(_index): search.placeholder_text = "Nome do cliente" if mode.selected == 0 else "Série ou placa do aparelho")
	status = OptionButton.new(); status.custom_minimum_size.x = 180
	for value in ["Todos os status", "Instalado", "Manutenção", "Estoque", "Reserva", "Inativo"]: status.add_item(value)
	line.add_child(status)
	search_button = button("Buscar", run_search, true); line.add_child(search_button)
	line.add_child(button("Limpar", clear_search))
	search.text_submitted.connect(func(_text): run_search())
	status.item_selected.connect(func(_index): page = 0; render())
	filters.add_child(label("Por nome: a API identifica os vínculos. Os equipamentos exibidos vêm do banco desta base.", 13, "#65819e"))
	var customer_card := card(); add_child(customer_card)
	var selected_line := HBoxContainer.new(); customer_card.add_child(selected_line)
	var avatar := label("●",30,"#1784df"); avatar.custom_minimum_size.x=44; selected_line.add_child(avatar)
	selected = label("Nenhum cliente selecionado", 15); selected.size_flags_horizontal = Control.SIZE_EXPAND_FILL; selected_line.add_child(selected)
	selected_line.add_child(button("Trocar cliente", clear_search))
	picker = VBoxContainer.new(); filters.add_child(picker); picker.visible = false
	var metrics := HBoxContainer.new(); metrics.add_theme_constant_override("separation", 16); add_child(metrics)
	for item in [["Vínculos identificados", "#287ad1"], ["Encontrados no banco local", "#149978"], ["Fora do banco local", "#c28428"]]:
		var metric := card(); metric.size_flags_horizontal = Control.SIZE_EXPAND_FILL; metrics.add_child(metric)
		var metric_row := HBoxContainer.new(); metric_row.add_theme_constant_override("separation",18); metric.add_child(metric_row)
		var symbol := TextureRect.new()
		symbol.texture = load("res://assets/icons/consultation_" + ["links", "database", "warning"][counts.size()] + ".svg")
		symbol.custom_minimum_size=Vector2(34,34); symbol.expand_mode=TextureRect.EXPAND_IGNORE_SIZE; symbol.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED; symbol.size_flags_vertical=Control.SIZE_SHRINK_CENTER; metric_row.add_child(symbol)
		var box := VBoxContainer.new(); metric_row.add_child(box)
		var number := label("—", 26, item[1]); box.add_child(number); counts.append(number)
		box.add_child(label(item[0], 14, "#65819e")); Motion.attach(metric)
	var table_card := card(); table_card.size_flags_vertical = Control.SIZE_EXPAND_FILL; add_child(table_card)
	var table := VBoxContainer.new(); table.add_theme_constant_override("separation", 12); table_card.add_child(table)
	table.add_child(label("Equipamentos encontrados", 20))
	table.add_child(label("Dados locais • ações individuais • nenhuma alteração automática", 13, "#65819e"))
	var header_panel := PanelContainer.new(); table.add_child(header_panel)
	header_panel.add_theme_stylebox_override("panel",host._style_box(Color("#f1f6fc"),Color("#e0eaf3"),1,8))
	var header := HBoxContainer.new(); header.custom_minimum_size.y=36; header_panel.add_child(header)
	for i in range(7):
		var cell := label(["Cliente", "Placa", "Aparelho", "Operadora", "Telefone do chip", "Status", "Ações"][i], 13, "#65819e")
		cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		cell.size_flags_stretch_ratio = [2.0, 1.0, 1.15, 1.3, 1.5, 1.1, 1.4][i]; header.add_child(cell)
	var scroll := ScrollContainer.new(); scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL; scroll.custom_minimum_size.y = 120; table.add_child(scroll)
	rows_box = VBoxContainer.new(); rows_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL; rows_box.add_theme_constant_override("separation", 8); scroll.add_child(rows_box)
	missing_notice=label("",13,"#b77415"); table.add_child(missing_notice)
	var bottom := HBoxContainer.new(); table.add_child(bottom)
	pagination = label("", 13, "#65819e"); pagination.size_flags_horizontal = Control.SIZE_EXPAND_FILL; bottom.add_child(pagination)
	previous = button("Anterior", func(): page -= 1; render()); bottom.add_child(previous)
	next = button("Próxima", func(): page += 1; render()); bottom.add_child(next)
	notice = label("Escolha um filtro e clique em Buscar. Nenhuma consulta é feita enquanto você digita.", 14, "#65819e")
	notice.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; add_child(notice)
	call_deferred("animate_open")
	render()

func animate_open() -> void:
	for field in [search, status]:
		for state in ["normal", "focus", "hover", "pressed", "read_only", "disabled"]:
			var style: StyleBox = host._style_box(Color.WHITE, Color("#d1e1f1"), 1, 9)
			style.content_margin_left=14; style.content_margin_right=14
			field.add_theme_stylebox_override(state, style)
		field.add_theme_color_override("font_color", Color("#173b5d"))
		field.add_theme_color_override("font_placeholder_color", Color("#65819e"))
		field.add_theme_color_override("font_focus_color", Color("#173b5d"))
	if OS.get_environment("GRUPO_RS_REDUCED_MOTION") == "1": return
	modulate.a = 0
	create_tween().tween_property(self, "modulate:a", 1.0, 0.25)

func clear_search() -> void:
	if busy: return
	search.clear(); status.select(0); linked = null; customer = ""; page = 0
	selected.text = "Nenhum cliente selecionado"
	for child in picker.get_children(): child.queue_free()
	picker.hide(); render(); notice.text = "Filtros limpos. Nenhum cadastro foi alterado."

func set_busy(value: bool) -> void:
	busy = value; search_button.disabled = value; search.editable = not value; mode.disabled = value

func run_search() -> void:
	if busy: return
	var clean := search.text.strip_edges().replace(" ", "").replace("-", "")
	var plate := RegEx.new(); plate.compile("^[A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2}$")
	mode.select(1 if clean.is_valid_int() or plate.search(clean) != null else 0)
	linked = null; customer = ""; page = 0
	selected.text = "Nenhum cliente selecionado"
	for child in picker.get_children(): picker.remove_child(child); child.queue_free()
	picker.hide()
	if mode.selected == 1 or search.text.strip_edges() == "":
		render(); notice.text = "Consulta local concluída. Nenhum dado foi alterado."; return
	if search.text.strip_edges().length() < 3:
		linked=[]; render(); notice.text = "Digite pelo menos 3 letras do nome."; return
	set_busy(true); notice.text = "Buscando clientes na API de Imperatriz…"
	var response: Dictionary = await service.clients(search.text.strip_edges(), branch)
	if not is_inside_tree() or str(host.selected_branch_id) != branch: return
	set_busy(false)
	if not response.ok:
		linked = []; render(); notice.text = response.message; return
	linked = []; render()
	if response.clients.is_empty(): notice.text = "Nenhum cliente encontrado. Confira o nome e a base."; return
	if response.clients.size() == 1: choose_client(response.clients[0]); return
	picker.show(); notice.text = "Selecione o cliente correto. Homônimos são exibidos separadamente."
	var scroll := ScrollContainer.new(); scroll.custom_minimum_size.y = 120; picker.add_child(scroll)
	var options := VBoxContainer.new(); options.size_flags_horizontal = Control.SIZE_EXPAND_FILL; scroll.add_child(options)
	for client in response.clients:
		var choice := button(str(client.name) + "  •  cadastro " + str(client.id), choose_client.bind(client))
		choice.alignment = HORIZONTAL_ALIGNMENT_LEFT; options.add_child(choice)

func choose_client(client: Dictionary) -> void:
	if busy: return
	set_busy(true); picker.hide(); notice.text = "Conferindo vínculos com o banco local…"
	var response: Dictionary = await service.links(str(client.id), branch)
	if not is_inside_tree() or str(host.selected_branch_id) != branch: return
	set_busy(false)
	if not response.ok: notice.text = response.message; return
	customer = str(client.name); linked = response.serials; page = 0
	selected.text = "Cliente selecionado: " + customer
	render()
	notice.text = "Vínculos conferidos pela API • detalhes dos equipamentos: banco local • nenhum cadastro alterado."
	if int(response.get("unresolved", 0)) > 0: notice.text += " %d vínculo(s) sem série verificável; consulta parcial." % int(response.unresolved)

func render() -> void:
	for child in rows_box.get_children(): rows_box.remove_child(child); child.queue_free()
	var query := search.text if mode.selected == 1 else ""
	result_rows = Service.local_results(products, query, status.get_item_text(status.selected), linked)
	var all_found := Service.local_results(products, query, "Todos os status", linked)
	counts[0].text = str(linked.size()) if linked != null else "—"
	counts[1].text = str(all_found.size())
	var local_serials := {}
	for product in all_found: local_serials[Service.serial(product)] = true
	counts[2].text = str(maxi(0, linked.size() - local_serials.size())) if linked != null else "—"
	missing_notice.visible=linked != null and counts[2].text != "0"
	missing_notice.text=counts[2].text + " vínculo(s) sem cadastro local não aparecem na lista. Nenhum cadastro será criado."
	page = clampi(page, 0, maxi(0, (result_rows.size() - 1) / 20))
	for product in result_rows.slice(page * 20, page * 20 + 20):
		var row := HBoxContainer.new(); row.custom_minimum_size.y = 48; rows_box.add_child(row)
		var values := [customer if customer != "" else str(product.get("client", "")), str(product.get("plate", "")), Service.serial(product), str(product.get("operator", "")), str(product.get("chip_phone", "")), str(product.get("tracker_status", ""))]
		for i in range(6):
			var cell := label(values[i] if values[i] != "" else "Não informado", 14, "#168267" if i == 5 else "#173b5d")
			cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL; cell.size_flags_stretch_ratio = [2.0, 1.0, 1.15, 1.3, 1.5, 1.1][i]
			cell.clip_text = true; cell.tooltip_text = values[i]
			if i in [3,5]:
				var badge := PanelContainer.new(); badge.size_flags_horizontal=Control.SIZE_EXPAND_FILL; badge.size_flags_stretch_ratio=cell.size_flags_stretch_ratio; badge.size_flags_vertical=Control.SIZE_SHRINK_CENTER
				var bg := Color("#f0eafd") if i==3 else (Color("#fff1df") if values[i].to_lower().contains("manuten") else Color("#e5f6ed"))
				var style:StyleBox=host._style_box(bg,Color.TRANSPARENT,0,7); style.content_margin_left=8; style.content_margin_right=8; style.content_margin_top=5;style.content_margin_bottom=5
				badge.add_theme_stylebox_override("panel",style); row.add_child(badge);badge.add_child(cell)
			else: row.add_child(cell)
		var actions := HBoxContainer.new(); actions.size_flags_horizontal = Control.SIZE_EXPAND_FILL; actions.size_flags_stretch_ratio = 1.4; actions.size_flags_vertical=Control.SIZE_SHRINK_CENTER; row.add_child(actions)
		var sms := button("SMS", host._show_arya_sms_dialog.bind(product)); sms.custom_minimum_size.x = 72; sms.icon=load("res://assets/icons/approved/mail.svg");sms.expand_icon=true;sms.add_theme_constant_override("icon_max_width",18); actions.add_child(sms)
		var edit := button("Editar", host._show_form.bind(str(product.get("sku", "")))); edit.custom_minimum_size.x = 65; actions.add_child(edit)
		var divider := HSeparator.new(); divider.add_theme_stylebox_override("separator",host._style_box(Color("#e5edf5"),Color.TRANSPARENT,0,0)); divider.custom_minimum_size.y=1; rows_box.add_child(divider)
	if result_rows.is_empty(): rows_box.add_child(label("Nenhum equipamento local corresponde a esta consulta.", 15, "#65819e"))
	pagination.text = "%d resultado(s) • página %d de %d" % [result_rows.size(), page + 1, maxi(1, ceili(result_rows.size() / 20.0))]
	previous.disabled = page == 0; next.disabled = (page + 1) * 20 >= result_rows.size()
	for control in [previous,next]:
		control.add_theme_stylebox_override("disabled",host._style_box(Color("#f0f5fa"),Color("#dce6ef"),1,8))
		control.add_theme_color_override("font_disabled_color",Color("#879bb0"))
