extends VBoxContainer
## Separate warehouse; no calls to the operational inventory or tracking APIs.
var host: Node
var service: Node
var kind := "equipment"
var page_index := 0
var total := 0
var loading := false
var syncing := false
var sending := false
var selected := {}
var search: LineEdit
var table: Tree
var status: Label
var connection_status: Label
var pages: Label
var devices: Button
var chips: Button
var movements: Button
var filter: OptionButton
var select_all: CheckBox
var selected_label: Label
var selection_summary: Label
var base_mode: Button
var custom_mode: Button
var base: OptionButton
var custom: LineEdit
var note: LineEdit
var review_button: Button
var equipment_count: Label
var chip_count: Label
var sent_count: Label
var retry: Timer
var failures := 0
var destination_mode := "base"
const BASE_IDS := ["imperatriz","araguaina","acailandia","maraba"]

func label(value: String, size: int = 16) -> Label:
	var item := Label.new();item.text=value
	item.add_theme_font_size_override("font_size",size)
	item.add_theme_color_override("font_color",Color("#173a59"))
	return item

func action(value: String, callback: Callable, primary: bool=false) -> Button:
	var button: Button=host._make_action_button(value,Color("#137ad2") if primary else Color.WHITE,Color("#cbdff0"),Color.WHITE if primary else Color("#173a59"),Vector2(100,40),callback)
	button.size_flags_vertical=Control.SIZE_SHRINK_CENTER
	button.add_theme_stylebox_override("disabled",host._style_box(Color("#e4f1ff"),Color("#cbdff0"),1,10))
	button.add_theme_color_override("font_disabled_color",Color("#57758d"))
	for state in ["normal","hover","pressed","disabled","focus"]:
		var box:=button.get_theme_stylebox(state).duplicate()
		box.content_margin_left=12;box.content_margin_right=12;button.add_theme_stylebox_override(state,box)
	return button

func style_input(input: Control) -> void:
	for state in ["normal","read_only"]:
		input.add_theme_stylebox_override(state,host._style_box(Color.WHITE,Color("#cbdff0"),1,10))
	for state in ["normal","read_only"]:
		var box:=input.get_theme_stylebox(state).duplicate();box.content_margin_left=12;box.content_margin_right=12;input.add_theme_stylebox_override(state,box)
	input.add_theme_stylebox_override("focus",host._style_box(Color.TRANSPARENT,Color("#137ad2"),2,10))
	input.add_theme_color_override("font_color",Color("#173a59"))
	input.add_theme_color_override("font_placeholder_color",Color("#6c8297"))
	input.add_theme_color_override("caret_color",Color("#137ad2"))
	input.custom_minimum_size.y=40

func panel(parent: Node, padding: int=18) -> VBoxContainer:
	var outer:=PanelContainer.new();outer.size_flags_horizontal=Control.SIZE_EXPAND_FILL;parent.add_child(outer)
	outer.add_theme_stylebox_override("panel",host._style_box(Color.WHITE,Color("#d3e2ef"),1,16))
	var margin:=MarginContainer.new();outer.add_child(margin)
	for edge in ["left","right","top","bottom"]:margin.add_theme_constant_override("margin_"+edge,padding)
	var box:=VBoxContainer.new();box.add_theme_constant_override("separation",12);margin.add_child(box)
	return box

func metric(parent: Node, title: String, hint: String) -> Label:
	var box:=panel(parent,14);box.add_child(label(title,14))
	var count:=label("—",27);box.add_child(count)
	box.add_child(label(hint,12));return count

