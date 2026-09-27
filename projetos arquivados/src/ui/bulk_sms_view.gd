extends RefCounted
## Approved SMS batch composition. Presentation only; queue policy stays in dialog.
const UI=preload("res://src/ui/approved_dashboard.gd")
const Motion=preload("res://src/ui/card_hover_motion.gd")
const Buttons=preload("res://src/ui/button_motion.gd")
const INK=Color("#123757")
const BLUE=Color("#0877df")
const MUTED=Color("#617b9d")
class Header extends PanelContainer:
	var texture:Texture2D=load("res://assets/icons/bulk_sms/header.svg")
	func _draw() -> void:draw_texture_rect(texture,Rect2(Vector2.ZERO,size),false)

static func surface(color:Color=Color.WHITE, radius:int=14, padding:int=16) -> StyleBoxFlat:
	var s:=StyleBoxFlat.new();s.bg_color=color;s.border_color=Color("#d8e5f2");s.set_border_width_all(1);s.set_corner_radius_all(radius)
	s.set_content_margin_all(padding)
	return s

static func icon(key:String, pixels:int=22, tint:Color=BLUE) -> TextureRect:
	var node:=TextureRect.new();node.texture=load("res://assets/icons/bulk_sms/"+key+".svg");node.custom_minimum_size=Vector2(pixels,pixels)
	node.expand_mode=TextureRect.EXPAND_IGNORE_SIZE;node.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED;node.modulate=tint;node.size_flags_vertical=Control.SIZE_SHRINK_CENTER
	return node

static func card(parent:Node, color:Color=Color.WHITE, padding:int=18) -> VBoxContainer:
	var p:=PanelContainer.new();p.size_flags_horizontal=Control.SIZE_EXPAND_FILL;p.add_theme_stylebox_override("panel",surface(color,14,padding));parent.add_child(p);Motion.attach(p)
	var b:=VBoxContainer.new();b.add_theme_constant_override("separation",12);p.add_child(b);return b

static func button(label:String,key:String,call:Callable,fill:Color=Color.WHITE,ink:Color=INK) -> Button:
	var b:=Button.new();b.text=label;b.custom_minimum_size=Vector2(150,42);b.icon=load("res://assets/icons/bulk_sms/"+key+("_blue" if key in ["clipboard","mail","plus"] else "")+".svg");b.expand_icon=true
	b.add_theme_constant_override("icon_max_width",20);b.add_theme_constant_override("h_separation",12)
	b.add_theme_font_override("font",UI.Semibold)
	for state in ["normal","hover","pressed","disabled","focus"]:
		var color:=fill
		if state=="hover":color=fill.lightened(0.06) if fill!=Color.WHITE else Color("#edf6ff")
		if state=="disabled":color=Color("#b2d5f7")
		var s:=surface(color,9,12)
		if state=="focus":s.border_color=BLUE;s.set_border_width_all(2)
		b.add_theme_stylebox_override(state,s)
		b.add_theme_color_override("font_"+state+"_color",ink if state!="disabled" else Color("#f3f8ff"))
		b.add_theme_color_override("icon_"+state+"_color",ink if state!="disabled" else Color("#f3f8ff"))
	b.add_theme_color_override("font_color",ink);b.add_theme_color_override("icon_normal_color",ink)
	b.pressed.connect(call);Buttons.attach(b);return b

static func heading(parent:Node,number:String,title:String) -> HBoxContainer:
	var row:=HBoxContainer.new();row.add_theme_constant_override("separation",12);parent.add_child(row)
	var badge:=PanelContainer.new();badge.add_theme_stylebox_override("panel",surface(Color("#eaf4ff"),22,9));badge.add_child(UI.text(number,19,BLUE));row.add_child(badge)
	var text:=UI.text(title,20,INK);text.size_flags_horizontal=Control.SIZE_EXPAND_FILL;row.add_child(text);return row

