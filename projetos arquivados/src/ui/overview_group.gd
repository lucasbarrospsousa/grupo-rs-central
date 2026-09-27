extends "res://src/ui/hub_maintenance.gd"
const Overview=preload("res://src/ui/approved_dashboard.gd")
const BOLD=preload("res://assets/fonts/Noto_Sans/static/NotoSans-Bold.ttf")
var host:Control
var cards:HBoxContainer
var chart_rows:VBoxContainer
var total_label:Label
var total_note:Label
func _ready()->void:
	name="OverviewGroup";size_flags_horizontal=Control.SIZE_EXPAND_FILL
	add_theme_stylebox_override("panel",StyleBoxEmpty.new())
	var stack:=VBoxContainer.new();stack.add_theme_constant_override("separation",12);add_child(stack)
	var panorama:=surface();stack.add_child(panorama)
	var body:=VBoxContainer.new();body.add_theme_constant_override("separation",12);panorama.add_child(body)
	var head:=HBoxContainer.new();body.add_child(head)
	head.add_child(bold("Panorama do grupo",21));summary=label("Aguardando consulta",12);summary.add_theme_color_override("font_color",Color.WHITE);summary.add_theme_stylebox_override("normal",pill_style());head.add_child(summary)
	body.add_child(label("Veículos em manutenção em todas as bases do Grupo RS.",13))
	cards=HBoxContainer.new();cards.add_theme_constant_override("separation",12);body.add_child(cards)
	var chart_line:=HBoxContainer.new();chart_line.add_theme_constant_override("separation",12);stack.add_child(chart_line)
	var chart:=surface();chart.size_flags_stretch_ratio=3;chart_line.add_child(chart)
	var chart_body:=VBoxContainer.new();chart_body.add_theme_constant_override("separation",8);chart.add_child(chart_body)
	chart_body.add_child(bold("Veículos em manutenção por base",21));chart_body.add_child(label("Comparação de quantidade • ordenado do maior para o menor",13))
	chart_rows=VBoxContainer.new();chart_rows.add_theme_constant_override("separation",10);chart_body.add_child(chart_rows)
	var total:=surface();chart_line.add_child(total)
	var total_body:=VBoxContainer.new();total_body.add_theme_constant_override("separation",8);total.add_child(total_body)
	total_body.add_child(bold("Total de veículos em manutenção",16));total_label=bold("—",64);total_body.add_child(total_label);total_body.add_child(label("veículos em manutenção",18));total_note=label("Aguardando as quatro bases.",13);total_body.add_child(total_note)
	refresh=Button.new();refresh.hide();add_child(refresh)
	render()
	if results.is_empty() and credentials_for.is_valid():load_all.call_deferred()
func bold(value:String,size:int)->Label:
	var node:=label(value,size);node.add_theme_font_override("font",BOLD);node.add_theme_color_override("font_color",Color("#08153e"));return node
func surface()->PanelContainer:
	var panel:=PanelContainer.new();panel.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	var style:=box(Color.WHITE,10);style.border_color=Color("#dfebf5");style.set_border_width_all(1);panel.add_theme_stylebox_override("panel",style);return panel
