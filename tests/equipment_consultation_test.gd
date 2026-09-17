extends SceneTree
const Service = preload("res://src/services/equipment_consultation.gd")
const Shell = preload("res://tests/fixtures/offline_main_dashboard.gd")
const Store = preload("res://src/inventory_store.gd")
class TestShell extends Shell:
	var sms_calls := 0
	var edit_calls := 0
	func _setup_integration_maintenance() -> void: pass
	func _setup_online_plate_sync() -> void: pass
	func _show_arya_sms_dialog(_product: Dictionary, _force: bool = false) -> void: sms_calls += 1
	func _show_form(_sku: String = "") -> void: edit_calls += 1
class FakeService extends Service:
	var fail := false
	func details(_product:Dictionary,_branch:String,_parser:Callable)->Dictionary:
		return {"ok":true,"client":"Cliente da placa","communication":{"color_key":"verde","label":"Ligado","ignition_state":1},"message":"Simulado"}
	func clients(_query: String, _branch: String) -> Dictionary:
		if fail: return {"ok":false,"message":"Falha simulada"}
		return {"ok":true,"clients":[{"id":"1","name":"João Silva"},{"id":"2","name":"João Silva"}]}
	func links(_id: String, _branch: String) -> Dictionary:
		return {"ok":true,"serials":["024000001","024000002","024999999"],"unresolved":0}
func _init() -> void:
	create_timer(45).timeout.connect(func(): push_error("Consultation timeout"); quit(1))
	run.call_deferred()
func run() -> void:
	root.size = Vector2i(1917, 995)
	var store = Store.new()
	store.configure_isolated_sqlite_for_testing(ProjectSettings.globalize_path("user://consult.sqlite"), "imperatriz")
	store.load_db()
	for i in range(2):
		store.upsert_product({"sku":"02400000" + str(i+1),"imei":"02400000"+str(i+1),"name":"Fictício","plate":"TST-000"+str(i+1),"tracker_status":"Instalado" if i==0 else "Manutenção","chip_phone":"(99) 99999-000"+str(i+1),"operator":"Multioperadora","stock":1})
	var before := JSON.stringify(store.get_products())
	assert(Service.local_results(store.get_products(), "024000001", "Todos os status").size()==1)
	assert(Service.local_results(store.get_products(), "24000001", "Todos os status").is_empty())
	assert(Service.local_results(store.get_products(), "tst0002", "Todos os status").size()==1)
	var now:=Time.get_unix_time_from_datetime_string("2026-09-17T12:00:00")
	var sample:Dictionary={"DataComunicacaoServidor":"2026-09-17 11:59:00","DataGPS":"2026-09-17 11:59:00","ignicao":1,"lat":"-5.0","lng":"-47.0"}
	assert(Service.communication(sample,now).color_key=="verde")
	sample.ignicao=0;assert(Service.communication(sample,now).color_key=="vermelho")
	sample.DataGPS="2026-09-17 08:00:00";assert(Service.communication(sample,now).color_key=="roxo")
	sample.DataComunicacaoServidor="2026-09-17 09:00:00";assert(Service.communication(sample,now).color_key=="amarelo")
	assert(Service.communication({},now).color_key=="cinza")
	assert(Service.communication({"DataComunicacaoServidor":"2026-09-17 11:59:00"},now).color_key=="cinza")
	assert(Service.display_state({"server_unix":now-700,"communication_limit_seconds":600,"color_key":"verde"},now).color_key=="amarelo")
	sample.DataComunicacaoServidor="2026-09-17 13:00:00";assert(Service.communication(sample,now).color_key=="cinza")
	assert(Service.matched_record([{"equipamento":"024000001","placa":"TST0001"}],store.get_products()[0]).size()>0)
	assert(Service.matched_record([{"equipamento":"024000002","placa":"TST0001"}],store.get_products()[0]).is_empty())
	var shell := TestShell.new(); shell.store=store; shell.online_data_available=true; root.add_child(shell); await process_frame
	shell._show_consult(); await process_frame
	var view = shell.find_child("EquipmentConsultation",true,false)
	assert(view != null and shell.current_section=="consult")
	view.service.queue_free(); view.service=FakeService.new();view.add_child(view.service)
	view.search.text="João"; await view.run_search()
	assert(view.picker.visible and view.picker.get_child(0).get_child(0).get_child_count()==2)
	await view.choose_client({"id":"1","name":"João Silva"})
	assert(view.result_rows.size()==2 and view.counts[2].text=="1")
	view.status.select(2);view.render();assert(view.result_rows.size()==1)
	view.status.select(0);view.render()
	var actions = view.rows_box.get_child(0).get_child(6)
	actions.get_child(0).pressed.emit();actions.get_child(1).pressed.emit()
	assert(shell.sms_calls==1 and shell.edit_calls==1)
	if DisplayServer.get_name()!="headless":
		await create_timer(.6).timeout;RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("consultation.png"))
	view.service.fail=true;await view.run_search();assert(view.notice.text=="Falha simulada" and not view.busy)
	view.clear_search();assert(view.customer=="")
	view.service.fail=false;view.search.text="tst - 0001";await view.run_search()
	assert(view.result_rows.size()==1)
	assert(view.selected.text=="Associado confirmado: Cliente da placa")
	assert(view.rows_box.get_child(0).get_child(1).get_meta("color_key")=="verde")
	if DisplayServer.get_name()!="headless":
		view.linked=null;view.mode.select(0);view.customer="";view.submitted_query="";view.products=[]
		var colors=["verde","vermelho","amarelo","roxo","cinza"]
		var titles=["Ligado","Desligado","Desatualizado","Possível falha GPS","Sem informação"]
		for i in range(5):
			var product={"sku":"02499900"+str(i),"imei":"02499900"+str(i),"plate":"TST-000"+str(i),"client":"Associado de exemplo "+str(i+1),"operator":"Multioperadora","chip_phone":"(99) 99999-0000","tracker_status":"Instalado"}
			view.products.append(product)
			view.details_by_serial[product.imei]={"ok":true,"client":product.client,"communication":{"color_key":colors[i],"label":titles[i]}}
		view.render(); await create_timer(.5).timeout;RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("plate-colors.png"))
		view.rows_box.get_parent().scroll_vertical=10000
		await create_timer(.3).timeout;RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("plate-colors-bottom.png"))
	assert(JSON.stringify(store.get_products())==before)
	var service := Service.new();root.add_child(service)
	assert(not (await service.clients("João", "maraba")).ok)
	assert(not (await service.links("1", "maraba")).ok)
	print("CONSULTATION_PASS: exact serial, plate, status, homonyms, intersection, missing, action routes mocked, failure, branch guard, no mutations")
	quit()
