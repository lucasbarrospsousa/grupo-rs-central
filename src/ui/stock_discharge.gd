extends AcceptDialog
var host: Node
var service: Node
var table: Tree
var summary: Label
var selection: Label
var apply_button: Button
var refresh_button: Button
var close_button: Button
var page_label: Label
var search:LineEdit
var result_filter:OptionButton
var filtered:Array[int]=[]
var badge_overlay:Control
var metrics:Array[Label]=[]
const BOLD=preload("res://assets/fonts/Noto_Sans/static/NotoSans-Bold.ttf")
var shade:ColorRect
var page:=0
const PAGE_SIZE:=5

func text(value:String,size_value:int=16) -> Label:
	var node:=Label.new();node.text=value;node.add_theme_font_override("font",BOLD);node.add_theme_font_size_override("font_size",size_value);node.add_theme_color_override("font_color",Color("#173a59"));return node

func button(value:String,callback:Callable,primary:bool=false) -> Button:
	var result:Button=host._make_action_button(value,Color("#137ad2") if primary else Color.WHITE,Color("#cbdff0"),Color.WHITE if primary else Color("#173a59"),Vector2(100,42),callback)
	for state in ["normal","hover","pressed"]:
		var style:=result.get_theme_stylebox(state).duplicate();style.content_margin_left=14;style.content_margin_right=14;result.add_theme_stylebox_override(state,style)
	return result

