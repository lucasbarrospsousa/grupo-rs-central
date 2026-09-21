extends VBoxContainer
var host: Node
var service: Node
var kind := "equipment"
var page_index := 0
var total := 0
var loading := false
var search: LineEdit
var table: Tree
var status: Label
var pages: Label
var devices: Button
var chips: Button

func label(value: String, size: int = 16) -> Label:
	var item := Label.new();item.text = value
	item.add_theme_font_size_override("font_size", size)
	item.add_theme_color_override("font_color", Color("#173a59"))
	return item

func action(value: String, callback: Callable, primary: bool = false) -> Button:
	var button: Button = host._make_action_button(value, Color("#137ad2") if primary else Color.WHITE,
		Color("#cbdff0"), Color.WHITE if primary else Color("#173a59"), Vector2(170,44), callback)
	button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	button.add_theme_stylebox_override("disabled",host._style_box(Color("#e4f1ff"),Color("#7fb8ed"),1,10))
	button.add_theme_color_override("font_disabled_color",Color("#1265ab"))
	return button

func style_input(input: LineEdit) -> void:
	for state in ["normal","read_only"]:
		input.add_theme_stylebox_override(state,host._style_box(Color.WHITE,Color("#cbdff0"),1,10))
	input.add_theme_stylebox_override("focus",host._style_box(Color.TRANSPARENT,Color("#137ad2"),2,10))
	input.add_theme_color_override("font_color",Color("#173a59"))
	input.add_theme_color_override("font_placeholder_color",Color("#6c8297"))
	input.add_theme_color_override("caret_color",Color("#137ad2"))

func setup(owner_node: Node, bridge: Node) -> void:
	host = owner_node;service = bridge;name = "ScannerInventory"
	theme=Theme.new();theme.default_font=preload("res://assets/fonts/Noto_Sans/static/NotoSans-Regular.ttf");theme.default_font_size=16
	add_theme_constant_override("separation", 18)
	var header := HBoxContainer.new();add_child(header)
	var titles := VBoxContainer.new();titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL;header.add_child(titles)
	titles.add_child(label("RS SCANNER • IMPERATRIZ",12))
	titles.add_child(label("Estoque do Scanner",30))
	titles.add_child(label("Leituras de etiquetas • listas independentes do estoque operacional",14))
	header.add_child(action("Conectar Scanner", pair_dialog))
	header.add_child(action("Receber leituras", receive, true))
	var tabs := HBoxContainer.new();tabs.add_theme_constant_override("separation",12);add_child(tabs)
	devices = action("Estoque - aparelho",select_kind.bind("equipment"))
	chips = action("Estoque - chip",select_kind.bind("chip"))
	tabs.add_child(devices);tabs.add_child(chips)
	search = LineEdit.new();search.placeholder_text = "Buscar pelo número da série ou do chip";search.custom_minimum_size.y = 44;style_input(search);add_child(search)
	search.text_submitted.connect(func(_value):search_rows())
	var search_actions := HBoxContainer.new();add_child(search_actions)
	search_actions.add_child(action("Buscar",search_rows))
	search_actions.add_child(action("Limpar",search_rows.bind(true)))
	status = label("Carregando registros locais…",14);status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART;add_child(status)
	table = Tree.new();table.name = "ScannerReadings";table.columns = 3;table.hide_root = true;table.column_titles_visible = true
	table.size_flags_vertical = Control.SIZE_EXPAND_FILL;table.custom_minimum_size.y = 230
	table.add_theme_stylebox_override("panel",host._style_box(Color.WHITE,Color("#d3e2ef"),1,14))
	table.add_theme_color_override("font_color",Color("#173a59"));table.add_theme_color_override("font_selected_color",Color("#173a59"))
	table.add_theme_stylebox_override("selected",host._style_box(Color("#e4f1ff"),Color.TRANSPARENT,0,4))
	table.add_theme_stylebox_override("selected_focus",host._style_box(Color("#e4f1ff"),Color.TRANSPARENT,0,4))
	for state in ["title_button_normal","title_button_hover","title_button_pressed"]:
		table.add_theme_stylebox_override(state,host._style_box(Color("#eef4fa"),Color.TRANSPARENT,0,8))
	table.add_theme_color_override("title_button_color",Color("#536f8c"));table.add_theme_constant_override("v_separation",16)
	for i in range(3):table.set_column_title(i,["Número","Recebido no Central","Origem"][i])
	add_child(table)
	var footer := HBoxContainer.new();add_child(footer)
	pages = label("");pages.size_flags_horizontal = Control.SIZE_EXPAND_FILL;footer.add_child(pages)
	footer.add_child(action("Anterior",move_page.bind(-1)))
	footer.add_child(action("Próxima",move_page.bind(1)))
	call_deferred("refresh")

