extends VBoxContainer
## Separate warehouse; read-only Arya confirmation for manual chip intake.
var host: Node
var service: Node
var kind := "equipment"
var page_index := 0
var total := 0
var loading := false
var syncing := false
var last_usage_check := -15000
var usage_status: Label
var sending := false
var selected := {}
var search: LineEdit
var table: Tree
var status_overlay: Control
var status: Label
var page_buttons: HBoxContainer
var destination_summary: Label
var shipment_count: Label
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
var destination_mode := "base"
const BASE_IDS := ["imperatriz","araguaina","acailandia","maraba"]

func label(value: String, size: int = 16) -> Label:
	var item := Label.new();item.text=value
	item.add_theme_font_size_override("font_size",size)
	item.add_theme_color_override("font_color",Color("#173a59"))
	return item

func action(value: String, callback: Callable, primary: bool=false) -> Button:
	var button: Button=host._make_action_button(value,Color("#137ad2") if primary else Color.WHITE,Color("#cbdff0"),Color.WHITE if primary else Color("#173a59"),Vector2(100,44),callback)
	button.size_flags_vertical=Control.SIZE_SHRINK_CENTER
	button.add_theme_font_size_override("font_size",17)
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
	input.custom_minimum_size.y=44
	if input is OptionButton:
		for state in ["hover","pressed","disabled"]:
			var surface:StyleBoxFlat=host._style_box(Color("#eef6ff") if state=="hover" else Color.WHITE,Color("#91bee9") if state=="pressed" else Color("#cbdff0"),1,10)
			surface.content_margin_left=12;surface.content_margin_right=12;input.add_theme_stylebox_override(state,surface)
		for state in ["font_hover_color","font_pressed_color","font_focus_color","font_disabled_color"]:input.add_theme_color_override(state,Color("#173a59"))
		input.add_theme_color_override("arrow",Color("#53789c"))
		var popup:PopupMenu=input.get_popup()
		var surface:StyleBoxFlat=host._style_box(Color.WHITE,Color("#cbdff0"),1,10)
		for edge in ["left","right","top","bottom"]:surface.set_content_margin({"left":SIDE_LEFT,"right":SIDE_RIGHT,"top":SIDE_TOP,"bottom":SIDE_BOTTOM}[edge],8)
		popup.add_theme_stylebox_override("panel",surface)
		popup.add_theme_stylebox_override("hover",host._style_box(Color("#e5f1ff"),Color.TRANSPARENT,0,6))
		popup.add_theme_color_override("font_color",Color("#173a59"));popup.add_theme_color_override("font_hover_color",Color("#0767c6"))
		popup.add_theme_color_override("font_disabled_color",Color("#607895"))
		popup.add_theme_constant_override("v_separation",16);popup.add_theme_constant_override("h_separation",12)
		popup.add_theme_icon_override("radio_checked",checkbox_texture(true));popup.add_theme_icon_override("radio_unchecked",checkbox_texture(false))

func panel(parent: Node, padding: int=18) -> VBoxContainer:
	var outer:=PanelContainer.new();outer.size_flags_horizontal=Control.SIZE_EXPAND_FILL;parent.add_child(outer)
	outer.add_theme_stylebox_override("panel",host._style_box(Color.WHITE,Color("#d3e2ef"),1,16))
	var margin:=MarginContainer.new();outer.add_child(margin)
	for edge in ["left","right","top","bottom"]:margin.add_theme_constant_override("margin_"+edge,padding)
	var box:=VBoxContainer.new();box.add_theme_constant_override("separation",12);margin.add_child(box)
	return box

func icon_texture(symbol: String, color: String) -> ImageTexture:
	var paths:={"device":"M7 2h10v20H7z M10 18h4", "chip":"M7 2h8l4 4v16H5V2z M9 9h6v9H9z M9 13h6", "truck":"M2 5h12v12H2z M14 10h4l4 4v3h-8 M5 17a2 2 0 1 0 0.1 0 M18 17a2 2 0 1 0 0.1 0", "send":"M2 11L22 2l-6 20-5-8-9-3z M11 14L22 2", "remove":"M6 6l12 12M18 6L6 18", "search":"M17 17l5 5 M19 10a9 9 0 1 0-18 0 9 9 0 0 0 18 0", "trash":"M4 6h16 M9 3h6 M6 6l1 16h10l1-16 M10 10v8 M14 10v8"}
	var image:=Image.new()
	image.load_svg_from_string('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="%s" fill="none" stroke="%s" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' % [paths[symbol],color])
	return ImageTexture.create_from_image(image)

func checkbox_texture(checked: bool) -> ImageTexture:
	var image:=Image.new()
	var svg:='<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><rect x="2" y="2" width="18" height="18" rx="4" fill="%s" stroke="%s" stroke-width="1.3"/>' % ["#0878ed" if checked else "#ffffff","#0878ed" if checked else "#a8bed4"]
	if checked:svg+='<path d="m6 11 3 3 7-7" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
	image.load_svg_from_string(svg+'</svg>');return ImageTexture.create_from_image(image)

