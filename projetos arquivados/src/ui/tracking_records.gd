extends "res://src/ui/equipment_consultation.gd"
## Independent read-only screen. Shared visual primitives, not consultation setup.
const Records = preload("res://src/services/tracking_records.gd")
const MapPreview = preload("res://src/ui/records_map.gd")
var start_input: LineEdit
var end_input: LineEdit
var export_button: Button
var clear_button: Button
var content_rows: VBoxContainer
var table_title: Label
var detail_text: Label
var map: Control
var map_button: Button
var open_button: Button
var result: Dictionary = {}
var context: Dictionary = {}
var window: Dictionary = {}
var focused: Dictionary = {}
var detail_index := -1
var operation := 0
var navigate: Callable = OS.shell_open
var expected_client_id := ""

func card() -> PanelContainer:
	var panel:=super.card()
	panel.set_meta("static_card",true)
	return panel

func button(value: String, callback: Callable, primary: bool = false) -> Button:
	var node:=Button.new();node.text=value;node.custom_minimum_size=Vector2(90,36)
	node.add_theme_font_size_override("font_size",14)
	for state in ["normal","hover","pressed","disabled","focus"]:
		var fill:=Color("#1378d4") if primary else Color.WHITE
		if state=="hover":fill=Color("#096ac0") if primary else Color("#edf5ff")
		if state=="disabled":fill=Color("#f1f5fa")
		var style:StyleBox=host._style_box(fill,Color("#d1e1f1"),1,9);style.content_margin_left=12;style.content_margin_right=12
		node.add_theme_stylebox_override(state,style)
	for state in ["font_color","font_hover_color","font_pressed_color","font_focus_color"]:node.add_theme_color_override(state,Color.WHITE if primary else Color("#173b5d"))
	node.add_theme_color_override("font_disabled_color",Color("#8b9eb3"));node.pressed.connect(callback)
	return node

