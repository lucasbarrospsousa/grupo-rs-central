extends "res://src/ui/tracking_records.gd"
## Reuse exact lookup and request-generation guards; no stock/SMS mutations.
const Route=preload("res://src/services/tracking_route.gd")
const RouteMap=preload("res://src/ui/route_map.gd")
var slider:HSlider
var play_button:Button
var playback:Timer
var speed:OptionButton
var timeline:VBoxContainer
var point_caption:Label
var distance_caption:Label
var attribution:LinkButton
var playback_buttons:Array[Button]=[]
var timeline_page:=0
var timeline_scroll:ScrollContainer

func setup(controller:Node)->void:
	host=controller;branch=str(host.selected_branch_id);name="TrackingRoute"
	theme=Theme.new();theme.default_font=preload("res://assets/fonts/Noto_Sans/static/NotoSans-Regular.ttf");theme.default_font_size=14
	size_flags_vertical=SIZE_EXPAND_FILL;add_theme_constant_override("separation",10)
	service=Route.new();service.decode_body=host._decode_http_body_bytes;add_child(service)
	var vault:Node=host._secret_vault()
	if vault:
		var config:Dictionary=vault.merge_secrets("app",{},host.SecretVaultScript.APP_SECRET_KEYS)
		service.credentials={"username":config.get("grupo_rs_modern_user",""),"password":config.get("grupo_rs_modern_password","")}
	add_child(label("GRUPO RS CENTRAL  /  "+str(host.selected_branch_name).to_upper(),12,"#65819e"))
	var heading:=HBoxContainer.new();add_child(heading)
	var title:=label("Trajeto",32);title.size_flags_horizontal=SIZE_EXPAND_FILL;heading.add_child(title)
	export_button=button("Exportar KML",choose_kml);export_button.icon=preload("res://assets/icons/route/export.svg");heading.add_child(export_button)
	add_child(label("Explore o percurso e acompanhe cada ponto da viagem.",15,"#65819e"))
	var filter_card:=card();add_child(filter_card);var filters:=VBoxContainer.new();filter_card.add_child(filters)
	var fields:=HBoxContainer.new();fields.add_theme_constant_override("separation",12);filters.add_child(fields)
	search=field(fields,"Cliente, placa ou aparelho","Nome, placa ou série",1.8)
	start_input=field(fields,"Data e horário inicial","dd/mm/aaaa hh:mm",1.1)
	end_input=field(fields,"Data e horário final","dd/mm/aaaa hh:mm",1.1)
	search_button=button("Buscar trajeto",run_search,true);search_button.size_flags_vertical=SIZE_SHRINK_END;fields.add_child(search_button)
	search.text_submitted.connect(func(_value):run_search())
	var shortcuts:=HBoxContainer.new();filters.add_child(shortcuts)
	shortcuts.add_child(button("Hoje",func():set_day(0)));shortcuts.add_child(button("Ontem",func():set_day(-1)))
	clear_button=button("Limpar",clear_search);shortcuts.add_child(clear_button)
	selected=label("Somente leitura • selecione um veículo • até 7 dias",12,"#65819e");selected.size_flags_horizontal=SIZE_EXPAND_FILL;selected.horizontal_alignment=HORIZONTAL_ALIGNMENT_RIGHT;selected.clip_text=true;shortcuts.add_child(selected)
	picker=VBoxContainer.new();filters.add_child(picker);picker.hide()
	var metrics:=HBoxContainer.new();metrics.add_theme_constant_override("separation",14);add_child(metrics)
	for i in range(4):
		var panel:=card();panel.size_flags_horizontal=SIZE_EXPAND_FILL;metrics.add_child(panel);Motion.attach(panel)
		var line:=HBoxContainer.new();line.add_theme_constant_override("separation",15);panel.add_child(line)
		var icon:=TextureRect.new();icon.texture=load("res://assets/icons/records/"+["route","history","speed","memory"][i]+".svg");icon.custom_minimum_size=Vector2(34,34);icon.expand_mode=TextureRect.EXPAND_IGNORE_SIZE;icon.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED;line.add_child(icon)
		var stack:=VBoxContainer.new();stack.size_flags_horizontal=SIZE_EXPAND_FILL;line.add_child(stack)
		var value:=label("—",24);stack.add_child(value);counts.append(value)
		var caption:=label(["Distância estimada • GPS","Pontos no período","Velocidade máxima registrada","Primeiro e último ponto"][i],12,"#65819e");stack.add_child(caption)
		if i==0:distance_caption=caption
	var body:=HBoxContainer.new();body.add_theme_constant_override("separation",12);body.size_flags_vertical=SIZE_EXPAND_FILL;add_child(body)
	var map_card:=card();map_card.size_flags_horizontal=SIZE_EXPAND_FILL;map_card.size_flags_stretch_ratio=2.65;body.add_child(map_card)
	var map_box:=VBoxContainer.new();map_box.add_theme_constant_override("separation",8);map_card.add_child(map_box)
	var toolbar:=HBoxContainer.new();map_box.add_child(toolbar)
	toolbar.add_child(button("Ruas",func():set_layer("streets")));toolbar.add_child(button("Satélite",func():set_layer("satellite")))
	var spacer:=Control.new();spacer.size_flags_horizontal=SIZE_EXPAND_FILL;toolbar.add_child(spacer)
	toolbar.add_child(button("Enquadrar",func():map.fit_route()))
	for delta in [1,-1]:
		var zoom_button:=button("+" if delta==1 else "−",func():map.change_zoom(delta));zoom_button.custom_minimum_size.x=38;toolbar.add_child(zoom_button)
	map=RouteMap.new();map_box.add_child(map);map.point_selected.connect(func(index):pause();show_record(index))
	var legend:=HBoxContainer.new();legend.add_theme_constant_override("separation",16);map_box.add_child(legend)
	for pair in [["● Ligado","#149869"],["● Desligado","#d14b5a"],["● Memória","#b37805"],["┄ Lacuna >10 min / salto","#65788d"]]:legend.add_child(label(pair[0],11,pair[1]))
	attribution=LinkButton.new();attribution.text="© OpenStreetMap contributors";attribution.add_theme_font_size_override("font_size",11);attribution.pressed.connect(func():navigate.call("https://www.openstreetmap.org/copyright" if map.layer=="streets" else "https://www.esri.com/en-us/legal/terms/data-attributions"));map_box.add_child(attribution)
	var controls:=HBoxContainer.new();controls.add_theme_constant_override("separation",8);map_box.add_child(controls)
	for spec in [["↶",func():pause();show_record(0)],["‹",func():pause();show_record(maxi(0,detail_index-1))],["▶",toggle_play],["›",func():pause();show_record(mini(result.get("rows",[]).size()-1,detail_index+1))]]:
		var control:=button(spec[0],spec[1],spec[0]=="▶");control.custom_minimum_size=Vector2(42,38);controls.add_child(control);playback_buttons.append(control)
		if spec[0]=="▶":play_button=control
	for i in range(playback_buttons.size()):
		playback_buttons[i].text="";playback_buttons[i].icon=load("res://assets/icons/route/"+["reset","previous","play","next"][i]+".svg");playback_buttons[i].tooltip_text=["Reiniciar","Ponto anterior","Reproduzir / pausar","Próximo ponto"][i]
	slider=HSlider.new();slider.min_value=0;slider.step=1;slider.size_flags_horizontal=SIZE_EXPAND_FILL;controls.add_child(slider);slider.value_changed.connect(func(value):pause();show_record(int(value)))
	point_caption=label("Ponto —",12,"#65819e");controls.add_child(point_caption)
	speed=OptionButton.new();speed.add_item("Lento");speed.add_item("Normal");speed.add_item("Rápido");speed.select(1);controls.add_child(speed)
	for state in ["normal","hover","pressed","focus"]:
		var box:StyleBox=host._style_box(Color("#f6faff"),Color("#cbdfee"),1,9);box.content_margin_left=12;box.content_margin_right=22;speed.add_theme_stylebox_override(state,box)
	for key in ["font_color","font_hover_color","font_pressed_color","font_focus_color"]:speed.add_theme_color_override(key,Color("#173b5d"))
	for key in ["font_color","font_hover_color","font_pressed_color","font_focus_color"]:attribution.add_theme_color_override(key,Color("#476982"))
	var track:=StyleBoxFlat.new();track.bg_color=Color("#e1eaf4");track.set_corner_radius_all(3);track.content_margin_top=3;track.content_margin_bottom=3;slider.add_theme_stylebox_override("slider",track)
	var fill:StyleBoxFlat=track.duplicate();fill.bg_color=Color("#087df1");slider.add_theme_stylebox_override("grabber_area",fill);slider.add_theme_stylebox_override("grabber_area_highlight",fill)
	var dot:=GradientTexture2D.new();dot.width=18;dot.height=18;dot.fill=GradientTexture2D.FILL_RADIAL;dot.fill_from=Vector2(.5,.5);dot.fill_to=Vector2(1,.5)
	dot.gradient=Gradient.new();dot.gradient.set_color(0,Color("#087df1"));dot.gradient.set_color(1,Color.TRANSPARENT)
	slider.add_theme_icon_override("grabber",dot);slider.add_theme_icon_override("grabber_highlight",dot)
	var time_card:=card();time_card.size_flags_horizontal=SIZE_EXPAND_FILL;time_card.size_flags_stretch_ratio=1;body.add_child(time_card)
	var time_box:=VBoxContainer.new();time_box.add_theme_constant_override("separation",8);time_card.add_child(time_box)
	time_box.add_child(label("Linha do tempo",20));time_box.add_child(label("Posições em ordem cronológica",12,"#65819e"))
	var scroll:=ScrollContainer.new();scroll.custom_minimum_size.y=300;scroll.size_flags_vertical=SIZE_EXPAND_FILL;scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED;time_box.add_child(scroll)
	timeline_scroll=scroll
	timeline=VBoxContainer.new();timeline.size_flags_horizontal=SIZE_EXPAND_FILL;timeline.add_theme_constant_override("separation",8);scroll.add_child(timeline)
	var pages:=HBoxContainer.new();time_box.add_child(pages)
	previous=button("Anterior",func():pause();timeline_page=maxi(0,timeline_page-1);render_timeline());pages.add_child(previous)
	next=button("Próxima",func():pause();timeline_page+=1;render_timeline());pages.add_child(next)
	notice=label("Percurso entre posições recebidas • distância GPS estimada • consulta sob demanda.",12,"#65819e");notice.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;add_child(notice)
	playback=Timer.new();playback.one_shot=true;add_child(playback);playback.timeout.connect(advance)
	set_day(0);render_history();set_busy(false);call_deferred("style_fields")