func setup(owner_node: Node, bridge: Node) -> void:
	host=owner_node;service=bridge;name="ScannerInventory"
	theme=Theme.new();theme.default_font=preload("res://assets/fonts/Noto_Sans/static/NotoSans-Regular.ttf");theme.default_font_size=15
	add_theme_constant_override("separation",14)
	var header:=HBoxContainer.new();add_child(header)
	var titles:=VBoxContainer.new();titles.size_flags_horizontal=Control.SIZE_EXPAND_FILL;header.add_child(titles)
	titles.add_child(label("Armazém",30));titles.add_child(label("Aparelhos e chips • recebimento e distribuição",14))
	connection_status=label("● Verificando Scanner…",15);header.add_child(connection_status)
	header.add_child(action("Conexão",pair_dialog))
	var strip:=HBoxContainer.new();add_child(strip)
	status=label("Reconexão automática ao abrir o Armazém",13);status.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	status.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;strip.add_child(status)
	strip.add_child(action("Atualizar agora",receive))
	var metrics:=HBoxContainer.new();metrics.add_theme_constant_override("separation",16);add_child(metrics)
	equipment_count=metric(metrics,"Aparelhos disponíveis","Prontos para distribuição")
	chip_count=metric(metrics,"Chips disponíveis","Recebidos pelo Scanner")
	sent_count=metric(metrics,"Enviados hoje","Destinações registradas no Armazém")
	var body:=HBoxContainer.new();body.add_theme_constant_override("separation",18);body.size_flags_vertical=Control.SIZE_EXPAND_FILL;add_child(body)
	var left:=panel(body);left.get_parent().get_parent().set_meta("static_card",true);left.get_parent().get_parent().size_flags_stretch_ratio=2.3
	var tabs:=HBoxContainer.new();tabs.add_theme_constant_override("separation",8);left.add_child(tabs)
	devices=action("Aparelhos",select_kind.bind("equipment"));chips=action("Chips",select_kind.bind("chip"));movements=action("Movimentações",select_kind.bind("movements"))
	for button in [devices,chips,movements]:tabs.add_child(button)
	var filters:=HBoxContainer.new();filters.add_theme_constant_override("separation",8);left.add_child(filters)
	search=LineEdit.new();search.placeholder_text="Buscar pelo número de série ou chip";search.size_flags_horizontal=Control.SIZE_EXPAND_FILL;style_input(search);filters.add_child(search)
	search.text_submitted.connect(func(_value):search_rows())
	filter=OptionButton.new();for text in ["Disponíveis","Enviados","Todos"]:filter.add_item(text)
	style_input(filter);filters.add_child(filter);filter.item_selected.connect(func(_index):search_rows())
	filters.add_child(action("Buscar",search_rows))
	select_all=CheckBox.new();select_all.text="Selecionar esta página";select_all.add_theme_color_override("font_color",Color("#173a59"));left.add_child(select_all)
	for state in ["font_color","font_hover_color","font_pressed_color","font_hover_pressed_color","font_focus_color"]:select_all.add_theme_color_override(state,Color("#173a59"))
	select_all.toggled.connect(check_page)
	table=Tree.new();table.name="ScannerReadings";table.columns=4;table.hide_root=true;table.column_titles_visible=true
	table.size_flags_vertical=Control.SIZE_EXPAND_FILL;table.custom_minimum_size.y=200
	table.add_theme_stylebox_override("panel",host._style_box(Color.WHITE,Color("#d3e2ef"),1,10))
	table.add_theme_color_override("font_hovered_color",Color("#173a59"));table.add_theme_color_override("font_color",Color("#173a59"));table.add_theme_color_override("font_selected_color",Color("#173a59"))
	for state in ["selected","selected_focus"]:table.add_theme_stylebox_override(state,host._style_box(Color("#e4f1ff"),Color.TRANSPARENT,0,4))
	for state in ["title_button_normal","title_button_hover","title_button_pressed"]:table.add_theme_stylebox_override(state,host._style_box(Color("#eef4fa"),Color.TRANSPARENT,0,4))
	table.add_theme_color_override("title_button_color",Color("#536f8c"));table.add_theme_constant_override("v_separation",5)
	table.set_column_expand(0,false);table.set_column_custom_minimum_width(0,38)
	table.set_column_expand_ratio(1,2)
	for i in range(4):table.set_column_title_alignment(i,HORIZONTAL_ALIGNMENT_LEFT)
	table.item_edited.connect(check_item);left.add_child(table)
	var footer:=HBoxContainer.new();left.add_child(footer)
	pages=label("",12);pages.size_flags_horizontal=Control.SIZE_EXPAND_FILL;footer.add_child(pages)
	footer.add_child(action("Anterior",move_page.bind(-1)));footer.add_child(action("Próxima",move_page.bind(1)))
	var selected_row:=HBoxContainer.new();left.add_child(selected_row)
	selected_label=label("Nenhum item selecionado",13);selected_label.size_flags_horizontal=Control.SIZE_EXPAND_FILL;selected_row.add_child(selected_label)
	selected_row.add_child(action("Limpar seleção",clear_selection))
	var right:=panel(body);right.get_parent().get_parent().set_meta("static_card",true);right.get_parent().get_parent().custom_minimum_size.x=350
	right.add_child(label("Enviar selecionados",22));right.add_child(label("Defina o destino dos itens marcados",13))
	var modes:=HBoxContainer.new();right.add_child(modes)
	base_mode=action("Selecionar base",set_mode.bind("base"));custom_mode=action("Escrever destino",set_mode.bind("custom"))
	modes.add_child(base_mode);modes.add_child(custom_mode)
	right.add_child(label("Destino",14));base=OptionButton.new()
	for title in ["Imperatriz","Araguaína","Açailândia","Marabá"]:base.add_item(title)
	style_input(base);right.add_child(base);base.item_selected.connect(func(_index):update_selection())
	custom=LineEdit.new();custom.placeholder_text="Ex.: laboratório ou fornecedor";custom.max_length=120;style_input(custom);right.add_child(custom)
	custom.text_changed.connect(func(_value):update_selection())
	right.add_child(label("Observação (opcional)",14));note=LineEdit.new();note.placeholder_text="Informações sobre o envio";note.max_length=500;style_input(note);right.add_child(note)
	var spacer:=Control.new();spacer.size_flags_vertical=Control.SIZE_EXPAND_FILL;right.add_child(spacer)
	selection_summary=label("",15);selection_summary.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;right.add_child(selection_summary)
	review_button=action("Revisar envio",review_dispatch,true)
	review_button.add_theme_stylebox_override("normal",host._style_box(Color("#ff9019"),Color("#ff9019"),1,10))
	review_button.add_theme_color_override("font_color",Color("#173a59"));right.add_child(review_button)
	var hint:=label("O envio registra a saída no Armazém e mantém o histórico.",12);hint.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;right.add_child(hint)
	set_mode("base")
	retry=Timer.new();retry.one_shot=true;retry.timeout.connect(receive);add_child(retry)
	call_deferred("open_warehouse")