func setup(controller: Node) -> void:
	host=controller; branch=str(host.selected_branch_id);name="TrackingRecords"
	theme=Theme.new();theme.default_font=preload("res://assets/fonts/Noto_Sans/static/NotoSans-Regular.ttf");theme.default_font_size=14
	size_flags_vertical=Control.SIZE_EXPAND_FILL;add_theme_constant_override("separation",9)
	service=Records.new();service.decode_body=host._decode_http_body_bytes;add_child(service)
	var vault: Node=host._secret_vault()
	if vault:
		var config:Dictionary=vault.merge_secrets("app",{},host.SecretVaultScript.APP_SECRET_KEYS)
		service.credentials={"username":config.get("grupo_rs_modern_user",""),"password":config.get("grupo_rs_modern_password","")}
	add_child(label("GRUPO RS CENTRAL  /  "+str(host.selected_branch_name).to_upper(),12,"#65819e"))
	var title_row:=HBoxContainer.new();add_child(title_row)
	var title:=label("Registros",32);title.size_flags_horizontal=Control.SIZE_EXPAND_FILL;title_row.add_child(title)
	export_button=button("Exportar PDF",choose_pdf);title_row.add_child(export_button);export_button.disabled=true
	export_button.tooltip_text="Baixa o relatório gerado pela plataforma para o veículo e período consultados. O layout é o da plataforma."
	add_child(label("Consulte o histórico do veículo e confira cada comunicação.",15,"#65819e"))
	var filter_card:=card();add_child(filter_card)
	var filters:=VBoxContainer.new();filters.add_theme_constant_override("separation",10);filter_card.add_child(filters)
	var fields:=HBoxContainer.new();fields.add_theme_constant_override("separation",12);filters.add_child(fields)
	search=field(fields,"Cliente, placa ou aparelho","Nome, placa ou série",2.0)
	start_input=field(fields,"Data inicial","dd/mm/aaaa hh:mm",1.2)
	end_input=field(fields,"Data final","dd/mm/aaaa hh:mm",1.2)
	search_button=button("Buscar registros",run_search,true);search_button.size_flags_vertical=Control.SIZE_SHRINK_END;fields.add_child(search_button)
	search.text_submitted.connect(func(_text):run_search())
	var shortcuts:=HBoxContainer.new();filters.add_child(shortcuts)
	shortcuts.add_child(button("Hoje",func():set_day(0)))
	shortcuts.add_child(button("Ontem",func():set_day(-1)))
	shortcuts.add_child(button("Personalizado",func():start_input.grab_focus()))
	clear_button=button("Limpar",clear_search);shortcuts.add_child(clear_button)
	var hint:=label("Até 7 dias por consulta • fuso da plataforma • somente leitura",12,"#65819e");hint.size_flags_horizontal=Control.SIZE_EXPAND_FILL;hint.horizontal_alignment=HORIZONTAL_ALIGNMENT_RIGHT;shortcuts.add_child(hint)
	picker=VBoxContainer.new();filters.add_child(picker);picker.hide()
	var vehicle_card:=card();add_child(vehicle_card)
	var band:StyleBox=host._style_box(Color("#eaf4ff"),Color("#c7e2fa"),1,14);band.content_margin_left=20;band.content_margin_right=20;band.content_margin_top=12;band.content_margin_bottom=12;vehicle_card.add_theme_stylebox_override("panel",band)
	var vehicle_row:=HBoxContainer.new();vehicle_card.add_child(vehicle_row)
	selected=label("Selecione um veículo para consultar o histórico.",15);selected.size_flags_horizontal=Control.SIZE_EXPAND_FILL;selected.clip_text=true;vehicle_row.add_child(selected)
	vehicle_row.add_child(label("Fonte: plataforma web  •  Sob demanda",12,"#1378d4"))
	var metrics:=HBoxContainer.new();metrics.add_theme_constant_override("separation",12);add_child(metrics)
	for i in range(4):
		var panel:=card();panel.size_flags_horizontal=Control.SIZE_EXPAND_FILL;metrics.add_child(panel);Motion.attach(panel)
		var line:=HBoxContainer.new();line.add_theme_constant_override("separation",16);panel.add_child(line)
		var icon:=TextureRect.new();icon.texture=load("res://assets/icons/records/"+["history","route","speed","memory"][i]+".svg");icon.custom_minimum_size=Vector2(40,40);icon.expand_mode=TextureRect.EXPAND_IGNORE_SIZE;icon.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED;line.add_child(icon)
		var stack:=VBoxContainer.new();line.add_child(stack);stack.add_child(label(["Registros encontrados","Distância no período","Velocidade máxima","Posições de memória"][i],13))
		var count:=label("—",26);stack.add_child(count);counts.append(count)
	var body:=HBoxContainer.new();body.size_flags_vertical=Control.SIZE_EXPAND_FILL;body.add_theme_constant_override("separation",14);add_child(body)
	var table_card:=card();table_card.size_flags_horizontal=Control.SIZE_EXPAND_FILL;table_card.size_flags_stretch_ratio=2.6;body.add_child(table_card)
	var table:=VBoxContainer.new();table.add_theme_constant_override("separation",8);table_card.add_child(table)
	table.add_child(label("Histórico de posições",20))
	table_title=label("Mais recentes primeiro • Data GPS",12,"#65819e");table.add_child(table_title)
	var header:=HBoxContainer.new();header.custom_minimum_size.y=30;table.add_child(header)
	for value in ["Data GPS","Data servidor","Vel.","Ignição","Bateria","Bat. interna","Ação"]:
		var cell:=label(value,12,"#65819e");cell.size_flags_horizontal=Control.SIZE_EXPAND_FILL;cell.size_flags_stretch_ratio=1.5 if value.begins_with("Data") else 1.0;header.add_child(cell)
	var scroll:=ScrollContainer.new();scroll.size_flags_vertical=Control.SIZE_EXPAND_FILL;scroll.custom_minimum_size.y=125;table.add_child(scroll)
	content_rows=VBoxContainer.new();content_rows.size_flags_horizontal=Control.SIZE_EXPAND_FILL;content_rows.add_theme_constant_override("separation",5);scroll.add_child(content_rows)
	var bottom:=HBoxContainer.new();table.add_child(bottom)
	pagination=label("Nenhuma consulta realizada",12,"#65819e");pagination.size_flags_horizontal=Control.SIZE_EXPAND_FILL;bottom.add_child(pagination)
	previous=button("Anterior",func():if not busy:page-=1;render_history());bottom.add_child(previous)
	next=button("Próxima",func():if not busy:page+=1;render_history());bottom.add_child(next)
	var details_card:=card();details_card.size_flags_horizontal=Control.SIZE_EXPAND_FILL;details_card.size_flags_stretch_ratio=1;body.add_child(details_card)
	var details:=VBoxContainer.new();details.add_theme_constant_override("separation",7);details_card.add_child(details)
	details.add_child(label("Detalhes do registro",19))
	map=MapPreview.new();details.add_child(map)
	details.add_child(label("© OpenStreetMap contributors",10,"#65819e"))
	map_button=button("Carregar mapa",func():map.load_position());details.add_child(map_button)
	detail_text=label("Selecione uma linha do histórico.",13);detail_text.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;details.add_child(detail_text)
	open_button=button("Ver posição",open_position);details.add_child(open_button)
	notice=label("Posição de memória: recebida depois do horário GPS. Não comprova defeito no equipamento.",12,"#65819e");notice.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;add_child(notice)
	set_day(0);render_history();show_record(-1);call_deferred("style_fields")