func metric(parent: Node, title: String, symbol: String, tint: String, fill: String) -> Label:
	var box:=panel(parent,20)
	var row:=HBoxContainer.new();row.add_theme_constant_override("separation",22);box.add_child(row)
	var circle:=PanelContainer.new();circle.custom_minimum_size=Vector2(68,68)
	circle.add_theme_stylebox_override("panel",host._style_box(Color(fill),Color.TRANSPARENT,0,34));row.add_child(circle)
	var center:=CenterContainer.new();circle.add_child(center)
	var picture:=TextureRect.new();picture.texture=icon_texture(symbol,tint);picture.custom_minimum_size=Vector2(32,32);picture.expand_mode=TextureRect.EXPAND_IGNORE_SIZE;center.add_child(picture)
	var content:=VBoxContainer.new();content.size_flags_vertical=Control.SIZE_SHRINK_CENTER;row.add_child(content)
	var title_label:=label(title,17);title_label.add_theme_color_override("font_color",Color("#607895"));content.add_child(title_label)
	var count:=label("—",36);count.add_theme_font_override("font",preload("res://assets/fonts/Noto_Sans/static/NotoSans-Bold.ttf"));content.add_child(count);return count

func style_tab(button: Button, active: bool) -> void:
	for state in ["normal","hover","pressed","disabled"]:
		var box:=StyleBoxFlat.new();box.bg_color=Color("#f2f7ff") if state=="hover" else Color.WHITE
		box.content_margin_left=20;box.content_margin_right=20;box.content_margin_bottom=10;box.content_margin_top=8
		box.border_width_bottom=3 if active else 1;box.border_color=Color("#0878ed") if active else Color("#e4edf6")
		button.add_theme_stylebox_override(state,box)
		button.add_theme_color_override("font_"+state+"_color",Color("#0878ed") if active else Color("#607895"))
	button.add_theme_color_override("font_color",Color("#0878ed") if active else Color("#607895"))
	button.add_theme_color_override("font_disabled_color",Color("#0878ed"))

func tab_count(button: Button, title: String, value: String, active: bool) -> void:
	button.text=title;button.alignment=HORIZONTAL_ALIGNMENT_LEFT
	if button.has_node("Counter"):button.get_node("Counter").free()
	var width:=theme.default_font.get_string_size(value,HORIZONTAL_ALIGNMENT_LEFT,-1,14).x+16
	button.custom_minimum_size.x=theme.default_font.get_string_size(title,HORIZONTAL_ALIGNMENT_LEFT,-1,17).x+width+58
	var badge:=PanelContainer.new();badge.name="Counter";badge.mouse_filter=Control.MOUSE_FILTER_IGNORE;button.add_child(badge)
	badge.anchor_left=1;badge.anchor_right=1;badge.anchor_top=0.5;badge.anchor_bottom=0.5
	badge.offset_left=-width-16;badge.offset_right=-16;badge.offset_top=-14;badge.offset_bottom=10
	badge.add_theme_stylebox_override("panel",host._style_box(Color("#0878ed") if active else Color("#eaf3ff"),Color.TRANSPARENT,0,12))
	var count:=label(value,14);count.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;count.add_theme_color_override("font_color",Color.WHITE if active else Color("#2463a5"));badge.add_child(count)

func draw_status(item: TreeItem, rect: Rect2) -> void:
	var row:Dictionary=item.get_metadata(0)
	var color:=Color("#159b47") if row.state=="available" else Color("#246fab")
	var text:="Disponível" if row.state=="available" else ("Utilizado" if row.state=="used" else "Enviado")
	var font:Font=theme.default_font
	var width:=font.get_string_size(text,HORIZONTAL_ALIGNMENT_LEFT,-1,16).x+36
	var badge:=Rect2(rect.position+Vector2(8,(rect.size.y-28)/2),Vector2(width,28))
	var box:=StyleBoxFlat.new();box.bg_color=Color("#def5e5") if row.state=="available" else Color("#e7f1fd")
	box.set_corner_radius_all(13)
	var canvas:=status_overlay.get_canvas_item()
	box.draw(canvas,badge)
	RenderingServer.canvas_item_add_circle(canvas,badge.position+Vector2(12,14),3,color)
	font.draw_string(canvas,badge.position+Vector2(22,20),text,HORIZONTAL_ALIGNMENT_LEFT,-1,16,color)

func draw_statuses() -> void:
	if kind=="movements" or table.get_root()==null:return
	for item in table.get_root().get_children():
		var rect:=table.get_item_area_rect(item,3)
		if rect.position.y<24 or rect.position.y>=table.size.y:continue
		draw_status(item,rect)

func go_page(value: int) -> void:
	if loading or sending:return
	page_index=value;refresh()

