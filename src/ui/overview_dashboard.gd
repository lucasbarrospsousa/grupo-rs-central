extends RefCounted
const UI=preload("res://src/ui/approved_dashboard.gd")
const Group=preload("res://src/ui/overview_group.gd")
const BOLD=preload("res://assets/fonts/Noto_Sans/static/NotoSans-Bold.ttf")
static func label(value:String,size:int=14,color:Color=Color("#07153f"))->Label:
	var node:=UI.text(value,size,color)
	if size>=18:node.add_theme_font_override("font",BOLD)
	return node
static func card(title:String,subtitle:String="")->VBoxContainer:
	var p:=PanelContainer.new();p.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	var style:=UI.Design.surface(Color.WHITE,Color("#dfebf5"),1,10,true)
	style.content_margin_left=18;style.content_margin_right=18;style.content_margin_top=14;style.content_margin_bottom=14
	p.add_theme_stylebox_override("panel",style)
	var stack:=VBoxContainer.new();stack.add_theme_constant_override("separation",5);p.add_child(stack)
	if title!="":stack.add_child(label(title,20))
	if subtitle!="":stack.add_child(label(subtitle,13,Color("#5978a3")))
	return stack
static func build(host:Control)->Control:
	var scroll:=ScrollContainer.new();scroll.name="OverviewScroll";scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED;scroll.size_flags_vertical=Control.SIZE_EXPAND_FILL
	var root:=VBoxContainer.new();root.name="OverviewDashboard";root.size_flags_horizontal=Control.SIZE_EXPAND_FILL;root.add_theme_constant_override("separation",8);scroll.add_child(root)
	var heading:=HBoxContainer.new();root.add_child(heading)
	var titles:=VBoxContainer.new();titles.add_theme_constant_override("separation",0);titles.size_flags_horizontal=Control.SIZE_EXPAND_FILL;heading.add_child(titles)
	titles.add_child(label("Visão geral",34));titles.add_child(label("Todas as bases e sua filial em um só lugar.",18,Color("#5978a3")))
	var branch:=OptionButton.new();branch.name="OverviewBranch";branch.custom_minimum_size=Vector2(264,46);branch.size_flags_vertical=Control.SIZE_SHRINK_CENTER
	for config in host._branch_configs():
		if not config.get("enabled",false):continue
		branch.add_item("Filial: "+host._branch_display_name(str(config.id)));branch.set_item_metadata(branch.item_count-1,str(config.id))
		if config.id==host.selected_branch_id:branch.select(branch.item_count-1)
	var controls:=preload("res://src/ui/scanner_inventory.gd").new();controls.host=host;controls.style_input(branch);controls.free()
	branch.item_selected.connect(func(index):
		var target:=str(branch.get_item_metadata(index))
		for i in range(branch.item_count):
			if str(branch.get_item_metadata(i))==host.selected_branch_id:branch.select(i)
		host._request_sidebar_branch_switch(target))
	heading.add_child(branch)
	var group:=Group.new();group.host=host;group.credentials_for=host._hub_maintenance_credentials;group.results=host.overview_results.duplicate(true)
	var refresh:=UI.action(host,"Atualizar",func():
		await group.load_all()
		if is_instance_valid(host) and host.current_section=="dashboard":host._refresh_dashboard_data()
	);refresh.size_flags_vertical=Control.SIZE_SHRINK_CENTER;heading.add_child(refresh)
	root.add_child(group)
	var sep:=HSeparator.new();root.add_child(sep)
	var operation:=HBoxContainer.new();root.add_child(operation)
	var operation_titles:=VBoxContainer.new();operation_titles.size_flags_horizontal=Control.SIZE_EXPAND_FILL;operation.add_child(operation_titles)
	operation_titles.add_child(label("Operação da filial · "+host.selected_branch_name,25));operation_titles.add_child(label("Estoque e equipamentos da filial selecionada.",14,Color("#5978a3")))
	operation.add_child(UI.action(host,"Abrir estoque →",host._show_list,true))
	var stats:Dictionary=host._inventory_summary_stats()
	var metrics:=HBoxContainer.new();metrics.add_theme_constant_override("separation",12);root.add_child(metrics)
	for item in [["Equipamentos na base","total","Cadastros da filial",Color("#147bd2"),"all","cadastros"],["Disponíveis em estoque","available","Prontos para a próxima operação",Color("#ff8918"),"estoque","cadastros"],["Inativos" if host._is_regional_branch() else "Equipamentos em manutenção","inactive" if host._is_regional_branch() else "maintenance","Acompanhamento técnico",Color.WHITE,"inativo" if host._is_regional_branch() else "manutencao","manutencoes"],["Instalados","installed","Vinculados na filial",Color("#163e59"),"instalado","localizacao"]]:
		var metric:=UI.metric(host,item,int(stats.get(item[1],0)));metric.custom_minimum_size.y=114
		var margin:MarginContainer=metric.find_children("*","MarginContainer",true,false)[0]
		for side in ["left","right","top","bottom"]:margin.add_theme_constant_override("margin_"+side,12)
		var metric_stack:VBoxContainer=margin.get_child(0);metric_stack.add_theme_constant_override("separation",2)
		var metric_top:HBoxContainer=metric_stack.get_child(0)
		metric_top.get_child(1).custom_minimum_size.y=24
		for child in metric.find_children("*","Label",true,false):
			if child.get_theme_font_size("font_size")==44:
				child.add_theme_font_size_override("font_size",32);child.text=Group.format_count(int(stats.get(item[1],0)))
		metrics.add_child(metric)
	var charts:=HBoxContainer.new();charts.add_theme_constant_override("separation",12);root.add_child(charts)
	var operators:=card("Distribuição por operadora","Chips dos equipamentos da filial");operators.get_parent().size_flags_stretch_ratio=1.25;charts.add_child(operators.get_parent())
	var counts:=UI.operator_counts(stats.get("operators",{}))
	for name in ["Vivo","Claro","TIM","Multioperadora","NLT"]:
		var row:=UI.bar(name,int(counts.get(name,0)),int(stats.get("total",0)),Color({"Vivo":"#7737c5","Claro":"#ec3652","TIM":"#0879d4","Multioperadora":"#ff870d","NLT":"#8d9fba"}[name]));row.custom_minimum_size.y=22;operators.add_child(row)
	var profile:=card("Resumo da filial","Organização para decidir com clareza");charts.add_child(profile.get_parent())
	for item in [["Em estoque","available"],["Instalados","installed"],["Inativos" if host._is_regional_branch() else "Em manutenção","inactive" if host._is_regional_branch() else "maintenance"]]:
		var row:=HBoxContainer.new();var caption:=label(item[0]);caption.size_flags_horizontal=Control.SIZE_EXPAND_FILL;row.add_child(caption);row.add_child(label(Group.format_count(int(stats.get(item[1],0)))));profile.add_child(row);profile.add_child(HSeparator.new())
	profile.add_child(label("Total: %s equipamentos" % Group.format_count(int(stats.get("total",0))),16))
	return scroll