func field(parent: Node, title: String, placeholder: String, ratio: float) -> LineEdit:
	var box:=VBoxContainer.new();box.size_flags_horizontal=Control.SIZE_EXPAND_FILL;box.size_flags_stretch_ratio=ratio;parent.add_child(box);box.add_child(label(title,13))
	var input:=LineEdit.new();input.placeholder_text=placeholder;input.custom_minimum_size.y=42;box.add_child(input);return input

func style_fields() -> void:
	for input in [search,start_input,end_input]:
		for state in ["normal","focus","read_only"]:
			var style:StyleBox=host._style_box(Color.WHITE,Color("#cbdfee"),1,9);style.content_margin_left=12;style.content_margin_right=12;input.add_theme_stylebox_override(state,style)
		input.add_theme_color_override("font_color",Color("#173b5d"));input.add_theme_color_override("font_placeholder_color",Color("#7a8fa7"))
	if OS.get_environment("GRUPO_RS_REDUCED_MOTION")!="1":
		modulate.a=0;create_tween().tween_property(self,"modulate:a",1.0,.25)

func set_day(offset: int) -> void:
	if busy:return
	var today:=Time.get_datetime_dict_from_system()
	var stamp:=Time.get_unix_time_from_datetime_dict({"year":today.year,"month":today.month,"day":today.day,"hour":0,"minute":0,"second":0})+offset*86400
	var day:=Time.get_datetime_dict_from_unix_time(stamp)
	var text:="%02d/%02d/%04d" % [day.day,day.month,day.year]
	start_input.text=text+" 00:00";end_input.text=text+" 23:59"

func set_busy(value: bool) -> void:
	busy=value;search_button.disabled=value;clear_button.disabled=value
	for input in [search,start_input,end_input]:input.editable=not value
	export_button.disabled=value or result.is_empty() or not result.get("ok",false)
	previous.disabled=value or page==0;next.disabled=value or (page+1)*5>=result.get("rows",[]).size()

func clear_search() -> void:
	if busy:return
	operation+=1;result={};context={};window={};expected_client_id="";search.clear();page=0;reset_picker();render_history();show_record(-1)
	selected.text="Selecione um veículo para consultar o histórico.";notice.text="Consulta limpa. Nenhum cadastro alterado.";set_busy(false)

func reset_picker() -> void:
	for child in picker.get_children():picker.remove_child(child);child.queue_free()
	picker.hide()

func valid_operation(ticket: int) -> bool:
	return is_inside_tree() and ticket==operation and str(host.selected_branch_id)==branch

func run_search() -> void:
	if busy:return
	var period_value:=Records.period(start_input.text,end_input.text)
	if not period_value.ok:notice.text=period_value.message;return
	if branch!="imperatriz":notice.text="Registros disponíveis nesta versão apenas para Imperatriz.";return
	var text:=search.text.strip_edges()
	if text.length()<3:notice.text="Digite uma placa, série ou pelo menos 3 letras do nome.";return
	operation+=1;var ticket:=operation
	result={};context={};expected_client_id="";window=period_value;page=0;reset_picker();render_history();show_record(-1)
	selected.text="Conferindo veículo…";set_busy(true);notice.text="Identificando vínculos; nenhum dado será alterado…"
	products=host.store.get_products()
	var local:=Records.local_results(products,text,"Todos os status")
	var clean:=Records.plate_key(text)
	var plate_regex:=RegEx.new();plate_regex.compile("^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$")
	if clean.is_valid_int() or plate_regex.search(clean)!=null:
		local=local.filter(func(p):return Records.serial(p)==text or Records.plate_key(str(p.get("plate","")))==clean)
		set_busy(false)
		if local.size()==1:await select_product(local[0]);return
		show_products(local);return
	var clients_result:Dictionary=await service.clients(text,branch)
	if not valid_operation(ticket):return
	set_busy(false)
	if not clients_result.ok:notice.text=clients_result.message;selected.text="Consulta não concluída";return
	picker.show()
	for client in clients_result.clients:
		picker.add_child(button(str(client.name),func():select_client(client)))
	notice.text="Selecione o associado correto; homônimos não são agrupados." if not clients_result.clients.is_empty() else "Nenhum associado encontrado."
	selected.text="Selecione um associado"

