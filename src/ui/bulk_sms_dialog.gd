extends AcceptDialog
const UI=preload("res://src/ui/approved_dashboard.gd")
var host:Node
var gateway:Node
var inputs:Array=[]
var feedback:Label
var review:TextEdit
var validate_button:Button
var confirm_button:Button
var prepared:Array=[]
var branch:String
var pasted_rows:Array=[]
var page:=0
var page_label:Label
var paste_button:Button
var previous_button:Button
var next_button:Button
var row_labels:Array=[]
var fields_locked:=false

func setup(owner_node:Node) -> void:
	host=owner_node;gateway=host._ensure_phone_sms_gateway();branch=str(host.selected_branch_id)
	title="SMS em massa • até 10 aparelhos";min_size=Vector2i(1040,710);get_ok_button().hide()
	borderless=true;transparent=true;transparent_bg=true
	theme=Theme.new();theme.default_font=UI.Regular;theme.default_font_size=14
	add_theme_stylebox_override("panel",host._style_box(Color("#f5f8fc"),Color("#d3e2ef"),1,18,true))
	var layout:=Control.new();layout.custom_minimum_size=Vector2(1040,710);add_child(layout)
	var margin:=MarginContainer.new();layout.add_child(margin);margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side in ["left","right","top","bottom"]:margin.add_theme_constant_override("margin_"+side,20)
	var box:=VBoxContainer.new();box.add_theme_constant_override("separation",12);margin.add_child(box)
	var banner:=PanelContainer.new();banner.add_theme_stylebox_override("panel",host._style_box(Color("#155a99"),Color("#155a99"),0,16));box.add_child(banner)
	var head:=HBoxContainer.new();head.add_theme_constant_override("separation",20);banner.add_child(head)
	var titles:=VBoxContainer.new();titles.size_flags_horizontal=Control.SIZE_EXPAND_FILL;head.add_child(titles)
	titles.add_child(UI.text("SMS em massa",26,Color.WHITE))
	titles.add_child(UI.text("Prepare os aparelhos. Confira os grupos. Envie com segurança.",14,Color("#d9ebff")))
	var close:=Button.new();close.text="×";close.flat=true;close.add_theme_font_size_override("font_size",26);close.add_theme_color_override("font_color",Color.WHITE);close.pressed.connect(hide);head.add_child(close)
	var banner_style:StyleBox=banner.get_theme_stylebox("panel").duplicate()
	for side in [SIDE_LEFT,SIDE_RIGHT]:banner_style.set_content_margin(side,22)
	for side in [SIDE_TOP,SIDE_BOTTOM]:banner_style.set_content_margin(side,16)
	banner.add_theme_stylebox_override("panel",banner_style)
	var columns:=HBoxContainer.new();columns.add_theme_constant_override("separation",18);box.add_child(columns)
	var panel:VBoxContainer=UI.panel("01 · Lista de aparelhos")
	var table_panel:Control=panel.get_parent();table_panel.custom_minimum_size.x=600;columns.add_child(table_panel)
	var toolbar:=HBoxContainer.new();toolbar.add_theme_constant_override("separation",8);panel.add_child(toolbar)
	paste_button=host._make_action_button("Colar lista",Color("#edf5ff"),Color("#d3e2ef"),Color("#174c7c"),Vector2(120,36),func():paste_text(DisplayServer.clipboard_get()))
	toolbar.add_child(paste_button)
	page_label=UI.text("Lote 1 · até 10",12);page_label.size_flags_horizontal=Control.SIZE_EXPAND_FILL;toolbar.add_child(page_label)
	previous_button=UI.action(host,"‹",func():change_page(-1));previous_button.custom_minimum_size=Vector2(36,36);toolbar.add_child(previous_button);previous_button.disabled=true
	next_button=UI.action(host,"›",func():change_page(1));next_button.custom_minimum_size=Vector2(36,36);toolbar.add_child(next_button);next_button.disabled=true
	previous_button.icon=null;next_button.icon=null
	var list_scroll:=ScrollContainer.new();list_scroll.custom_minimum_size.y=306;list_scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED;panel.add_child(list_scroll)
	var grid:=GridContainer.new();grid.columns=4;grid.add_theme_constant_override("h_separation",10);grid.add_theme_constant_override("v_separation",8);list_scroll.add_child(grid)
	for label in ["#","Série","Telefone · DDD","Grupo *"]:grid.add_child(UI.text(label,13))
	for i in range(10):
		var row_label:=UI.text("%02d" % (i+1),12,Color("#7890a8"));grid.add_child(row_label);row_labels.append(row_label)
		var serial:=LineEdit.new();serial.placeholder_text="024…";serial.custom_minimum_size.x=155;host._style_line_edit(serial);grid.add_child(serial)
		var phone:=LineEdit.new();phone.placeholder_text="DDD + telefone";phone.custom_minimum_size.x=175;host._style_line_edit(phone);grid.add_child(phone)
		var group:=OptionButton.new();group.custom_minimum_size.x=145;group.add_item("Selecionar",0)
		for number in range(1,5):group.add_item("Grupo %d" % number,number)
		for state in ["normal","hover","pressed","focus"]:group.add_theme_stylebox_override(state,host._style_box(Color.WHITE,Color("#d3e2ef"),1,10))
		group.add_theme_color_override("font_color",Color("#123555"))
		grid.add_child(group);inputs.append([serial,phone,group])
		serial.text_changed.connect(invalidate);phone.text_changed.connect(invalidate);group.item_selected.connect(invalidate)
	var summary:=UI.panel("02 · Revisão do lote");var summary_panel:Control=summary.get_parent();summary_panel.custom_minimum_size.x=350;columns.add_child(summary_panel)
	for text in ["10 aparelhos · limite por lote","60 segundos · após cada confirmação","2 horas · validade da solicitação"]:
		var badge:=PanelContainer.new();badge.add_theme_stylebox_override("panel",host._style_box(Color("#edf5ff"),Color("#edf5ff"),0,10));badge.add_child(UI.text(text,13,Color("#1b5b93")));summary.add_child(badge)
		var badge_style:StyleBox=badge.get_theme_stylebox("panel").duplicate()
		for side in [SIDE_LEFT,SIDE_RIGHT]:badge_style.set_content_margin(side,12)
		for side in [SIDE_TOP,SIDE_BOTTOM]:badge_style.set_content_margin(side,6)
		badge.add_theme_stylebox_override("panel",badge_style)
	summary.add_child(UI.text("PRÉVIA DOS COMANDOS",12,Color("#617d99")))
	review=TextEdit.new();review.editable=false;review.placeholder_text="Dados da lista • sem consulta ao estoque\nConfiguração padrão: APN hinova.br\nPrepare e confira os comandos aqui.";review.custom_minimum_size.y=180;review.add_theme_color_override("font_color",Color("#123555"));review.add_theme_stylebox_override("read_only",host._style_box(Color("#f7faff"),Color("#d3e2ef"),1,12));summary.add_child(review)
	review.add_theme_color_override("font_placeholder_color",Color("#617d99"))
	review.add_theme_color_override("font_readonly_color",Color("#123555"))
	review.custom_minimum_size.y=144
	review.wrap_mode=TextEdit.LINE_WRAPPING_BOUNDARY
	feedback=UI.text("Use série, telefone e grupo da lista. Não exige cadastro no estoque. APN padrão: hinova.br. Revise antes de confirmar.",13);feedback.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;box.add_child(feedback)
	var actions:=HBoxContainer.new();actions.add_theme_constant_override("separation",12);box.add_child(actions)
	validate_button=UI.action(host,"Preparar e revisar",prepare,true);actions.add_child(validate_button)
	confirm_button=host._make_action_button("Confirmar lote",Color("#1678d4"),Color("#1678d4"),Color.WHITE,Vector2(220,48),submit);confirm_button.disabled=true;actions.add_child(confirm_button)
	actions.add_child(UI.action(host,"Painel SMS",func():hide();host._show_sms_panel()))
	actions.add_child(UI.action(host,"Cancelar lote pendente",cancel_batch))
	var warning:=UI.text("Falha ou retorno indeterminado interrompe a sequência. O intervalo reduz rajadas, mas não garante que a operadora não bloqueie o chip.",12);warning.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;box.add_child(warning)
	validate_button.icon=load("res://assets/icons/approved/refresh.svg");confirm_button.icon=load("res://assets/icons/sms_send.svg")
	for action in actions.get_children():action.custom_minimum_size.x=220
	popup_centered(Vector2i(1080,740))
	if OS.get_environment("GRUPO_RS_REDUCED_MOTION")!="1":
		box.modulate.a=0;var destination:=position;position+=Vector2i(0,16)
		var animation:=create_tween().set_parallel(true)
		animation.tween_property(box,"modulate:a",1.0,0.25)
		animation.tween_property(self,"position",destination,0.3).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)