func set_layer(value:String)->void:
	map.change_layer(value)
	attribution.text="© OpenStreetMap contributors" if value=="streets" else "Tiles © Esri • Maxar • Earthstar Geographics • GIS User Community"

func run_search()->void:
	if branch!="imperatriz":notice.text="Trajeto disponível nesta versão apenas para Imperatriz.";return
	await super.run_search()
	if result.get("ok",false):route_notice()

func set_busy(value:bool)->void:
	busy=value;search_button.disabled=value;clear_button.disabled=value
	for input in [search,start_input,end_input]:input.editable=not value
	var empty:bool=result.get("rows",[]).is_empty()
	export_button.disabled=value or empty or not result.get("ok",false)
	for control in playback_buttons:control.disabled=value or empty
	slider.editable=not value and not empty
	if value:pause()
	previous.disabled=value or timeline_page==0;next.disabled=value or (timeline_page+1)*5>=result.get("rows",[]).size()

func render_history()->void:
	pause();timeline_page=0;detail_index=-1
	var rows:Array=result.get("rows",[])
	map.set_route(rows)
	counts[0].text=("%.1f km" % float(result.distance)).replace(".",",") if result.get("distance")!=null else "—"
	distance_caption.text="Distância • "+str(result.get("distance_source","GPS • estimativa"))
	counts[1].text=str(rows.size()) if result.get("ok",false) else "—"
	counts[2].text=value_text(result.get("maximum")," km/h")
	counts[3].text=(clock_text(rows[0].gps_time)+" — "+clock_text(rows[-1].gps_time)) if not rows.is_empty() else "—"
	counts[3].tooltip_text=(date_text(rows[0].gps_time)+" até "+date_text(rows[-1].gps_time)) if not rows.is_empty() else ""
	slider.max_value=maxi(0,rows.size()-1);slider.set_value_no_signal(0);point_caption.text="Ponto —"
	render_timeline()