func _ready() -> void:
	min_size=Vector2i(1240,640);name="StockDischargeDialog";title="Analisar baixa";theme=host.theme;borderless=true;exclusive=true;unresizable=true;transparent_bg=true
	add_theme_stylebox_override("panel",host._style_box(Color("#f4f8fc"),Color("#cbdff0"),1,18));get_ok_button().hide()
	var margin:=MarginContainer.new();add_child(margin)
	for edge in ["left","right","top","bottom"]:margin.add_theme_constant_override("margin_"+edge,20)
	var stack:=VBoxContainer.new();stack.add_theme_constant_override("separation",14);margin.add_child(stack)
	var header:=PanelContainer.new();header.add_theme_stylebox_override("panel",host._style_box(Color.WHITE,Color.TRANSPARENT,0,14))
	var shader:=Shader.new();shader.code="shader_type canvas_item; void fragment(){ vec4 base=COLOR; COLOR=vec4(mix(vec3(0.075,0.22,0.36),vec3(0.25,0.51,0.70),UV.x),base.a); }"
	var material:=ShaderMaterial.new();material.shader=shader;header.material=material;stack.add_child(header)
	var header_margin:=MarginContainer.new();header.add_child(header_margin)
	for edge in ["left","right","top","bottom"]:header_margin.add_theme_constant_override("margin_"+edge,16)
	var heading:=HBoxContainer.new();header_margin.add_child(heading)
	var titles:=VBoxContainer.new();titles.size_flags_horizontal=Control.SIZE_EXPAND_FILL;heading.add_child(titles)
	var title_label:=text("Analisar baixa • "+host.selected_branch_name,25);title_label.add_theme_color_override("font_color",Color.WHITE);titles.add_child(title_label)
	var subtitle:=text("Conferência da API • atualização somente do estoque da Central",14);subtitle.add_theme_color_override("font_color",Color("#d6eaff"));titles.add_child(subtitle)
	close_button=button("×",close);close_button.custom_minimum_size=Vector2(36,36);heading.add_child(close_button)
	var metric_row:=HBoxContainer.new();metric_row.add_theme_constant_override("separation",12);stack.add_child(metric_row)
	for metric in [["EM ESTOQUE","#246ba5"],["APTOS PARA BAIXA","#19965c"],["PARA REVISÃO","#ce253b"]]:
		var surface:=PanelContainer.new();surface.size_flags_horizontal=Control.SIZE_EXPAND_FILL;surface.add_theme_stylebox_override("panel",host._style_box(Color(metric[1]),Color.TRANSPARENT,0,18));metric_row.add_child(surface)
		var spacing:=MarginContainer.new();surface.add_child(spacing)
		for edge in ["left","right","top","bottom"]:spacing.add_theme_constant_override("margin_"+edge,12)
		var metric_label:=text(str(metric[0])+"  ·  —",16);metric_label.add_theme_color_override("font_color",Color.WHITE);spacing.add_child(metric_label);metrics.append(metric_label)
	summary=text("Preparando análise…");summary.custom_minimum_size.x=1190;summary.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;stack.add_child(summary)
	var filters_panel:=PanelContainer.new();filters_panel.add_theme_stylebox_override("panel",host._style_box(Color.WHITE,Color("#cbdff0"),1,16));stack.add_child(filters_panel)
	var filter_margin:=MarginContainer.new();filters_panel.add_child(filter_margin)
	for edge in ["left","right","top","bottom"]:filter_margin.add_theme_constant_override("margin_"+edge,16)
	var filters:=HBoxContainer.new();filters.add_theme_constant_override("separation",12);filter_margin.add_child(filters)
	search=LineEdit.new();search.placeholder_text="Buscar série, placa ou cliente";search.size_flags_horizontal=Control.SIZE_EXPAND_FILL;search.custom_minimum_size.y=44;host._style_line_edit(search);filters.add_child(search)
	result_filter=OptionButton.new();result_filter.add_item("Todos os resultados");result_filter.add_item("Aptos para baixa");result_filter.add_item("Revisão / pendências");filters.add_child(result_filter)
	var controls:=preload("res://src/ui/scanner_inventory.gd").new();controls.host=host;controls.style_input(result_filter)
	controls.free()
	filters.add_child(button("Buscar",func():page=0;render(),true))
	search.text_changed.connect(func(_value):page=0;render());result_filter.item_selected.connect(func(_index):page=0;render())
	var actions:=HBoxContainer.new();stack.add_child(actions)
	actions.add_child(button("Selecionar aptos",func():select_all(true)))
	actions.add_child(button("Limpar seleção",func():select_all(false)))
	refresh_button=button("Analisar novamente",analyze);actions.add_child(refresh_button)
	table=Tree.new();table.columns=5;table.hide_root=true;table.column_titles_visible=true;table.custom_minimum_size=Vector2(1190,290);table.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	table.add_theme_stylebox_override("panel",host._style_box(Color.WHITE,Color("#d3e2ef"),1,10))
	table.add_theme_color_override("font_disabled_color",Color("#607895"));table.add_theme_color_override("font_color",Color("#173a59"));table.add_theme_color_override("font_selected_color",Color("#173a59"))
	for state in ["selected","selected_focus"]:table.add_theme_stylebox_override(state,host._style_box(Color("#e4f1ff"),Color.TRANSPARENT,0,4))
	for state in ["title_button_normal","title_button_hover","title_button_pressed"]:table.add_theme_stylebox_override(state,host._style_box(Color("#174a72"),Color.TRANSPARENT,0,4))
	table.add_theme_color_override("title_button_color",Color.WHITE);table.add_theme_constant_override("v_separation",12)
	table.add_theme_font_override("font",preload("res://assets/fonts/Noto_Sans/static/NotoSans-Regular.ttf"))
	table.add_theme_font_size_override("font_size",15)
	for i in range(5):table.set_column_title(i,["Selecionar / Série","Placa","Cliente","Resultado","Base"][i])
	table.set_column_expand_ratio(2,3);table.set_column_expand_ratio(3,3);stack.add_child(table);table.item_edited.connect(edited)
	badge_overlay=Control.new();badge_overlay.mouse_filter=Control.MOUSE_FILTER_IGNORE;badge_overlay.clip_contents=true;table.add_child(badge_overlay);badge_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	badge_overlay.draw.connect(draw_badges);table.draw.connect(badge_overlay.queue_redraw)
	var footer:=HBoxContainer.new();stack.add_child(footer)
	selection=text("");selection.size_flags_horizontal=Control.SIZE_EXPAND_FILL;footer.add_child(selection)
	footer.add_child(button("‹",func():page=maxi(0,page-1);render()))
	page_label=text("");footer.add_child(page_label)
	footer.add_child(button("›",func():page=mini(maxi(0,ceili(filtered.size()/float(PAGE_SIZE))-1),page+1);render()))
	apply_button=button("Aplicar baixa",review,true);footer.add_child(apply_button)
	stack.add_child(text("Somente itens selecionados serão alterados. O vínculo será conferido novamente antes de aplicar.",13))
	if service==null:service=preload("res://src/services/stock_discharge.gd").new();service.host=host;add_child(service)
	service.progress.connect(func(done,total):summary.text="Consultados %d de %d aparelhos • %s" % [done,total,host.selected_branch_name];render())
	close_requested.connect(close);canceled.connect(close)
	shade=ColorRect.new();shade.color=Color(0.03,0.09,0.15,0.25);get_tree().root.add_child(shade);shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);tree_exiting.connect(shade.queue_free)
	call_deferred("open_centered")

func open_centered() -> void:
	reset_size();popup_centered(Vector2i(1240,680));analyze()

func close() -> void:
	if service.busy:
		service.cancelled=true
		return
	queue_free()

func analyze() -> void:
	if service.busy:return
	page=0;apply_button.disabled=true;refresh_button.disabled=true
	await service.analyze()
	if service.cancelled:queue_free();return
	refresh_button.disabled=false;render()
	await get_tree().process_frame
	reset_size();popup_centered(Vector2i(1240,710))
	summary.text="%d aparelhos analisados • %d aptos • %d para revisão" % [service.rows.size(),eligible_count(),service.rows.size()-eligible_count()]
	if not service.context_ok():summary.text="A base mudou. Feche esta janela e analise novamente."

func eligible_count() -> int:
	var count:=0
	for row in service.rows:
		if row.ok:count+=1
	return count