func invalidate(_value:Variant=null) -> void:
	prepared.clear()
	if confirm_button:confirm_button.disabled=true

func lock_fields(locked:bool) -> void:
	fields_locked=locked
	validate_button.disabled=locked
	paste_button.disabled=locked
	update_page_controls()
	for row in inputs:
		row[0].editable=not locked;row[1].editable=not locked;row[2].disabled=locked

func paste_text(text:String) -> void:
	if fields_locked:return
	var parsed:Dictionary=preload("res://src/ui/sms_paste_parser.gd").parse(text)
	if not parsed.get("ok",false):feedback.text=str(parsed.error)+" Nada foi substituído.";return
	pasted_rows=parsed.rows;page=0;load_page()
	feedback.text="%d aparelhos organizados em %d lotes de até 10. Cada lote exige revisão e confirmação; nada foi enviado." % [pasted_rows.size(),ceili(pasted_rows.size()/10.0)]

func update_page_controls() -> void:
	var pages:=maxi(1,ceili(pasted_rows.size()/10.0))
	page_label.text="Lote %d/%d · %d aparelhos" % [page+1,pages,pasted_rows.size()] if not pasted_rows.is_empty() else "Lote 1 · até 10"
	previous_button.disabled=fields_locked or page==0
	next_button.disabled=fields_locked or page+1>=pages