static func clock_text(stamp:int)->String:
	var date:=Time.get_datetime_dict_from_unix_time(stamp)
	return "%02d:%02d" % [date.hour,date.minute]

func show_record(index:int)->void:
	var rows:Array=result.get("rows",[])
	if index<0 or index>=rows.size():focused={};detail_index=-1;return
	detail_index=index;focused=rows[index];timeline_page=index/5;map.select_point(index)
	slider.set_value_no_signal(index);point_caption.text="Ponto %d de %d" % [index+1,rows.size()]
	render_timeline()
	# Also replaces the inherited records-specific completion text after the await.
	call_deferred("route_notice")

func route_notice()->void:
	if not result.get("ok",false):return
	notice.text="Fonte: plataforma web • %d ponto(s) • %d lacuna(s) • %d posição(ões) descartada(s). Distância GPS estimada; reprodução ponto a ponto, não em tempo real." % [result.rows.size(),result.gaps,result.discarded]

func render_timeline()->void:
	for child in timeline.get_children():timeline.remove_child(child);child.queue_free()
	var rows:Array=result.get("rows",[])
	timeline_page=clampi(timeline_page,0,maxi(0,ceili(rows.size()/5.0)-1))
	for index in range(timeline_page*5,mini(rows.size(),timeline_page*5+5)):
		var row:Dictionary=rows[index];var panel:=PanelContainer.new();timeline.add_child(panel)
		var style:StyleBox=host._style_box(Color("#eaf4ff") if index==detail_index else Color.WHITE,Color("#a9d4fa") if index==detail_index else Color("#dae5f0"),1,12)
		for side in [SIDE_LEFT,SIDE_RIGHT,SIDE_TOP,SIDE_BOTTOM]:style.set_content_margin(side,10)
		panel.add_theme_stylebox_override("panel",style)
		var stack:=VBoxContainer.new();panel.add_child(stack)
		var title:="Ponto de memória" if row.is_memory else ("Ignição ligada" if row.ignicao==1 else ("Ignição desligada" if row.ignicao==0 else "Ignição não informada"))
		var action:=button("● "+clock_text(row.gps_time)+" • "+title,func():pause();show_record(index));action.alignment=HORIZONTAL_ALIGNMENT_LEFT;action.add_theme_font_size_override("font_size",12);action.add_theme_color_override("font_color",RouteMap.color(row));stack.add_child(action)
		var details:=label(value_text(row.speed," km/h")+" • "+date_text(row.gps_time),11,"#65819e");stack.add_child(details)
		var address:=label(str(row.get("endereco","")),11,"#65819e");address.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;address.max_lines_visible=2;stack.add_child(address)
		if row.gap_before:stack.add_child(label("Lacuna de comunicação / salto",11,"#a77413"))
		if index==detail_index:
			var street:=LinkButton.new();street.text="Ver foto da rua";street.add_theme_font_size_override("font_size",12);street.pressed.connect(func():navigate.call("https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=%s,%s" % [str(row.lat),str(row.lng)]));stack.add_child(street)
			street.add_theme_color_override("font_color",Color("#087df1"))
			ensure_point_visible.call_deferred(panel)
	if rows.is_empty():timeline.add_child(label("As posições aparecerão\naqui após a consulta.",14,"#65819e"))
	previous.disabled=busy or timeline_page==0;next.disabled=busy or (timeline_page+1)*5>=rows.size()

