extends SceneTree
class Shell extends "res://tests/fixtures/offline_main_dashboard.gd":
	func _inventory_summary_stats()->Dictionary:return {"total":3297,"available":6,"maintenance":3,"installed":3288,"operators":{"Vivo":520,"Claro":736,"TIM":1960,"Multioperadora":80,"NLT":1}}
	func _hub_maintenance_credentials(_id:String)->Dictionary:return {}
	func _process(_dt:float)->void:pass
func _initialize():run.call_deferred()
func run():
	create_timer(45).timeout.connect(func():push_error("Overview timeout");quit(1))
	root.size=Vector2i(1568,1003);root.content_scale_size=Vector2i.ZERO;root.gui_embed_subwindows=true
	var shell:=Shell.new();shell.selected_branch_id="imperatriz";shell.selected_branch_name="Imperatriz"
	for id in ["imperatriz","araguaina","acailandia","maraba"]:
		var count:int={"imperatriz":488,"araguaina":332,"acailandia":235,"maraba":113}[id];var rows:Array=[]
		for i in range(count):rows.append({"client":"CLIENTE DEMONSTRATIVO %02d" % (i+1),"plate":"DEM-%04d" % i,"serial":"024%06d" % i,"apn":"hinova","phone":"(00) 90000-0000","updated_at":"18/09/2026 17:54:10"})
		shell.overview_results[id]={"ok":true,"count":count,"rows":rows,"source":"Dados demonstrativos","queried_at":"21/09/2026"}
	root.add_child(shell);shell._show_dashboard()
	await create_timer(1).timeout
	var group=shell.find_child("OverviewGroup",true,false);assert(group!=null);group.credentials_for=func(_id):return {}
	assert(group.total_label.text=="1.168");assert(group.bars.imperatriz.bar.anchor_right==1.0)
	if DisplayServer.get_name()!="headless":
		RenderingServer.force_draw();root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("visao-geral.png"))
	group.open_list("maraba");await create_timer(.5).timeout
	assert(group.filtered_rows.size()==113);assert(group.page_size==8)
	var first_group:Control=group.list_rows.get_child(0)
	var click:=InputEventMouseButton.new();click.button_index=MOUSE_BUTTON_LEFT;click.pressed=true
	first_group.gui_input.emit(click);assert(group.list_rows.get_children().filter(func(item):return item.has_meta("vehicle_row")).is_empty())
	group.list_rows.get_child(0).gui_input.emit(click);assert(group.list_rows.get_children().filter(func(item):return item.has_meta("vehicle_row")).size()==8)
	await process_frame
	if DisplayServer.get_name()!="headless":
		RenderingServer.force_draw();root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("manutencoes.png"))
	group.list_search.text="NENHUM RESULTADO";group.populate_list();assert(group.filtered_rows.is_empty())
	group.list_search.clear();group.populate_list();group.page=14;group.populate_list();assert(group.page==14)
	group.results.maraba={"ok":false,"message":"Indisponível"};group.render();assert(group.total_note.text.contains("parcial"));assert(not group.list_status.text.contains("completa"))
	shell.free();await process_frame;print("OVERVIEW_OK");quit()