func update_pages() -> void:
	for child in page_buttons.get_children():page_buttons.remove_child(child);child.queue_free()
	var count:=maxi(1,ceili(total/12.0))
	var first:=maxi(0,mini(page_index-2,count-5))
	for index in range(first,mini(count,first+5)):
		var button:=action(str(index+1),go_page.bind(index),index==page_index)
		button.custom_minimum_size=Vector2(38,38);button.disabled=index==page_index
		if index==page_index:
			button.add_theme_stylebox_override("disabled",host._style_box(Color("#0878ed"),Color("#0878ed"),1,7))
			button.add_theme_color_override("font_disabled_color",Color.WHITE)
		page_buttons.add_child(button)

func setup(owner_node: Node, bridge: Node) -> void:
	host=owner_node;service=bridge;name="ScannerInventory"
	theme=Theme.new();theme.default_font=preload("res://assets/fonts/Noto_Sans/static/NotoSans-Regular.ttf");theme.default_font_size=18
	add_theme_constant_override("separation",16)
	var header:=HBoxContainer.new();add_child(header)
	var titles:=VBoxContainer.new();titles.size_flags_horizontal=Control.SIZE_EXPAND_FILL;header.add_child(titles)
	titles.add_child(label("Armazém",40));titles.add_child(label("Aparelhos e chips • cadastro manual e distribuição",16))
	header.add_child(action("+ Novo item",manual_dialog,true))
	header.add_child(action("Atualizar lista",receive))
	var strip:=HBoxContainer.new();add_child(strip)
	status=label("Cadastre aparelhos e chips pelo número, preservando os zeros iniciais.",15);status.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	status.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;strip.add_child(status)
	usage_status=label("Verificando utilização dos chips…",14);strip.add_child(usage_status)
	var metrics:=HBoxContainer.new();metrics.add_theme_constant_override("separation",16);add_child(metrics)
	equipment_count=metric(metrics,"Aparelhos disponíveis","device","#0878ed","#e3f0ff")
	chip_count=metric(metrics,"Chips disponíveis","chip","#ff9000","#fff0db")
	sent_count=metric(metrics,"Enviados hoje","truck","#159b47","#e2f6e8")
	var body:=HBoxContainer.new();body.add_theme_constant_override("separation",18);body.size_flags_vertical=Control.SIZE_EXPAND_FILL;add_child(body)
	var left:=panel(body);left.get_parent().get_parent().set_meta("static_card",true);left.get_parent().get_parent().size_flags_stretch_ratio=2.05
	var tabs:=HBoxContainer.new();tabs.add_theme_constant_override("separation",8);left.add_child(tabs)
	devices=action("Aparelhos",select_kind.bind("equipment"));chips=action("Chips",select_kind.bind("chip"));movements=action("Movimentações",select_kind.bind("movements"))
	for button in [devices,chips,movements]:tabs.add_child(button)
	var filters:=HBoxContainer.new();filters.add_theme_constant_override("separation",8);left.add_child(filters)
	search=LineEdit.new();search.placeholder_text="Buscar número de série…";search.right_icon=icon_texture("search","#7890a9");search.size_flags_horizontal=Control.SIZE_EXPAND_FILL;style_input(search);filters.add_child(search)
	search.text_submitted.connect(func(_value):search_rows())
	filter=OptionButton.new();for text in ["Disponíveis","Enviados","Utilizados","Todos"]:filter.add_item(text)
	style_input(filter);filters.add_child(filter);filter.item_selected.connect(func(_index):search_rows())
	filters.add_child(action("Buscar",search_rows))
	select_all=CheckBox.new();select_all.text="Selecionar esta página";select_all.add_theme_color_override("font_color",Color("#173a59"));select_all.text="";select_all.tooltip_text="Selecionar esta página"
	for state in ["font_color","font_hover_color","font_pressed_color","font_hover_pressed_color","font_focus_color"]:select_all.add_theme_color_override(state,Color("#173a59"))
	select_all.toggled.connect(check_page)
	table=Tree.new();table.name="ScannerReadings";table.columns=5;table.hide_root=true;table.column_titles_visible=true
	table.size_flags_vertical=Control.SIZE_EXPAND_FILL;table.custom_minimum_size.y=200
	table.add_theme_stylebox_override("panel",host._style_box(Color.WHITE,Color("#d3e2ef"),1,10))
	table.add_theme_color_override("font_hovered_color",Color("#173a59"));table.add_theme_color_override("font_color",Color("#173a59"));table.add_theme_color_override("font_selected_color",Color("#173a59"))
	for state in ["selected","selected_focus"]:table.add_theme_stylebox_override(state,host._style_box(Color("#e4f1ff"),Color.TRANSPARENT,0,4))
	for state in ["title_button_normal","title_button_hover","title_button_pressed"]:table.add_theme_stylebox_override(state,host._style_box(Color("#eef4fa"),Color.TRANSPARENT,0,4))
	table.add_theme_color_override("title_button_color",Color("#536f8c"));table.add_theme_constant_override("v_separation",7)
	table.set_column_expand(0,false);table.set_column_custom_minimum_width(0,38)
	table.set_column_expand_ratio(1,2)
	table.set_column_expand(4,false);table.set_column_custom_minimum_width(4,65)
	for i in range(5):table.set_column_title_alignment(i,HORIZONTAL_ALIGNMENT_LEFT)
	table.add_theme_icon_override("checked",checkbox_texture(true));table.add_theme_icon_override("unchecked",checkbox_texture(false))
	select_all.add_theme_icon_override("checked",checkbox_texture(true));select_all.add_theme_icon_override("unchecked",checkbox_texture(false))
	table.item_edited.connect(check_item);table.button_clicked.connect(func(item:TreeItem,_column:int,_id:int,_mouse:int):review_removal(item.get_metadata(0)));left.add_child(table)
	table.add_child(select_all);select_all.position=Vector2(4,0);select_all.z_index=3
	status_overlay=Control.new();status_overlay.mouse_filter=Control.MOUSE_FILTER_IGNORE;status_overlay.clip_contents=true;status_overlay.z_index=1;table.add_child(status_overlay);status_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	status_overlay.draw.connect(draw_statuses);table.draw.connect(status_overlay.queue_redraw)
	var footer:=HBoxContainer.new();left.add_child(footer)
	pages=label("",14);pages.size_flags_horizontal=Control.SIZE_EXPAND_FILL;footer.add_child(pages)
	var previous:=action("‹",move_page.bind(-1));previous.custom_minimum_size.x=38;footer.add_child(previous)
	page_buttons=HBoxContainer.new();page_buttons.add_theme_constant_override("separation",6);footer.add_child(page_buttons)
	var next:=action("›",move_page.bind(1));next.custom_minimum_size.x=38;footer.add_child(next)
	var selection_panel:=PanelContainer.new();selection_panel.custom_minimum_size.y=58;selection_panel.add_theme_stylebox_override("panel",host._style_box(Color("#eff7ff"),Color("#d5e8ff"),1,10));left.add_child(selection_panel)
	var selected_row:=HBoxContainer.new();selection_panel.add_child(selected_row)
	selected_label=label("Nenhum item selecionado",15);selected_label.size_flags_horizontal=Control.SIZE_EXPAND_FILL;selected_row.add_child(selected_label)
	var clear:=action("Limpar seleção",clear_selection);clear.icon=icon_texture("trash","#0878ed");selected_row.add_child(clear)
	var right:=panel(body);right.get_parent().get_parent().set_meta("static_card",true);right.get_parent().get_parent().custom_minimum_size.x=350
	var send_title:=HBoxContainer.new();send_title.add_theme_constant_override("separation",18);right.add_child(send_title)
	var truck:=TextureRect.new();truck.texture=icon_texture("truck","#163655");truck.custom_minimum_size=Vector2(36,36);truck.expand_mode=TextureRect.EXPAND_IGNORE_SIZE;truck.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED;send_title.add_child(truck)
	var send_text:=VBoxContainer.new();send_title.add_child(send_text);send_text.add_child(label("Enviar selecionados",22))
	shipment_count=label("Nenhum item selecionado",15);send_text.add_child(shipment_count)
	var modes:=HBoxContainer.new();right.add_child(modes)
	base_mode=action("Selecionar base",set_mode.bind("base"));custom_mode=action("Escrever destino",set_mode.bind("custom"))
	modes.add_child(base_mode);modes.add_child(custom_mode)
	right.add_child(label("Base de destino",16));base=OptionButton.new()
	for title in ["Imperatriz","Araguaína","Açailândia","Marabá"]:base.add_item(title)
	style_input(base);right.add_child(base);base.item_selected.connect(func(_index):update_selection())
	custom=LineEdit.new();custom.placeholder_text="Ex.: laboratório ou fornecedor";custom.max_length=120;style_input(custom);right.add_child(custom)
	custom.text_changed.connect(func(_value):update_selection())
	var base_hint:=label("Imperatriz · Araguaína · Açailândia · Marabá\nPara outro local, use Escrever destino.",14);base_hint.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;right.add_child(base_hint)
	right.add_child(label("Observação (opcional)",16));note=LineEdit.new();note.placeholder_text="Ex.: reposição da filial";note.max_length=500;style_input(note);right.add_child(note)
	var spacer:=Control.new();spacer.size_flags_vertical=Control.SIZE_EXPAND_FILL;right.add_child(spacer)
	right.add_child(HSeparator.new())
	var summary_row:=HBoxContainer.new();right.add_child(summary_row);var item_title:=label("Itens",16);item_title.size_flags_horizontal=Control.SIZE_EXPAND_FILL;summary_row.add_child(item_title)
	selection_summary=label("",17);summary_row.add_child(selection_summary)
	var destination_row:=HBoxContainer.new();right.add_child(destination_row);var dest_title:=label("Destino",16);dest_title.size_flags_horizontal=Control.SIZE_EXPAND_FILL;destination_row.add_child(dest_title)
	destination_summary=label("",17);destination_row.add_child(destination_summary)
	review_button=action("",review_dispatch,true);review_button.tooltip_text="Revisar envio"
	var send_center:=CenterContainer.new();send_center.mouse_filter=Control.MOUSE_FILTER_IGNORE;review_button.add_child(send_center);send_center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var send_content:=HBoxContainer.new();send_content.mouse_filter=Control.MOUSE_FILTER_IGNORE;send_content.add_theme_constant_override("separation",12);send_center.add_child(send_content)
	var send_icon:=TextureRect.new();send_icon.mouse_filter=Control.MOUSE_FILTER_IGNORE;send_icon.texture=icon_texture("send","#ffffff");send_content.add_child(send_icon)
	var send_label:=label("Revisar envio",17);send_label.add_theme_color_override("font_color",Color.WHITE);send_content.add_child(send_label)
	review_button.add_theme_stylebox_override("normal",host._style_box(Color("#ff8000"),Color("#ff8000"),1,10))
	review_button.add_theme_color_override("font_color",Color.WHITE);right.add_child(review_button)
	var hint:=label("Confira os itens e o destino antes de confirmar.",14);hint.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;right.add_child(hint)
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
	var result: Dictionary=await service.call_service("list",{"kind":kind,"query":search.text,"page":page_index,"state":["available","sent","used","all"][filter.selected]})
	if not is_inside_tree():return
	loading=false
	if not result.get("ok",false):status.text=str(result.get("error","Falha ao carregar"));return
	table.clear();var root_item:=table.create_item()
	for i in range(5):table.set_column_title(i,["","Número" if kind!="movements" else "Número / tipo","Recebido em" if kind!="movements" else "Data do registro","Situação" if kind!="movements" else "Destino","Ações"][i])
	for row in result.get("rows",[]):
		var item:=table.create_item(root_item);item.set_metadata(0,row)
		var key:=str(row.kind)+":"+str(row.number)
		item.set_cell_mode(0,TreeItem.CELL_MODE_CHECK);item.set_editable(0,row.state=="available" and not sending)
		item.set_checked(0,selected.has(key));item.set_selectable(0,false)
		item.add_button(4,icon_texture("remove","#d54646"),1,row.state!="available","Remover da lista" if row.state=="available" else "Somente itens disponíveis podem ser removidos")
		item.set_text(1,str(row.number)+( (" • Chip" if row.kind=="chip" else " • Aparelho") if kind=="movements" else ""))
		item.set_text(2,date_text((int(row.get("detected_at",0)) if row.state=="used" else (int(row.removed_at) if row.state=="removed" else int(row.sent_at))) if kind=="movements" else int(row.received_at)))
		item.set_text(3,("Utilizado • "+str(row.used_branch)) if row.state=="used" else (str(row.destination) if kind=="movements" else ("Disponível" if row.state=="available" else "Enviado")))
		if row.state=="removed":item.set_text(3,"Removido da lista")
		if row.state!="available":selected.erase(key)
		if kind!="movements":
			item.set_cell_mode(3,TreeItem.CELL_MODE_CUSTOM);item.set_text(3,"")
		else:item.set_custom_color(3,Color("#236fa8"))
		item.set_tooltip_text(3,"Destino: %s\n%s" % [row.get("destination",""),row.get("note","")] if row.state=="sent" else "Disponível para envio")
		if row.state=="removed":item.set_tooltip_text(3,"Removido manualmente do Armazém. Cadastro e histórico preservados.")
		if row.state=="used":
			item.set_tooltip_text(3,"Utilizado no aparelho: %s\nBase: %s\nCadastro atualizado: %s\nDetectado: %s\nEnvio anterior: %s" % [row.device_serial,row.used_branch,row.registered_at,date_text(int(row.detected_at)),str(row.get("destination", "—"))])
	total=int(result.get("total",0));page_index=int(result.get("page",0))
	equipment_count.text=str(result.get("counts",{}).get("equipment",0));chip_count.text=str(result.get("counts",{}).get("chip",0));sent_count.text=str(result.get("counts",{}).get("sent_today",0))
	devices.text="Aparelhos  %s" % equipment_count.text;chips.text="Chips  %s" % chip_count.text
	devices.disabled=kind=="equipment";chips.disabled=kind=="chip";movements.disabled=kind=="movements"
	style_tab(devices,kind=="equipment");style_tab(chips,kind=="chip");style_tab(movements,kind=="movements")
	tab_count(devices,"Aparelhos",equipment_count.text,kind=="equipment");tab_count(chips,"Chips",chip_count.text,kind=="chip")
	search.placeholder_text="Buscar ICCID do chip…" if kind=="chip" else "Buscar número de série…"
	filter.disabled=kind=="movements";select_all.disabled=kind=="movements" or sending
	pages.text="Mostrando %d–%d de %d" % [page_index*12+1 if total>0 else 0,mini(total,(page_index+1)*12),total]
	update_pages()
	update_selection()