func select_client(client: Dictionary) -> void:
	if busy:return
	set_busy(true);var ticket:=operation
	var related:Dictionary=await service.links(str(client.id),branch)
	if not valid_operation(ticket):return
	set_busy(false);reset_picker()
	if not related.ok:notice.text=related.message;return
	expected_client_id=str(client.id)
	var matches:=Records.local_results(products,"","Todos os status",related.serials)
	show_products(matches)

func show_products(matches: Array) -> void:
	reset_picker();picker.show()
	for product in matches:
		picker.add_child(button("%s • %s" % [product.get("plate","Sem placa"),Records.serial(product)],func():select_product(product)))
	notice.text="Selecione um equipamento do banco local." if not matches.is_empty() else "Nenhum equipamento correspondente no banco local desta base."
	selected.text="Aguardando seleção de veículo"

func select_product(product: Dictionary) -> void:
	if busy:return
	# Period belongs to this search, not to inputs edited after a completed request.
	var range_value:=Records.period(start_input.text,end_input.text)
	if not range_value.ok:notice.text=range_value.message;return
	window=range_value;set_busy(true);reset_picker();var ticket:=operation
	notice.text="Confirmando placa, série e associado na plataforma…"
	var resolved:Dictionary=await service.resolve(product,branch,host._parse_modern_grupo_rs_vehicle_rows)
	if not valid_operation(ticket):return
	if not resolved.ok:set_busy(false);notice.text=resolved.message;selected.text="Vínculo não confirmado";return
	if expected_client_id!="" and str(resolved.client_id)!=expected_client_id:
		set_busy(false);notice.text="O veículo não corresponde mais ao associado selecionado. Faça uma nova busca.";return
	context=resolved;selected.text="%s  •  %s  •  %s" % [context.plate,context.client,context.serial];selected.tooltip_text=selected.text
	notice.text="Buscando histórico na plataforma web…"
	var received:Dictionary=await service.history(context,window,branch)
	if not valid_operation(ticket):return
	result=received;set_busy(false);page=0;render_history()
	if not result.ok:notice.text=result.message;return
	show_record(0 if not result.rows.is_empty() else -1)
	notice.text="Consulta parcial: a plataforma informou mais registros do que retornou. Reduza o período." if result.partial else "Consulta concluída • fonte: plataforma web • nenhum cadastro alterado. Memória não comprova defeito de GPS."

static func value_text(value: Variant, suffix: String = "") -> String:
	var numeric:Variant=Records.number(value)
	return "S/D" if numeric==null else ((str(int(numeric)) if numeric==floor(numeric) else str(numeric)).replace(".",",")+suffix)

static func date_text(stamp: int) -> String:
	if stamp<=0:return "Não informada"
	var d:=Time.get_datetime_dict_from_unix_time(stamp)
	return "%02d/%02d %02d:%02d:%02d" % [d.day,d.month,d.hour,d.minute,d.second]

static func ignition(row: Dictionary) -> String:
	var raw:Variant=Records.number(row.get("ignicao"))
	return "Ligada" if raw==1 else ("Desligada" if raw==0 else "S/D")