func open_warehouse() -> void:
	await refresh()
	await receive()

func select_kind(value: String) -> void:
	if loading or sending:return
	kind=value;page_index=0;refresh()

func search_rows(clear: bool=false) -> void:
	if loading or sending:return
	if clear:search.clear()
	page_index=0;refresh()

func move_page(direction: int) -> void:
	if loading or sending:return
	var next_page:=page_index+direction
	if next_page<0 or next_page*12>=total:return
	page_index=next_page;refresh()

func date_text(value: int) -> String:
	return Time.get_datetime_string_from_unix_time(value-10800).replace("T"," ")

func refresh() -> void:
	if loading:return
	loading=true
	var result: Dictionary=await service.call_service("list",{"kind":kind,"query":search.text,"page":page_index,"state":["available","sent","all"][filter.selected]})
	if not is_inside_tree():return
	loading=false
	if not result.get("ok",false):status.text=str(result.get("error","Falha ao carregar"));return
	table.clear();var root_item:=table.create_item()
	for i in range(4):table.set_column_title(i,["","Número" if kind!="movements" else "Número / tipo","Recebido em" if kind!="movements" else "Enviado em","Situação" if kind!="movements" else "Destino"][i])
	for row in result.get("rows",[]):
		var item:=table.create_item(root_item);item.set_metadata(0,row)
		var key:=str(row.kind)+":"+str(row.number)
		item.set_cell_mode(0,TreeItem.CELL_MODE_CHECK);item.set_editable(0,row.state=="available" and not sending)
		item.set_checked(0,selected.has(key));item.set_selectable(0,false)
		item.set_text(1,str(row.number)+( (" • Chip" if row.kind=="chip" else " • Aparelho") if kind=="movements" else ""))
		item.set_text(2,date_text(int(row.sent_at) if kind=="movements" else int(row.received_at)))
		item.set_text(3,str(row.destination) if kind=="movements" else ("Disponível" if row.state=="available" else "Enviado"))
		item.set_custom_color(3,Color("#168354") if row.state=="available" else Color("#236fa8"))
		item.set_tooltip_text(3,"Destino: %s\n%s" % [row.get("destination",""),row.get("note","")] if row.state=="sent" else "Disponível para envio")
	total=int(result.get("total",0));page_index=int(result.get("page",0))
	equipment_count.text=str(result.get("counts",{}).get("equipment",0));chip_count.text=str(result.get("counts",{}).get("chip",0));sent_count.text=str(result.get("counts",{}).get("sent_today",0))
	devices.disabled=kind=="equipment";chips.disabled=kind=="chip";movements.disabled=kind=="movements"
	filter.disabled=kind=="movements";select_all.disabled=kind=="movements" or sending
	pages.text="%d registros • página %d de %d" % [total,page_index+1,maxi(1,ceili(total/12.0))]
	update_selection()