func receive() -> void:
	if syncing:return
	if sending:
		retry.start(5);return
	syncing=true;retry.stop()
	if Time.get_ticks_msec()-last_usage_check>=15000:
		last_usage_check=Time.get_ticks_msec()
		var usage: Dictionary=await service.call_service("reconcile_usage")
		if not is_inside_tree():return
		if usage.get("ok",false):
			usage_status.text="Chips conferidos • %d utilizado(s) nesta verificação" % usage.get("used",0)
			if usage.get("checked",0)==0:usage_status.text="Nenhum chip pendente de verificação de uso."
			if usage.get("ambiguous",0)>0:usage_status.text+=" • %d vínculo(s) ambíguo(s), sem baixa" % usage.ambiguous
			for number in usage.get("used_numbers",[]):selected.erase("chip:"+str(number))
			await refresh()
		else:usage_status.text=str(usage.get("error","Verificação de uso pendente; nova tentativa automática."))
	await refresh()
	syncing=false
	retry.start(15)

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
	base_mode.disabled=value=="base";custom_mode.disabled=value=="custom"
	for button in [base_mode,custom_mode]:
		button.size_flags_horizontal=Control.SIZE_EXPAND_FILL
		button.add_theme_stylebox_override("disabled",host._style_box(Color("#0878ed"),Color("#0878ed"),1,7))
		button.add_theme_color_override("font_disabled_color",Color.WHITE)
	update_selection()