func select_kind(value: String) -> void:
	if loading:return
	kind=value;page_index=0;refresh()

func search_rows(clear: bool=false) -> void:
	if loading:return
	if clear:search.clear()
	page_index=0;refresh()

func move_page(direction: int) -> void:
	if loading:return
	var next_page:=page_index+direction
	if next_page<0 or next_page*25>=total:return
	page_index=next_page;refresh()

func refresh() -> void:
	if loading:return
	loading = true
	var result: Dictionary = await service.call_service("list",{"kind":kind,"query":search.text,"page":page_index})
	if not is_instance_valid(table):return
	loading = false
	if not result.get("ok",false):status.text = str(result.get("error","Falha ao carregar"));return
	table.clear();var root_item := table.create_item()
	for row in result.get("rows",[]):
		var item := table.create_item(root_item)
		item.set_text(0,str(row.number))
		var local_time := int(row.received_at) + int(Time.get_time_zone_from_system().bias)*60
		item.set_text(1,Time.get_datetime_string_from_unix_time(local_time).replace("T"," "))
		item.set_text(2,"RS Scanner • Imperatriz")
	total = int(result.get("total",0))
	devices.text = "Estoque - aparelho (%d)" % result.get("counts",{}).get("equipment",0)
	chips.text = "Estoque - chip (%d)" % result.get("counts",{}).get("chip",0)
	devices.disabled = kind == "equipment";chips.disabled = kind == "chip"
	pages.text = "%d registros • página %d • até 25 por página" % [total,page_index+1]
	if status.text == "Carregando registros locais…":status.text = "Nenhuma leitura recebida." if total==0 else "Registros salvos localmente."

func receive() -> void:
	if loading:return
	loading = true;status.text = "Recebendo leituras do celular…"
	var result: Dictionary = await service.call_service("sync")
	if not is_instance_valid(status):return
	loading = false
	if result.get("ok",false):
		status.text = "%d novos itens salvos • %d leituras conferidas." % [result.get("added",0),result.get("received",0)]
		if result.get("ack_pending",0)>0:status.text += " Salvos no Central; confirmação ao celular pendente. Clique em Receber novamente."
		elif result.get("received",0)==40:status.text += " Clique em Receber novamente para buscar o próximo lote."
		page_index=0;await refresh()
	else:status.text = str(result.get("error","Falha no recebimento"))

func pair_dialog() -> void:
	var dialog := AcceptDialog.new();dialog.title = "Conectar RS Scanner • Imperatriz";dialog.min_size = Vector2i(660,360)
	dialog.theme=theme;dialog.add_theme_stylebox_override("panel",host._style_box(Color.WHITE,Color("#cbdff0"),1,16))
	var box := VBoxContainer.new();box.add_theme_constant_override("separation",12);dialog.add_child(box)
	box.add_child(label("No celular: modo 2 → Conectar ao Grupo RS Central",15))
	var url := LineEdit.new();url.placeholder_text = "https://IP-DO-CELULAR:8843";box.add_child(url)
	var pin := LineEdit.new();pin.placeholder_text = "SHA256 exibido pelo Scanner";box.add_child(pin)
	var code := LineEdit.new();code.placeholder_text = "Código temporário de pareamento";code.secret = true;box.add_child(code)
	for input in [url,pin,code]:style_input(input);input.custom_minimum_size.y=42
	var feedback := label("Confira o certificado no celular antes de parear.",14);feedback.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART;box.add_child(feedback)
	var pair := action("Conferi o certificado • Parear",func():pass,true);box.add_child(pair)
	pair.pressed.connect(func():
		pair.disabled=true
		var result: Dictionary = await service.call_service("pair",{"url":url.text.strip_edges(),"fingerprint":pin.text.strip_edges().to_lower(),"code":code.text.strip_edges()})
		if not is_instance_valid(feedback):return
		code.clear();pair.disabled=false
		feedback.text = "Pareado. Volte à lista e clique em Receber leituras." if result.get("ok",false) else str(result.get("error","Falha"))
	)
	box.add_child(action("Atualizar somente endereço",func():
		var result: Dictionary = await service.call_service("address",{"url":url.text.strip_edges()})
		if is_instance_valid(feedback):feedback.text="Endereço confirmado." if result.get("ok",false) else str(result.get("error","Falha"))
	))
	host.add_child(dialog);dialog.popup_centered();dialog.confirmed.connect(dialog.queue_free);dialog.close_requested.connect(dialog.queue_free)
