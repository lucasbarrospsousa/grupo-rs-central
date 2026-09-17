extends SceneTree
const Route=preload("res://src/services/tracking_route.gd")
const Shell=preload("res://tests/fixtures/offline_main_dashboard.gd")
const Store=preload("res://src/inventory_store.gd")
class TestShell extends Shell:
	func _setup_integration_maintenance()->void:pass
	func _setup_online_plate_sync()->void:pass
class FakeService extends Route:
	var fail:=false
	var empty:=false
	func resolve(_product:Dictionary,_branch:String,_parser:Callable)->Dictionary:
		return {"ok":true,"client_id":"1","vehicle_id":"10","client":"Cliente demonstrativo","plate":"ABC-1D23","serial":"024000001"}
	func history(_context:Dictionary,window:Dictionary,_branch:String)->Dictionary:
		if fail:return {"ok":false,"message":"Falha simulada; não é trajeto vazio."}
		return Route.normalize_route([] if empty else sample(),window)
	static func sample()->Array:
		var rows:Array=[]
		for i in range(16):
			rows.append({"lat":-5.521+i*.0006,"lng":-47.485+i*.0008,"data_gps":"2026-09-17 08:%02d:00" % i,"data_srv":"2026-09-17 08:%02d:04" % i,"vel":32+i,"ign":1 if i<15 else 0,"mem":1 if i==8 else 0,"endereco":"Av. Principal • dados fictícios"})
		return rows
func _init()->void:
	create_timer(60).timeout.connect(func():push_error("Route test timeout");quit(1))
	run.call_deferred()
func run()->void:
	var window:=Route.period("17/09/2026 08:00","17/09/2026 10:00")
	assert(not Route.normalize_route({},window).ok)
	assert(Route.normalize_route([],window).rows.is_empty())
	var raw:=FakeService.sample();raw.reverse();raw.append(raw[0].duplicate())
	var data:=Route.normalize_route(raw,window)
	assert(data.ok and data.rows.size()==16 and data.rows[0].gps_time<data.rows[-1].gps_time and data.memory_count==1)
	assert(data.maximum==47 and data.gaps==0 and data.distance>1 and data.distance<5)
	var broken:=FakeService.sample();broken[5].lat=0;broken[5].lng=0;broken[6].data_gps="bad"
	assert(Route.normalize_route(broken,window).discarded==2)
	var gap:=FakeService.sample();gap[15].data_gps="2026-09-17 09:10:00"
	assert(Route.normalize_route(gap,window).gaps==1)
	var reset:=FakeService.sample()
	for i in range(reset.size()):reset[i].hodometro=200-i
	assert(Route.normalize_route(reset,window).distance_source.begins_with("GPS"))
	for i in range(reset.size()):reset[i].hodometro=200+i
	assert(Route.normalize_route(reset,window).distance_source=="Hodômetro")
	var single:=Route.normalize_route([raw[0]],window);assert(single.distance==null and single.rows.size()==1)
	var xml:=Route.kml(data,"ABC & <teste>")
	assert(xml.contains("ABC &amp; &lt;teste&gt;") and xml.count("<Point>")==16 and xml.count("<LineString>")==1)
	root.size=Vector2i(1917,995)
	var store=Store.new();store.configure_isolated_sqlite_for_testing(ProjectSettings.globalize_path("user://route.sqlite"),"imperatriz");store.load_db()
	store.upsert_product({"sku":"024000001","imei":"024000001","plate":"ABC-1D23","tracker_status":"Instalado","stock":1})
	var before:=JSON.stringify(store.get_products())
	var shell=TestShell.new();shell.store=store;shell.online_data_available=true;root.add_child(shell);await process_frame
	shell._show_route();await process_frame
	var view=shell.find_child("TrackingRoute",true,false);assert(view!=null and shell.current_section=="route")
	view.map.network_enabled=false
	view.service.queue_free();view.service=FakeService.new();view.add_child(view.service)
	view.start_input.text="17/09/2026 08:00";view.end_input.text="17/09/2026 10:00";view.search.text="abc - 1d23"
	await view.run_search();await process_frame
	assert(view.result.ok and view.result.rows.size()==16 and view.counts[1].text=="16")
	assert(view.context.serial=="024000001" and not view.export_button.disabled)
	view.toggle_play();assert(not view.playback.is_stopped());await create_timer(.95).timeout;assert(view.detail_index>=1);view.pause();assert(view.playback.is_stopped())
	assert(view.valid_operation(view.operation) and not view.valid_operation(view.operation+1))
	view.show_record(8);assert(view.timeline_page==1 and int(view.slider.value)==8 and view.map.selected_index==8)
	view.slider.value=3;assert(view.detail_index==3 and view.playback.is_stopped())
	view.set_layer("satellite");assert(view.map.layer=="satellite" and view.attribution.text.contains("Esri"));view.set_layer("streets")
	var z:int=view.map.zoom;view.map.change_zoom(1);assert(view.map.zoom==z+1);view.map.fit_route()
	var destination:=ProjectSettings.globalize_path("user://test.kml");view.save_kml(destination)
	assert(FileAccess.get_file_as_string(destination).contains("<kml"))
	view.notice.text="PRÉVIA DE TESTE • Dados fictícios • mapa sem rede nesta captura."
	if OS.get_environment("ROUTE_MAP_TEST")=="1":
		view.map.network_enabled=true;await view.map.load_visible()
		assert(not view.map.tiles.is_empty(),"Visible map failed")
		view.notice.text="VALIDAÇÃO • Dados fictícios • mapa público carregado sob demanda."
	if OS.get_environment("ROUTE_SATELLITE_TEST")=="1":
		view.set_layer("satellite");view.map.network_enabled=true;view.map.debounce.stop();await view.map.load_visible()
		assert(not view.map.tiles.is_empty(),"Satellite tiles failed")
		view.notice.text="VALIDAÇÃO • Dados fictícios • imagem de satélite pública sob demanda."
	if DisplayServer.get_name()!="headless":
		await create_timer(.5).timeout;RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("route.png"))
	view.service.fail=true;await view.run_search();assert(not view.result.ok and view.map.points.is_empty() and view.export_button.disabled and view.focused.is_empty())
	view.service.fail=false;view.service.empty=true;await view.run_search();assert(view.result.ok and view.map.points.is_empty() and view.export_button.disabled)
	view.clear_search();assert(view.result.is_empty() and view.playback.is_stopped())
	view.branch="maraba";await view.run_search();assert(view.notice.text.contains("Imperatriz"))
	assert(JSON.stringify(store.get_products())==before)
	shell._show_records();await process_frame;assert(shell.current_section=="records")
	print("ROUTE_PASS: exact lookup, sorting, duplicates, GPS validity, gap, odometer reset, empty/failure, playback, seek, layer, zoom, KML, navigation and unchanged SQLite")
	quit()