func destination_text() -> String:
	return base.get_item_text(base.selected) if destination_mode=="base" else custom.text.strip_edges()

func update_selection() -> void:
	selected_label.text="  %d item(ns) selecionado(s)" % selected.size()
	shipment_count.text="%d item(ns) selecionado(s)" % selected.size()
	var equipment_selected:=0;var chip_selected:=0
	for row in selected.values():
		if row.kind=="equipment":equipment_selected+=1
		else:chip_selected+=1
	selection_summary.text=("%d aparelhos" % equipment_selected) if chip_selected==0 else (("%d chips" % chip_selected) if equipment_selected==0 else "%d aparelhos · %d chips" % [equipment_selected,chip_selected])
	shipment_count.text=selection_summary.text
	destination_summary.text=destination_text() if not destination_text().is_empty() else "Informe o destino"
	review_button.disabled=selected.is_empty() or selected.size()>250 or destination_text().is_empty() or sending
	var all_checked:=false
	if table.get_root()!=null:
		var eligible:=0;var checked:=0
		for item in table.get_root().get_children():
			for column in range(5):item.set_custom_bg_color(column,Color("#edf6ff") if item.is_checked(0) else Color.WHITE)
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
func review_removal(row: Dictionary) -> void:
	if sending or row.state!="available" or has_node("RemoveWarehouseDialog"):return
	var dialog:=AcceptDialog.new();dialog.name="RemoveWarehouseDialog";dialog.theme=theme;dialog.borderless=true;dialog.transparent_bg=true;dialog.unresizable=true
	dialog.add_theme_stylebox_override("panel",host._style_box(Color.WHITE,Color("#cbdff0"),1,16));dialog.get_ok_button().hide()
	var margin:=MarginContainer.new();dialog.add_child(margin)
	for edge in ["left","right","top","bottom"]:margin.add_theme_constant_override("margin_"+edge,24)
	var box:=VBoxContainer.new();box.add_theme_constant_override("separation",18);margin.add_child(box)
	box.add_child(label("Remover da lista?",24))
	box.add_child(label(("Aparelho: " if row.kind=="equipment" else "Chip: ")+str(row.number),18))
	var explanation:=label("O item sairá dos disponíveis. A remoção ficará registrada em Movimentações.",15);explanation.custom_minimum_size.x=490;explanation.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;box.add_child(explanation)
	var buttons:=HBoxContainer.new();buttons.alignment=BoxContainer.ALIGNMENT_END;buttons.add_theme_constant_override("separation",12);box.add_child(buttons)
	buttons.add_child(action("Cancelar",dialog.queue_free))
	var confirm:=action("Remover da lista",func():dialog.queue_free();submit_removal(row),true);confirm.name="ConfirmRemoval"
	confirm.add_theme_stylebox_override("normal",host._style_box(Color("#c63f43"),Color("#c63f43"),1,10));buttons.add_child(confirm)
	dialog.close_requested.connect(dialog.queue_free);dialog.canceled.connect(dialog.queue_free)
	var shade:=ColorRect.new();shade.color=Color(0.03,0.09,0.15,0.35);get_tree().root.add_child(shade);shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);dialog.tree_exiting.connect(shade.queue_free)
	add_child(dialog);dialog.popup_centered(Vector2i(550,260))