func receive() -> void:
	if syncing:return
	if sending:
		retry.start(5);return
	syncing=true;retry.stop()
	var cfg: Dictionary=await service.call_service("config")
	if not is_inside_tree():return
	if not cfg.get("ok",false) or cfg.get("config",{}).is_empty():
		connection_status.text="● Scanner não pareado";syncing=false
		status.text="Abra Conexão para parear o celular. O recebimento será automático.";retry.start(10);return
	connection_status.text="● Conectando ao Scanner…"
	var result: Dictionary=await service.call_service("sync")
	if not is_inside_tree():return
	syncing=false
	if result.get("ok",false):
		failures=0;connection_status.text="● Scanner conectado"
		connection_status.add_theme_color_override("font_color",Color("#168354"))
		status.text="Recebimento automático ativo • última sincronização %s • %d novos itens" % [date_text(int(Time.get_unix_time_from_system())).right(8),result.get("added",0)]
		if result.get("ack_pending",0)>0:status.text+=" • confirmação ao celular pendente; nova tentativa automática"
		await refresh()
		retry.start(2 if result.get("received",0)==40 else 5)
	else:
		failures+=1;connection_status.text="● Aguardando reconexão"
		connection_status.add_theme_color_override("font_color",Color("#b36b12"))
		status.text=str(result.get("error","Scanner indisponível"))+" Nova tentativa automática."
		retry.start(mini(30,5*failures))

func check_item() -> void:
	var item:=table.get_edited()
	if item==null or sending:return
	var row: Dictionary=item.get_metadata(0);var key:=str(row.kind)+":"+str(row.number)
	if item.is_checked(0) and row.state=="available":selected[key]={"kind":row.kind,"number":row.number}
	else:selected.erase(key)
	update_selection()

func check_page(checked: bool) -> void:
	if table.get_root()==null or sending:return
	for item in table.get_root().get_children():
		var row: Dictionary=item.get_metadata(0)
		if row.state!="available":continue
		var key:=str(row.kind)+":"+str(row.number);item.set_checked(0,checked)
		if checked:selected[key]={"kind":row.kind,"number":row.number}
		else:selected.erase(key)
	update_selection()

func clear_selection() -> void:
	if sending:return
	selected.clear()
	if table.get_root()!=null:
		for item in table.get_root().get_children():item.set_checked(0,false)
	update_selection()