static func build(d:AcceptDialog) -> void:
	d.title="SMS em massa";d.borderless=true;d.transparent=true;d.transparent_bg=true;d.get_ok_button().hide()
	d.theme=Theme.new();d.theme.default_font=UI.Regular;d.theme.default_font_size=14
	d.add_theme_stylebox_override("panel",StyleBoxEmpty.new())
	var root:=VBoxContainer.new();root.name="ApprovedSmsBatch";root.custom_minimum_size=Vector2(1100,750);root.add_theme_constant_override("separation",0);d.add_child(root)
	var header:=Header.new();header.custom_minimum_size.y=112;root.add_child(header)
	var hs:=surface(Color.TRANSPARENT,22,22);hs.set_border_width_all(0);header.add_theme_stylebox_override("panel",hs)
	var h:=HBoxContainer.new();h.add_theme_constant_override("separation",22);header.add_child(h);h.add_child(icon("chat",48,Color.WHITE))
	var titles:=VBoxContainer.new();titles.size_flags_horizontal=Control.SIZE_EXPAND_FILL;h.add_child(titles)
	titles.add_child(UI.text("GRUPO RS CENTRAL",11,Color("#d4e8ff")));titles.add_child(UI.text("SMS em massa",30,Color.WHITE));titles.add_child(UI.text("Organize os aparelhos e revise antes de enviar.",14,Color("#e1efff")))
	var close:=button("","close",d.hide,Color("#176ab0"),Color.WHITE);close.custom_minimum_size=Vector2(40,40);close.size_flags_vertical=Control.SIZE_SHRINK_CENTER;h.add_child(close)
	var body_panel:=PanelContainer.new();var bs:=surface(Color.WHITE,22,18);bs.corner_radius_top_left=0;bs.corner_radius_top_right=0;body_panel.add_theme_stylebox_override("panel",bs);root.add_child(body_panel)
	var body:=VBoxContainer.new();body.add_theme_constant_override("separation",14);body_panel.add_child(body)
	var metrics:=HBoxContainer.new();metrics.add_theme_constant_override("separation",14);body.add_child(metrics)
	for item in [["phone","10 aparelhos","Limite por lote",BLUE],["clock","60 segundos","Após confirmação do Android",Color("#ff8918")],["calendar","2 horas","Validade do pedido",BLUE]]:
		var m:=card(metrics,Color.WHITE,14);var r:=HBoxContainer.new();r.add_theme_constant_override("separation",18);m.add_child(r)
		var circle:=PanelContainer.new();circle.add_theme_stylebox_override("panel",surface(Color("#fff2e6") if item[0]=="clock" else Color("#eaf4ff"),30,10));circle.add_child(icon(item[0],28,item[3]));r.add_child(circle)
		var texts:=VBoxContainer.new();r.add_child(texts);texts.add_child(UI.text(item[1],20,INK));texts.add_child(UI.text(item[2],13,MUTED))
	var columns:=HBoxContainer.new();columns.add_theme_constant_override("separation",14);body.add_child(columns)
	var left:=card(columns);left.get_parent().size_flags_stretch_ratio=1.65
	var lh:=heading(left,"01","Lista de aparelhos")
	d.paste_button=button("Colar lista","clipboard",func():d.paste_text(DisplayServer.clipboard_get()),Color("#edf6ff"),BLUE);lh.add_child(d.paste_button)
	var nav:=HBoxContainer.new();left.add_child(nav);d.page_label=UI.text("Lote 1 de 1",12,MUTED);d.page_label.size_flags_horizontal=Control.SIZE_EXPAND_FILL;nav.add_child(d.page_label)
	d.previous_button=button("‹","file",func():d.change_page(-1));d.next_button=button("›","file",func():d.change_page(1))
	for b in [d.previous_button,d.next_button]:b.icon=null;b.custom_minimum_size=Vector2(28,24);b.add_theme_stylebox_override("normal",surface(Color.WHITE,7,2));b.add_theme_stylebox_override("disabled",surface(Color("#f0f5fa"),7,2));nav.add_child(b);b.disabled=true
	var scroll:=ScrollContainer.new();scroll.name="BatchRows";scroll.custom_minimum_size.y=280;scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED;left.add_child(scroll)
	var grid:=GridContainer.new();grid.columns=4;grid.size_flags_horizontal=Control.SIZE_EXPAND_FILL;grid.add_theme_constant_override("h_separation",8);grid.add_theme_constant_override("v_separation",7);scroll.add_child(grid)
	for text in ["#","Série do aparelho","Telefone com DDD","Grupo *"]:grid.add_child(UI.text(text,12,INK))
	for i in range(10):
		var n:=UI.text("%02d"%(i+1),12,MUTED);grid.add_child(n);d.row_labels.append(n)
		var serial:=LineEdit.new();serial.placeholder_text="024…";var phone:=LineEdit.new();phone.placeholder_text="DDD + telefone"
		for field in [serial,phone]:
			field.custom_minimum_size=Vector2(150 if field==serial else 170,34);field.size_flags_horizontal=Control.SIZE_EXPAND_FILL
			field.add_theme_stylebox_override("normal",surface(Color.WHITE,7,7));field.add_theme_stylebox_override("focus",surface(Color("#f3f9ff"),7,7));field.add_theme_color_override("font_color",INK);grid.add_child(field);field.text_changed.connect(d.invalidate)
		var group:=OptionButton.new();group.custom_minimum_size=Vector2(125,34);group.size_flags_horizontal=Control.SIZE_EXPAND_FILL;group.add_item("Selecionar",0)
		for g in range(1,5):group.add_item("Grupo %d"%g,g)
		for state in ["normal","hover","pressed","focus"]:group.add_theme_stylebox_override(state,surface(Color("#edf6ff"),7,7))
		group.add_theme_color_override("font_color",BLUE);group.add_theme_color_override("font_hover_color",BLUE);group.add_theme_color_override("font_pressed_color",BLUE);Buttons.attach(group);grid.add_child(group);group.item_selected.connect(d.invalidate);d.inputs.append([serial,phone,group])
	var row_actions:=HBoxContainer.new();left.add_child(row_actions)
	var add:=button("Adicionar linha","plus",d.add_row,Color.WHITE,BLUE);add.custom_minimum_size.y=32;row_actions.add_child(add);d.set_meta("add_button",add)
	var row_hint:=UI.text("6 de 10 linhas",12,MUTED);row_hint.size_flags_horizontal=Control.SIZE_EXPAND_FILL;row_hint.horizontal_alignment=HORIZONTAL_ALIGNMENT_RIGHT;row_actions.add_child(row_hint);d.set_meta("row_hint",row_hint)
	var right:=card(columns);right.get_parent().size_flags_stretch_ratio=1.0
	var rh:=heading(right,"02","Revisão do lote")
	var state:=UI.text("Aguardando revisão",11,MUTED);rh.add_child(state);d.set_meta("review_state",state)
	var apn_row:=HBoxContainer.new();right.add_child(apn_row);var apn_title:=UI.text("APN do lote",13,INK);apn_title.size_flags_horizontal=Control.SIZE_EXPAND_FILL;apn_row.add_child(apn_title)
	d.apn_selector=OptionButton.new();d.apn_selector.add_item("Hinova",0);d.apn_selector.add_item("Link Solutions",1);d.apn_selector.custom_minimum_size=Vector2(190,36)
	for state_name in ["normal","hover","pressed","focus"]:d.apn_selector.add_theme_stylebox_override(state_name,surface(Color("#edf6ff"),9,8))
	d.apn_selector.add_theme_color_override("font_color",BLUE);d.apn_selector.item_selected.connect(d.invalidate);Buttons.attach(d.apn_selector);apn_row.add_child(d.apn_selector)
	var summary:=card(right,Color("#edf6ff"),14)
	for item in [["Aparelhos preenchidos","0"],["Destino","Selecione os grupos"],["APN padrão","hinova.br"]]:
		var r:=HBoxContainer.new();summary.add_child(r);var label:=UI.text(item[0],13,INK);label.size_flags_horizontal=Control.SIZE_EXPAND_FILL;r.add_child(label);var value:=UI.text(item[1],13,INK);r.add_child(value)
		if item[0]=="Aparelhos preenchidos":d.set_meta("count_label",value)
		if item[0]=="Destino":d.set_meta("groups_label",value)
		if item[0]=="APN padrão":d.set_meta("apn_label",value)
	var preview:=card(right,Color.WHITE,12);var ph:=HBoxContainer.new();ph.add_theme_constant_override("separation",10);preview.add_child(ph);ph.add_child(icon("file"));ph.add_child(UI.text("Prévia do comando",17,INK))
	d.review=TextEdit.new();d.review.editable=false;d.review.custom_minimum_size=Vector2(0,98);d.review.wrap_mode=TextEdit.LINE_WRAPPING_BOUNDARY;d.review.placeholder_text="Prepare o lote para conferir os comandos."
	d.review.add_theme_stylebox_override("read_only",surface(Color("#f2f5f9"),9,10));d.review.add_theme_color_override("font_readonly_color",INK);d.review.add_theme_color_override("font_placeholder_color",MUTED);preview.add_child(d.review)
	var note_row:=HBoxContainer.new();note_row.add_theme_constant_override("separation",10);right.add_child(note_row);note_row.add_child(icon("info",20))
	var note:=UI.text("Usa os dados da lista.\nNão exige cadastro no estoque.",12,MUTED);note_row.add_child(note)
	d.feedback=UI.text("Preencha ou cole a lista para preparar o lote. Nenhum SMS será enviado antes da confirmação.",12,MUTED);d.feedback.custom_minimum_size.x=1000;d.feedback.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;body.add_child(d.feedback)
	var actions:=HBoxContainer.new();actions.add_theme_constant_override("separation",14);body.add_child(actions);actions.add_child(button("Painel SMS","mail",func():d.hide();d.host._show_sms_panel()))
	var space:=Control.new();space.size_flags_horizontal=Control.SIZE_EXPAND_FILL;actions.add_child(space)
	d.validate_button=button("Preparar e revisar","refresh",d.prepare,Color("#ff8918"),Color.WHITE);d.validate_button.custom_minimum_size=Vector2(235,48);actions.add_child(d.validate_button)
	d.confirm_button=button("Confirmar lote","send",d.submit,BLUE,Color.WHITE);d.confirm_button.custom_minimum_size=Vector2(235,48);d.confirm_button.disabled=true;actions.add_child(d.confirm_button)
	var cancel:=LinkButton.new();cancel.text="Cancelar lote pendente";cancel.add_theme_color_override("font_color",BLUE);cancel.pressed.connect(d.cancel_batch);body.add_child(cancel)
	var warning:=UI.text("Falha ou resultado indeterminado interrompe a sequência. O intervalo não garante que a operadora não bloqueie o chip.",11,MUTED);warning.custom_minimum_size.x=1000;warning.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;body.add_child(warning)
	d.update_visible_rows()
	d.min_size=Vector2i(1100,750);root.size=Vector2(1320,900)
	await d.get_tree().process_frame
	if not is_instance_valid(d):return
	d.reset_size();d.popup_centered(Vector2i(1320,900))
	if OS.get_environment("GRUPO_RS_REDUCED_MOTION")!="1":
		root.modulate.a=0;var destination:=d.position;d.position+=Vector2i(0,14);var t:=d.create_tween().set_parallel(true);t.tween_property(root,"modulate:a",1.0,0.25);t.tween_property(d,"position",destination,0.32).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