func render()->void:
	if not is_instance_valid(cards):return
	empty_children(cards);empty_children(chart_rows);bars.clear()
	if is_instance_valid(host):host.overview_results=results.duplicate(true)
	var counts:Array=[];var total:=0;var confirmed:=0
	for data in results.values():
		if data.get("ok",false):counts.append(int(data.count));total+=int(data.count);confirmed+=1
	summary.text="%d de 4 bases consultadas" % confirmed
	total_label.text=format_count(total) if confirmed>0 else "—";total_note.text="Total das quatro bases." if confirmed==4 else "Total parcial • %d bases pendentes" % (4-confirmed)
	for id in ["imperatriz","araguaina","acailandia","maraba"]:
		var result:Dictionary=results.get(id,{});var ok:=bool(result.get("ok",false));var count:=int(result.get("count",0));var selected:bool=is_instance_valid(host) and host.selected_branch_id==id
		var button:=Button.new();button.size_flags_horizontal=Control.SIZE_EXPAND_FILL;button.custom_minimum_size.y=104
		var style:=box(Color("#fff6eb") if selected else Color.WHITE,8);style.border_color=Color("#ff880e") if selected else Color("#e0e9f4");style.set_border_width_all(1)
		for state in ["normal","hover","pressed"]:button.add_theme_stylebox_override(state,style)
		cards.add_child(button);button.pressed.connect(func():host._request_sidebar_branch_switch(id))
		var margin:=MarginContainer.new();margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		for side in ["left","right","top","bottom"]:margin.add_theme_constant_override("margin_"+side,10)
		button.add_child(margin);var body:=VBoxContainer.new();body.add_theme_constant_override("separation",0);margin.add_child(body)
		var top:=HBoxContainer.new();body.add_child(top);var stripe:=ColorRect.new();stripe.color=Service.color_for(count,counts) if ok else Color("#9aabc0");stripe.custom_minimum_size=Vector2(5,20);top.add_child(stripe);top.add_child(bold(BASES[id],17))
		var row:=HBoxContainer.new();body.add_child(row);row.add_child(bold(format_count(count) if ok else "—",30));var note:=label("veículos em manutenção" if ok else str(result.get("message","Consulta pendente")),12);note.size_flags_vertical=Control.SIZE_SHRINK_CENTER;row.add_child(note)
		body.add_child(label("Selecionada" if selected else "Selecionar                                      ›",12));ignore_mouse(margin)
	var order:Array=BASES.keys();order.sort_custom(func(a,b):return int(results.get(a,{}).get("count",-1))>int(results.get(b,{}).get("count",-1)))
	var maximum:=1
	for count in counts:maximum=maxi(maximum,count)
	for id in order:
		var result:Dictionary=results.get(id,{});var ok:=bool(result.get("ok",false));var count:=int(result.get("count",0))
		var row:=HBoxContainer.new();row.add_theme_constant_override("separation",12);chart_rows.add_child(row)
		var caption:=bold(BASES[id],14);caption.custom_minimum_size.x=115;row.add_child(caption)
		var track:=Control.new();track.custom_minimum_size.y=24;track.size_flags_horizontal=Control.SIZE_EXPAND_FILL;row.add_child(track)
		var back:=Panel.new();track.add_child(back);back.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);back.add_theme_stylebox_override("panel",box(Color("#e8f1f7"),5))
		var bar:=Button.new();track.add_child(bar);bar.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);bar.anchor_right=maxf(.015,float(count)/maximum) if ok else 1.0;bar.offset_right=0
		var color:=Service.color_for(count,counts) if ok else Color("#d9e2ef")
		for state in ["normal","hover","pressed","disabled"]:bar.add_theme_stylebox_override(state,box(color,5))
		bar.disabled=not ok;bar.tooltip_text="%s • %d veículos • Clique para abrir a lista" % [BASES[id],count] if ok else str(result.get("message","Consulta pendente"));bar.pressed.connect(open_list.bind(id))
		var number:=bold(str(count) if ok else "—",14);number.custom_minimum_size.x=42;number.horizontal_alignment=HORIZONTAL_ALIGNMENT_RIGHT;row.add_child(number);bars[id]={"bar":bar,"number":number}
	if is_instance_valid(list_dialog):populate_list()
static func format_count(value:int)->String:
	var raw:=str(value);var out:=""
	for i in range(raw.length()):
		if i>0 and (raw.length()-i)%3==0:out+="."
		out+=raw[i]
	return out

func pill_style()->StyleBoxFlat:
	var style:=box(Color("#065ba7"),14);style.content_margin_top=3;style.content_margin_bottom=3;return style

func load_all()->void:
	await super.load_all()
	if is_instance_valid(summary):summary.text="%d de 4 bases consultadas" % results.values().filter(func(item):return item.get("ok",false)).size()