func change_page(direction:int) -> void:
	if fields_locked or pasted_rows.is_empty():return
	var target:=page+direction
	if target<0 or target>=ceili(pasted_rows.size()/10.0):return
	for i in range(10):
		var index:=page*10+i
		if index>=pasted_rows.size():
			if inputs[i][0].text=="" and inputs[i][1].text=="" and inputs[i][2].get_selected_id()==0:continue
			while pasted_rows.size()<=index:pasted_rows.append({})
		pasted_rows[index]={"serial":inputs[i][0].text,"phone":inputs[i][1].text,"group":inputs[i][2].get_selected_id()}
	page=target;load_page()
	feedback.text="Lote %d selecionado. Prepare, revise e confirme somente este lote." % (page+1)

func load_page() -> void:
	invalidate();review.text=""
	for i in range(10):
		var index:=page*10+i
		var value:Dictionary=pasted_rows[index] if index<pasted_rows.size() else {}
		inputs[i][0].text=str(value.get("serial",""));inputs[i][1].text=str(value.get("phone",""));inputs[i][2].select(int(value.get("group",0)))
		row_labels[i].text="%02d" % (index+1)
	update_page_controls()

func prepare() -> void:
	prepared.clear();confirm_button.disabled=true;review.text=""
	if branch!="imperatriz" or str(host.selected_branch_id)!=branch:feedback.text="Disponível somente na base Imperatriz.";return
	var rows:Array=[];var seen:Dictionary={}
	for row in inputs:
		var serial:String=host._digits_only(row[0].text)
		var phone:String=host._format_grupo_rs_sms_phone(row[1].text)
		var group:int=row[2].get_selected_id()
		if row[0].text.strip_edges()=="" and row[1].text.strip_edges()=="" and group==0:continue
		if serial.length()!=9 or not serial.begins_with("024") or phone=="" or group<1:
			feedback.text="Todas as linhas usadas exigem série 024 válida, telefone e grupo.";return
		if seen.has(serial) or seen.has(phone):feedback.text="Série ou telefone repetido no lote.";return
		seen[serial]=true;seen[phone]=true;rows.append({"serial":serial,"phone":phone,"group":group})
	if rows.is_empty():feedback.text="Preencha ao menos uma linha.";return
	lock_fields(true);feedback.text="Preparando os comandos com os dados informados…"
	for row in rows:
		var command:String=host._rs300_apn_command_for_apn(row.serial,"hinova.br").replace("grupors1.ddns.net","grupors%d.ddns.net" % row.group)
		var phone:String="+55"+host._digits_only(row.phone)
		prepared.append({"version":2,"serial":row.serial,"phone":phone,"command":command,"command_mode":"standard","source_phone_snapshot":phone,"standard_command_snapshot":command,"apn_snapshot":"hinova.br","status_snapshot":"Informado no lote","group":row.group})
		review.text+="%s • %s • Grupo %d\n%s\n" % [row.serial,row.phone,row.group,command]
	lock_fields(false);confirm_button.disabled=false
	feedback.text="Revise os %d destinatários informados e os comandos (APN hinova.br). Sem consulta ao cadastro. Confirmar autoriza o lote por até 2 horas." % prepared.size()

func submit() -> void:
	if prepared.is_empty() or str(host.selected_branch_id)!=branch:return
	confirm_button.disabled=true;lock_fields(true)
	var result:Dictionary=await gateway.call_service("enqueue_batch",{"manual":true,"rows":prepared})
	lock_fields(false)
	if result.get("ok",false):
		prepared.clear();feedback.text="Lote registrado. Acompanhe cada confirmação no Painel SMS."
	else:feedback.text=str(result.get("error","Não foi possível registrar o lote. Consulte novamente."));prepared.clear()

func cancel_batch() -> void:
	var listed:Dictionary=await gateway.call_service("list")
	var ids:Dictionary={}
	for job in listed.get("jobs",[]):
		if job.has("batch") and job.get("state") in ["waiting_gateway","received","sending"]:ids[job.batch.batch_id]=true
	for id in ids:await gateway.call_service("cancel_batch",{"batch_id":id})
	feedback.text="Cancelamento solicitado. Pedidos recebidos pelo celular dependem da confirmação dele; confira o Painel SMS."
