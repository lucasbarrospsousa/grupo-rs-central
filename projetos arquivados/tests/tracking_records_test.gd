extends SceneTree
const Records=preload("res://src/services/tracking_records.gd")
const Shell=preload("res://tests/fixtures/offline_main_dashboard.gd")
const Store=preload("res://src/inventory_store.gd")
class TestShell extends Shell:
	func _setup_integration_maintenance()->void:pass
	func _setup_online_plate_sync()->void:pass
class FakeService extends Records:
	var fail:=false
	var calls:=0
	func resolve(_product:Dictionary,_branch:String,_parser:Callable)->Dictionary:
		return {"ok":true,"client_id":"1","vehicle_id":"10","client":"João Silva (fictício)","plate":"ABC-1D23","serial":"024000001"}
	func history(context_value:Dictionary,_window:Dictionary,_branch:String)->Dictionary:
		calls+=1
		if fail:return {"ok":false,"message":"Falha simulada; não é histórico vazio."}
		var events:Array=[]
		for i in range(12):
			events.append({"id":i+1,"cod_veiculo":10,"data":"17/09/2026 11:%02d:30" % (59-i),"data_comunicacao":"17/09/2026 11:%02d:36" % (59-i),"velocidade":42 if i%2==0 else 0,"ignicao":1 if i%2==0 else 0,"bateria":13.8,"bateria_bkp":92,"hodometro":18420,"motorista":"Não informado","endereco":"Rua das Palmeiras, 120 • exemplo","memoria":1 if i==2 else 0,"lat":-5.5,"lng":-47.5})
		return Records.normalize({"eventos":events,"total":12,"totalPercorrido":24.6},context_value)
	func clients(_query:String,_branch:String)->Dictionary:
		return {"ok":true,"clients":[{"id":"1","name":"João Silva"},{"id":"2","name":"João Silva"}]}
	func links(_id:String,_branch:String)->Dictionary:
		return {"ok":true,"serials":["024000001"]}
	func pdf(_context:Dictionary,_window:Dictionary,_branch:String)->Dictionary:
		return {"ok":false,"message":"PDF indisponível simulado"}
func _init()->void:
	create_timer(50).timeout.connect(func():push_error("Records timeout");quit(1))
	run.call_deferred()
func run()->void:
	assert(not Records.period("31/02/2026 00:00","17/09/2026 12:00").ok)
	assert(not Records.period("17/09/2026 12:00","17/09/2026 11:00").ok)
	assert(not Records.period("01/09/2026 00:00","17/09/2026 12:00").ok)
	assert(Records.period("17/09/2026 00:00","17/09/2026 12:00").ok)
	assert(Records.coordinates({"lat":0,"lng":0}).is_empty())
	assert(Records.coordinates({"lat":"bad","lng":30}).is_empty())
	assert(Records.number("")==null)
	assert(not Records.normalize({"eventos":[{"cod_veiculo":11}]},{"vehicle_id":"10"}).ok)
	assert(not Records.normalize({},{}).ok)
	var empty:=Records.normalize({"eventos":[],"total":0},{"vehicle_id":"10"})
	assert(empty.ok and empty.rows.is_empty() and empty.maximum==null)
	var partial:=Records.normalize({"eventos":[{"id":1,"cod_veiculo":10},{"id":1,"cod_veiculo":10}],"total":2},{"vehicle_id":"10"})
	assert(partial.partial and partial.rows.size()==1)
	root.size=Vector2i(1917,995)
	var store=Store.new();store.configure_isolated_sqlite_for_testing(ProjectSettings.globalize_path("user://records.sqlite"),"imperatriz");store.load_db()
	store.upsert_product({"sku":"024000001","imei":"024000001","plate":"ABC-1D23","tracker_status":"Instalado","stock":1})
	var before:=JSON.stringify(store.get_products())
	var shell=TestShell.new();shell.store=store;shell.online_data_available=true;root.add_child(shell);await process_frame
	shell._show_records();await process_frame
	var view=shell.find_child("TrackingRecords",true,false)
	assert(view!=null and shell.current_section=="records")
	view.service.queue_free();view.service=FakeService.new();view.add_child(view.service)
	view.start_input.text="17/09/2026 08:00";view.end_input.text="17/09/2026 12:00";view.search.text="abc - 1d23"
	await view.run_search()
	assert(view.result.ok and view.result.rows.size()==12 and view.counts[0].text=="12")
	assert(view.context.serial=="024000001" and not view.export_button.disabled)
	view.next.pressed.emit();assert(view.page==1)
	view.previous.pressed.emit();assert(view.page==0)
	var opened:Array=[];view.navigate=func(url):opened.append(url)
	view.show_record(0);view.open_position();assert(opened.size()==1 and opened[0].begins_with("https://www.google.com/maps/search/"))
	if OS.get_environment("RECORDS_MAP_TEST")=="1":
		await view.map.load_position();assert(view.map.texture!=null,"Public map tile failed")
		var texture=view.map.texture;await view.map.load_position();assert(view.map.texture==texture)
	if OS.get_environment("RECORDS_MAP_FIXTURE")!="":
		var tile:=Image.load_from_file(OS.get_environment("RECORDS_MAP_FIXTURE"));view.map.texture=ImageTexture.create_from_image(tile);view.map.point=Vector2(.4,.6);view.map.queue_redraw()
	await view.save_pdf(ProjectSettings.globalize_path("user://test.pdf"));assert(not FileAccess.file_exists("user://test.pdf"))
	view.notice.text="Dados fictícios para validação visual • nenhum envio ou alteração cadastral."
	if DisplayServer.get_name()!="headless":
		await create_timer(.5).timeout;RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("records.png"))
	view.service.fail=true;await view.run_search();assert(not view.result.ok and view.export_button.disabled and view.focused.is_empty())
	view.clear_search();view.search.text="João";await view.run_search();assert(view.picker.get_child_count()==2)
	await view.select_client({"id":"1","name":"João Silva"});assert(view.picker.get_child_count()==1)
	view.branch="maraba";var calls:int=view.service.calls;await view.run_search();assert(view.service.calls==calls)
	assert(JSON.stringify(store.get_products())==before)
	print("RECORDS_PASS: periods, identities, dates, unknowns, duplicates, partial, search, pagination, map link mocked, PDF failure, homonyms, branch isolation, unchanged SQLite")
	quit()