func set_mode(value: String) -> void:
	destination_mode=value;base.visible=value=="base";custom.visible=value=="custom"
	base_mode.disabled=value=="base";custom_mode.disabled=value=="custom";update_selection()

func destination_text() -> String:
	return base.get_item_text(base.selected) if destination_mode=="base" else custom.text.strip_edges()

func update_selection() -> void:
	selected_label.text="%d item(ns) selecionado(s) • seleção entre páginas e tipos" % selected.size()
	selection_summary.text="%d item(ns)\nDestino: %s" % [selected.size(),destination_text() if not destination_text().is_empty() else "Informe o destino"]
	review_button.disabled=selected.is_empty() or selected.size()>250 or destination_text().is_empty() or sending
	var all_checked:=false
	if table.get_root()!=null:
		var eligible:=0;var checked:=0
		for item in table.get_root().get_children():
			for column in range(4):item.set_custom_bg_color(column,Color("#edf6ff") if item.is_checked(0) else Color.WHITE)
			if item.get_metadata(0).state=="available":
				eligible+=1
				if item.is_checked(0):checked+=1
		all_checked=eligible>0 and eligible==checked
	select_all.set_pressed_no_signal(all_checked)

func review_dispatch() -> void:
	if selected.is_empty() or sending:return
	var raw:=Crypto.new().generate_random_bytes(16);raw[6]=(raw[6]&15)|64;raw[8]=(raw[8]&63)|128
	var hex:=raw.hex_encode();var id:="%s-%s-%s-%s-%s" % [hex.substr(0,8),hex.substr(8,4),hex.substr(12,4),hex.substr(16,4),hex.substr(20)]
	var payload:={"id":id,"mode":destination_mode,"destination":BASE_IDS[base.selected] if destination_mode=="base" else custom.text.strip_edges(),"note":note.text.strip_edges(),"items":selected.values().duplicate(true)}
	var dialog:=ConfirmationDialog.new();dialog.title="Revisar envio • Armazém";dialog.theme=theme
	dialog.add_theme_stylebox_override("panel",host._style_box(Color.WHITE,Color("#cbdff0"),1,16))
	dialog.get_label().add_theme_color_override("font_color",Color("#173a59"))
	dialog.dialog_text="Registrar a saída de %d item(ns) para %s?\n\nOs números selecionados ficarão em Movimentações.\nEste registro não altera vínculos na plataforma." % [selected.size(),destination_text()]
	dialog.ok_button_text="Confirmar envio";dialog.cancel_button_text="Voltar";add_child(dialog)
	dialog.confirmed.connect(func():submit_dispatch(payload);dialog.queue_free())
	dialog.canceled.connect(dialog.queue_free);dialog.popup_centered(Vector2i(610,220))

func submit_dispatch(payload: Dictionary) -> void:
	if sending:return
	sending=true;update_selection();status.text="Registrando envio…"
	var result: Dictionary=await service.call_service("dispatch",payload)
	if not is_inside_tree():return
	sending=false
	if result.get("ok",false):
		clear_selection();note.clear();status.text="Envio registrado • %d item(ns). Histórico em Movimentações." % result.get("sent",0)
	else:status.text=str(result.get("error","Não foi possível confirmar o envio. Consulte Movimentações antes de repetir."))
	await refresh()
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
		feedback.text = "Pareado. O Armazém receberá as leituras automaticamente." if result.get("ok",false) else str(result.get("error","Falha"))
	)
	box.add_child(action("Atualizar somente endereço",func():
		var result: Dictionary = await service.call_service("address",{"url":url.text.strip_edges()})
		if is_instance_valid(feedback):feedback.text="Endereço confirmado." if result.get("ok",false) else str(result.get("error","Falha"))
	))
	host.add_child(dialog);dialog.popup_centered();dialog.confirmed.connect(dialog.queue_free);dialog.close_requested.connect(dialog.queue_free)