func render_history() -> void:
	for child in content_rows.get_children():content_rows.remove_child(child);child.queue_free()
	var rows:Array=result.get("rows",[])
	page=clampi(page,0,maxi(0,ceili(rows.size()/5.0)-1))
	counts[0].text=str(rows.size()) if result.get("ok",false) else "—"
	counts[1].text=value_text(result.get("distance")," km")
	counts[2].text=value_text(result.get("maximum")," km/h")
	counts[3].text=str(result.get("memory_count","—"))
	if not window.is_empty():table_title.text="Data GPS • "+date_text(window.first)+" até "+date_text(window.last)
	for index in range(page*5,mini(rows.size(),page*5+5)):
		var event:Dictionary=rows[index]
		var panel:=PanelContainer.new();content_rows.add_child(panel)
		panel.add_theme_stylebox_override("panel",host._style_box(Color("#fff7e1") if event.is_memory else (Color("#eaf4ff") if index==detail_index else Color.WHITE),Color("#e5edf5"),1,8))
		var row:=HBoxContainer.new();row.custom_minimum_size.y=42;panel.add_child(row)
		var values:=[date_text(event.gps_time)+( " • Memória" if event.is_memory else ""),date_text(event.server_time),value_text(event.get("velocidade")," km/h"),ignition(event),value_text(event.get("bateria")," V"),value_text(event.get("bateria_bkp",event.get("bkp",event.get("bateria_backup"))),"%")]
		for i in range(6):
			var cell:=label(values[i],12,"#168267" if i==3 and values[i]=="Ligada" else ("#c84e58" if i==3 and values[i]=="Desligada" else "#173b5d"))
			cell.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;cell.size_flags_horizontal=Control.SIZE_EXPAND_FILL;cell.size_flags_stretch_ratio=1.5 if i<2 else 1.0;cell.tooltip_text=values[i]
			if i==3:
				var badge:=PanelContainer.new();badge.size_flags_horizontal=Control.SIZE_EXPAND_FILL;badge.size_flags_vertical=Control.SIZE_SHRINK_CENTER
				var shade:=Color("#e3f7ed") if values[i]=="Ligada" else (Color("#ffe9ec") if values[i]=="Desligada" else Color("#f0f3f8"))
				var style:StyleBox=host._style_box(shade,Color.TRANSPARENT,0,10);style.content_margin_top=3;style.content_margin_bottom=3;badge.add_theme_stylebox_override("panel",style);cell.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;badge.add_child(cell);row.add_child(badge)
			else:row.add_child(cell)
		var action:=button("Ver",func():show_record(index));action.custom_minimum_size=Vector2(46,36);action.size_flags_horizontal=Control.SIZE_EXPAND_FILL;row.add_child(action)
	if rows.is_empty():content_rows.add_child(label("Nenhum registro neste período." if result.get("ok",false) else "O histórico aparecerá aqui após a consulta.",14,"#65819e"))
	pagination.text="Exibindo %d–%d de %d%s" % [0 if rows.is_empty() else page*5+1,mini(rows.size(),page*5+5),rows.size()," • parcial" if result.get("partial",false) else ""]
	previous.disabled=busy or page==0;next.disabled=busy or (page+1)*5>=rows.size()

func show_record(index: int) -> void:
	detail_index=index
	var rows:Array=result.get("rows",[])
	focused=rows[index] if index>=0 and index<rows.size() else {}
	var coords:=Records.coordinates(focused);map.reset(coords);map_button.disabled=coords.is_empty();open_button.disabled=coords.is_empty()
	map.tooltip_text="Lat.: %s • Long.: %s" % [coords.lat,coords.lng] if not coords.is_empty() else "Coordenadas não confirmadas"
	if focused.is_empty():detail_text.text="Selecione uma linha do histórico.";return
	var delay:="S/D"
	if focused.gps_time>0 and focused.server_time>0:delay=str(focused.server_time-focused.gps_time)+" segundos"
	detail_text.text="%s\n%s\nHodômetro: %s\nIgnição: %s • Recebido após: %s\nMotorista: %s" % [date_text(focused.gps_time),str(focused.get("endereco","Endereço não informado")),value_text(focused.get("hodometro")," km"),ignition(focused),delay,str(focused.get("motorista","Não informado"))]
	render_history()

func open_position() -> void:
	var coords:=Records.coordinates(focused)
	if not coords.is_empty():navigate.call("https://www.google.com/maps/search/?api=1&query=%s,%s" % [str(coords.lat),str(coords.lng)])

func choose_pdf() -> void:
	if busy or not result.get("ok",false):return
	var dialog:=FileDialog.new();dialog.file_mode=FileDialog.FILE_MODE_SAVE_FILE;dialog.access=FileDialog.ACCESS_FILESYSTEM;dialog.filters=PackedStringArray(["*.pdf ; Relatório PDF"]);dialog.current_file="Registros-"+Records.plate_key(str(context.plate))+".pdf";dialog.use_native_dialog=true;add_child(dialog)
	dialog.file_selected.connect(func(path):dialog.queue_free();save_pdf(path))
	dialog.canceled.connect(dialog.queue_free);dialog.popup_centered(Vector2i(800,500))

func save_pdf(path: String) -> void:
	if busy or not result.get("ok",false):return
	set_busy(true);var ticket:=operation;notice.text="Preparando PDF da plataforma para o veículo e período consultados…"
	var response:Dictionary=await service.pdf(context,window,branch)
	if not valid_operation(ticket):return
	set_busy(false)
	if not response.ok:notice.text=response.message;return
	var file:=FileAccess.open(path,FileAccess.WRITE)
	if file==null:notice.text="Não foi possível salvar o PDF no destino escolhido.";return
	file.store_buffer(response.bytes);file.close();notice.text="PDF salvo em "+path