func render() -> void:
	filtered.clear()
	for index in range(service.rows.size()):
		var row:Dictionary=service.rows[index]
		if result_filter.selected==1 and not row.ok:continue
		if result_filter.selected==2 and row.ok:continue
		if search.text.strip_edges()!="" and not (str(row.serial)+" "+str(row.plate)+" "+str(row.client)).to_lower().contains(search.text.strip_edges().to_lower()):continue
		filtered.append(index)
	page=mini(page,maxi(0,ceili(filtered.size()/float(PAGE_SIZE))-1))
	table.clear();var root:=table.create_item()
	for position in range(page*PAGE_SIZE,mini((page+1)*PAGE_SIZE,filtered.size())):
		var index:int=filtered[position]
		var row:Dictionary=service.rows[index];var item:=table.create_item(root)
		item.set_cell_mode(0,TreeItem.CELL_MODE_CHECK);item.set_checked(0,row.selected);item.set_editable(0,row.ok and not service.busy);item.set_metadata(0,index)
		for column in range(5):
			var content:=str([row.serial,row.plate,row.client,row.message,host.selected_branch_name][column]);item.set_text(column,content);item.set_tooltip_text(column,content)
		item.set_cell_mode(3,TreeItem.CELL_MODE_CUSTOM);item.set_text(3,"");item.set_tooltip_text(3,row.message)
	var selected:=0
	for row in service.rows:
		if row.selected and row.ok:selected+=1
	selection.text="%d selecionado(s)" % selected;apply_button.disabled=selected==0 or service.busy or not service.context_ok()
	metrics[0].text="EM ESTOQUE  ·  %d" % service.rows.size()
	metrics[1].text="APTOS PARA BAIXA  ·  %d" % eligible_count()
	metrics[2].text="PARA REVISÃO  ·  %d" % service.rows.filter(func(row):return not row.ok and not str(row.message).begins_with("Baixa aplicada")).size()
	badge_overlay.queue_redraw()
	page_label.text="%d / %d" % [page+1,maxi(1,ceili(filtered.size()/float(PAGE_SIZE)))]

func edited() -> void:
	var item:=table.get_edited()
	if item==null or service.busy:return
	var index:=int(item.get_metadata(0));service.rows[index].selected=item.is_checked(0) and service.rows[index].ok;render()

func select_all(value:bool) -> void:
	if service.busy:return
	for index in filtered:service.rows[index].selected=value and service.rows[index].ok
	render()

func review() -> void:
	if apply_button.disabled:return
	var confirm:=ConfirmationDialog.new();confirm.exclusive=true;confirm.theme=theme;confirm.add_theme_stylebox_override("panel",host._style_box(Color.WHITE,Color("#cbdff0"),1,14));confirm.get_label().add_theme_color_override("font_color",Color("#173a59"));confirm.title="Aplicar baixa local";confirm.dialog_text="Atualizar os %s para Instalado no estoque da Central?\nA plataforma da base não será alterada." % selection.text.to_lower();add_child(confirm)
	confirm.confirmed.connect(func():confirm.queue_free();apply_rows());confirm.canceled.connect(confirm.queue_free);confirm.popup_centered(Vector2i(550,180))

func apply_rows() -> void:
	dialog_close_on_escape=false
	apply_button.disabled=true;refresh_button.disabled=true;close_button.disabled=true
	summary.text="Conferindo vínculos e aplicando as baixas selecionadas…"
	var result:Dictionary=await service.apply_selected()
	dialog_close_on_escape=true
	close_button.disabled=false;refresh_button.disabled=false;render()
	summary.text=str(result.message) if result.has("message") else "%d baixa(s) aplicada(s) • %d pendente(s)." % [result.get("done",0),result.get("failed",0)]
	if service.context_ok():host._refresh_table()

func draw_badges() -> void:
	if table.get_root()==null:return
	for item in table.get_root().get_children():
		var rect:=table.get_item_area_rect(item,3)
		if rect.position.y<25 or rect.end.y>table.size.y:continue
		var row:Dictionary=service.rows[int(item.get_metadata(0))]
		var done:=str(row.message).begins_with("Baixa aplicada")
		var caption:="Apto para baixa" if row.ok else ("Baixa aplicada" if done else "Revisão necessária")
		var tint:=Color("#19965c") if row.ok or done else Color("#ce253b")
		if str(row.message)=="Aguardando consulta":caption="Aguardando consulta";tint=Color("#246ba5")
		var width:=minf(rect.size.x-16,BOLD.get_string_size(caption,HORIZONTAL_ALIGNMENT_LEFT,-1,14).x+26)
		var badge:=Rect2(rect.position+Vector2(8,(rect.size.y-30)/2),Vector2(width,30))
		var style:=StyleBoxFlat.new();style.bg_color=tint;style.set_corner_radius_all(13);style.draw(badge_overlay.get_canvas_item(),badge)
		BOLD.draw_string(badge_overlay.get_canvas_item(),badge.position+Vector2(13,20),caption,HORIZONTAL_ALIGNMENT_LEFT,width-20,14,Color.WHITE)