func pause()->void:
	if playback:playback.stop()
	if play_button:play_button.text="";play_button.icon=preload("res://assets/icons/route/play.svg")

func ensure_point_visible(panel:Control)->void:
	if is_instance_valid(panel) and not panel.is_queued_for_deletion() and panel.is_inside_tree():timeline_scroll.ensure_control_visible(panel)

func toggle_play()->void:
	if busy or result.get("rows",[]).is_empty():return
	if not playback.is_stopped():pause();return
	if detail_index>=result.rows.size()-1:show_record(0)
	play_button.icon=preload("res://assets/icons/route/pause.svg");playback.start([1.5,.8,.35][speed.selected])

func advance()->void:
	if busy or detail_index+1>=result.get("rows",[]).size():pause();return
	show_record(detail_index+1)
	if detail_index+1>=result.rows.size():pause()
	else:playback.start([1.5,.8,.35][speed.selected])

func choose_kml()->void:
	if busy or export_button.disabled:return
	var dialog:=FileDialog.new();dialog.file_mode=FileDialog.FILE_MODE_SAVE_FILE;dialog.access=FileDialog.ACCESS_FILESYSTEM;dialog.filters=PackedStringArray(["*.kml ; Trajeto KML"]);dialog.current_file="Trajeto-"+Records.plate_key(str(context.get("plate","veiculo")))+".kml";dialog.use_native_dialog=true;add_child(dialog)
	dialog.file_selected.connect(func(path):dialog.queue_free();save_kml(path));dialog.canceled.connect(dialog.queue_free);dialog.popup_centered(Vector2i(800,500))

func save_kml(path:String)->void:
	if busy or not result.get("ok",false) or result.get("rows",[]).is_empty():return
	var file:=FileAccess.open(path,FileAccess.WRITE)
	if file==null:notice.text="Não foi possível salvar no destino escolhido.";return
	file.store_string(Route.kml(result,str(context.get("plate","Trajeto"))));file.close();notice.text="KML salvo no destino escolhido. Contém localizações; compartilhe com cuidado."