func submit_removal(row: Dictionary) -> void:
	if sending:return
	sending=true;update_selection()
	var result:Dictionary=await service.call_service("remove",{"kind":row.kind,"number":row.number})
	if not is_inside_tree():return
	sending=false
	if result.get("ok",false):
		selected.erase(str(row.kind)+":"+str(row.number));status.text="Item removido da lista. Histórico preservado em Movimentações."
	else:status.text=str(result.get("error","Não foi possível remover o item."))
	await refresh()

func manual_dialog() -> void:
	if has_node("ManualWarehouseDialog"):return
	var dialog:=AcceptDialog.new();dialog.title="Novo item • Armazém";dialog.theme=theme
	dialog.name="ManualWarehouseDialog";dialog.min_size=Vector2i(640,430)
	dialog.borderless=true;dialog.unresizable=true;dialog.transparent_bg=true
	dialog.add_theme_stylebox_override("panel",host._style_box(Color.WHITE,Color("#cbdff0"),1,16))
	dialog.get_ok_button().hide()
	var margin:=MarginContainer.new();dialog.add_child(margin)
	for edge in ["left","right","top","bottom"]:margin.add_theme_constant_override("margin_"+edge,22)
	var box:=VBoxContainer.new();box.add_theme_constant_override("separation",14);margin.add_child(box)
	var header:=PanelContainer.new();header.add_theme_stylebox_override("panel",host._style_box(Color("#174c7a"),Color.TRANSPARENT,0,10));box.add_child(header)
	var header_margin:=MarginContainer.new();header.add_child(header_margin)
	for edge in ["left","right","top","bottom"]:header_margin.add_theme_constant_override("margin_"+edge,16)
	var heading:=HBoxContainer.new();header_margin.add_child(heading)
	var titles:=VBoxContainer.new();titles.size_flags_horizontal=Control.SIZE_EXPAND_FILL;heading.add_child(titles)
	var title:=label("Novo item no Armazém",24);title.add_theme_color_override("font_color",Color.WHITE);titles.add_child(title)
	var subtitle:=label("Cadastro manual de aparelhos e chips",14);subtitle.add_theme_color_override("font_color",Color("#d5e9ff"));titles.add_child(subtitle)
	var close:=action("×",dialog.queue_free);close.custom_minimum_size=Vector2(36,36);close.tooltip_text="Fechar cadastro";heading.add_child(close)
	box.add_child(label("Tipo de item",15))
	var type:=OptionButton.new();type.name="ItemType";type.add_item("Aparelho");type.add_item("Chip")
	type.select(1 if kind=="chip" else 0);style_input(type);box.add_child(type)
	var number_label:=label("",15);box.add_child(number_label)
	var number:=LineEdit.new();number.name="ItemNumber";number.max_length=20;style_input(number);box.add_child(number)
	var hint:=label("",14);hint.add_theme_color_override("font_color",Color("#607895"));hint.custom_minimum_size.x=580;hint.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;box.add_child(hint)
	var update_hint:=func():
		number_label.text="Número de série" if type.selected==0 else "Número do chip (ICCID)"
		number.placeholder_text="Digite os 9 dígitos da série" if type.selected==0 else "Digite os 19 ou 20 dígitos do ICCID"
		hint.text="Ex.: 024000123 • mantenha o zero inicial." if type.selected==0 else "O ICCID começa com 89. Informe somente os números."
	update_hint.call();type.item_selected.connect(func(_index):update_hint.call())
	var feedback:=label("",14);feedback.custom_minimum_size=Vector2(580,22);feedback.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;feedback.add_theme_color_override("font_color",Color("#a64312"));box.add_child(feedback)
	var validation:=label("",15);validation.name="AryaValidation";validation.custom_minimum_size.x=580;validation.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;box.add_child(validation)
	var details_grid:=GridContainer.new();details_grid.name="AryaMiniCards";details_grid.columns=2;details_grid.add_theme_constant_override("h_separation",10);details_grid.add_theme_constant_override("v_separation",8);details_grid.hide();box.add_child(details_grid)
	var consult:=action("Consultar na Arya",func():pass);consult.name="ConsultArya";box.add_child(consult)
	var check_timer:=Timer.new();check_timer.one_shot=true;check_timer.wait_time=0.7;dialog.add_child(check_timer)
	var verification:={"revision":0,"running":false,"iccid":"","result":{},"checked_at":0}
	box.add_child(HSeparator.new())
	var buttons:=HBoxContainer.new();buttons.alignment=BoxContainer.ALIGNMENT_END;buttons.add_theme_constant_override("separation",10);box.add_child(buttons)
	var cancel:=action("Cancelar",dialog.queue_free);buttons.add_child(cancel)
	var save:=action("Salvar no Armazém",func():pass,true);save.name="SaveManualItem";buttons.add_child(save)
	var sync_validation:=func():
		var is_chip:=type.selected==1
		validation.visible=is_chip;consult.visible=is_chip
		details_grid.visible=is_chip and verification.result.get("state","")=="found"
		save.disabled=is_chip and (verification.iccid!=number.text.strip_edges() or verification.result.get("state","")!="found")
	var changed:=func():
		verification.revision+=1;verification.iccid="";verification.result={};verification.checked_at=0;check_timer.stop()
		validation.text="Informe o ICCID completo para validar na Arya."
		validation.add_theme_color_override("font_color",Color("#607895"));sync_validation.call()
		if type.selected==1 and preload("res://src/services/warehouse_chip_lookup.gd").new().valid_iccid(number.text.strip_edges()):check_timer.start()
	var query:=func():
		if verification.running or type.selected!=1:return
		var iccid:=number.text.strip_edges()
		var lookup:=preload("res://src/services/warehouse_chip_lookup.gd").new()
		if not lookup.valid_iccid(iccid):validation.text="Informe 19 ou 20 dígitos, começando por 89.";return
		var revision:int=verification.revision;verification.running=true;consult.disabled=true
		verification.result={};verification.iccid="";feedback.text="";sync_validation.call();validation.text="Consultando ICCID na Arya…"
		var result:Dictionary=await lookup.lookup(host,iccid)
		if not is_instance_valid(dialog):return
		verification.running=false;consult.disabled=false
		if revision!=verification.revision or type.selected!=1:
			if type.selected==1:check_timer.start(0.2)
			return
		verification.result=result;verification.iccid=iccid;verification.checked_at=int(Time.get_unix_time_from_system())
		if result.get("state","")=="found":
			validation.add_theme_color_override("font_color",Color("#168354"))
			validation.text="ICCID confirmado na Arya"
			for child in details_grid.get_children():details_grid.remove_child(child);child.queue_free()
			var fields:Array=[["TELEFONE",result.phone],["OPERADORA",result.operator],["APN",result.apn],["CONEXÃO",result.connection]]
			if str(result.last_connection)!="":fields.append(["ÚLTIMA CONEXÃO",result.last_connection])
			for field in fields:
				var cell:=panel(details_grid,10);cell.add_theme_constant_override("separation",4)
				cell.get_parent().get_parent().custom_minimum_size.x=280
				var tones:Dictionary={"TELEFONE":["#eaf3ff","#b8d7fb","#1762a8"],"OPERADORA":["#f2edff","#d6c8f5","#7052ad"],"APN":["#fff2e5","#f7d5ae","#a85d13"],"CONEXÃO":["#e7f7ee","#b7e4cb","#168354"] if str(field[1])=="Online" else ["#fff5dc","#eed596","#946414"],"ÚLTIMA CONEXÃO":["#e8f6f8","#b5dfe5","#217480"]}
				var palette:Array=tones[str(field[0])]
				cell.get_parent().get_parent().add_theme_stylebox_override("panel",host._style_box(Color(palette[0]),Color(palette[1]),1,14))
				var field_title:=label(str(field[0]),12);field_title.add_theme_color_override("font_color",Color(palette[2]));cell.add_child(field_title)
				var value:=label(str(field[1]) if str(field[1])!="" else "Não informado",16);value.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;value.custom_minimum_size.x=250;value.add_theme_color_override("font_color",Color(palette[2]));cell.add_child(value)
				if field[0]=="CONEXÃO":value.add_theme_color_override("font_color",Color("#168354") if str(field[1])=="Online" else Color("#a46322"))
		else:
			validation.add_theme_color_override("font_color",Color("#a64312"));validation.text=str(result.get("message","Validação pendente."))+" O cadastro permanece bloqueado."
		sync_validation.call();dialog.reset_size();dialog.popup_centered(Vector2i(640,480))
	check_timer.timeout.connect(query);consult.pressed.connect(query)
	number.text_changed.connect(func(_text):changed.call());type.item_selected.connect(func(_index):changed.call())
	changed.call()
	save.pressed.connect(func():
		if type.selected==1 and (verification.iccid!=number.text.strip_edges() or verification.result.get("state","")!="found" or Time.get_unix_time_from_system()-verification.checked_at>300):
			feedback.text="Confirme este ICCID na Arya antes de salvar.";changed.call();return
		check_timer.stop();consult.disabled=true
		dialog.dialog_close_on_escape=false;save.disabled=true;cancel.disabled=true;close.disabled=true;type.disabled=true;number.editable=false;feedback.text="Salvando…"
		var result:Dictionary=await service.call_service("register",{"kind":"equipment" if type.selected==0 else "chip","number":number.text.strip_edges(),"arya_confirmation":{"iccid":verification.iccid,"checked_at":verification.checked_at} if type.selected==1 else {}})
		if not is_instance_valid(dialog):return
		if result.get("ok",false):
			kind=str(result.kind);page_index=0;search.clear();filter.select(0)
			status.text="%s cadastrado no Armazém: %s" % ["Aparelho" if kind=="equipment" else "Chip",result.number]
			dialog.queue_free();await refresh();last_usage_check=-15000;await receive()
		else:
			feedback.text=str(result.get("error","Não foi possível salvar. Tente novamente."))
			dialog.dialog_close_on_escape=true;save.disabled=false;cancel.disabled=false;close.disabled=false;type.disabled=false;number.editable=true;consult.disabled=false;sync_validation.call()
	)
	dialog.close_requested.connect(func():
		if not save.disabled:dialog.queue_free()
	)
	dialog.canceled.connect(dialog.queue_free)
	var shade:=ColorRect.new();shade.name="WarehouseModalShade";shade.color=Color(0.03,0.09,0.15,0.35);shade.mouse_filter=Control.MOUSE_FILTER_STOP
	get_tree().root.add_child(shade);shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dialog.tree_exiting.connect(shade.queue_free)
	add_child(dialog);dialog.popup_centered(Vector2i(640,480));number.grab_focus()
