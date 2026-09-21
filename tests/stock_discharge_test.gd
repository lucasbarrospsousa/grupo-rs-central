extends SceneTree
class Store extends InventoryStore:
	var items:Array[Dictionary]=[]
	var writes:=0
	func get_products(_query:String="",_category:String="",_low:bool=false,_sort:bool=true)->Array[Dictionary]:return items.duplicate(true)
	func get_product(sku:String)->Dictionary:
		for row in items:
			if row.sku==sku:return row.duplicate(true)
		return {}
	func install_tracker(sku:String,plate:String)->bool:
		for row in items:
			if row.sku==sku:row.tracker_status="Instalado";row.plate=plate;writes+=1;return true
		return false
class Shell extends "res://tests/fixtures/offline_main_dashboard.gd":
	var persisted:=true
	func _ensure_local_database_modification_saved(_serial:String="",_expected:Dictionary={})->Dictionary:return {"ok":persisted}
	func _log_system_action(_action:String,_details:String="",_sku:String="")->void:pass
	func _grupo_rs_api_credentials()->Dictionary:return {"username":"fixture","password":"fixture"}
	func _hub_maintenance_credentials(_branch:String)->Dictionary:return {"username":"fixture","password":"fixture"}
class Service extends "res://src/services/stock_discharge.gd":
	var owner_reply:Dictionary={"ok":false,"message":"Cliente indisponível (teste)"}
	var owner_calls:=0
	var calls:=0
	var response:Dictionary={}
	var change_branch:=false
	func request(path:String,fields:Dictionary={})->Dictionary:
		assert(fields.is_empty() or path.ends_with("/auth/login.php"));calls+=1
		if not fields.is_empty():return {"ok":true,"data":{"token":"fixture"}}
		if change_branch:host.selected_branch_id="other"
		return response
	func lookup_client(_serial:String,_plate:String)->Dictionary:owner_calls+=1;return owner_reply
func _initialize():run.call_deferred()
func run():
	create_timer(45).timeout.connect(func():push_error("Discharge timeout");quit(1))
	root.size=Vector2i(1917,991)
	var shell:=Shell.new();root.add_child(shell)
	var store:=Store.new();shell.store=store
	var service:=Service.new();service.host=shell;shell.add_child(service)
	var raw:={"numeroSerie":"024999991","placa":"ABC1D23","cliente":"CLIENTE DEMONSTRATIVO"}
	for branch in service.ORIGINS:
		shell.selected_branch_id=branch
		store.items=[{"sku":"024999991","equipment_number":"024999991","tracker_status":"Estoque"},{"sku":"024999992","tracker_status":"Instalado"}]
		service.response={"ok":true,"data":{"veiculos":[raw]}}
		await service.analyze();assert(service.rows.size()==1);assert(service.rows[0].ok);assert(store.writes==0)
		assert(service.branch==branch)
	service.response={"ok":true,"data":{"veiculos":[raw,raw]}}
	await service.analyze();assert(not service.rows[0].ok)
	service.response={"ok":false,"message":"Sem acesso"};await service.analyze();assert(not service.rows[0].ok)
	service.response={"ok":true,"data":{"veiculos":[{"numeroSerie":"024999991","placa":"GRS - 001","cliente":"RS300"}]}}
	await service.analyze();assert(not service.rows[0].ok)
	assert(service.rows[0].category=="stock" and service.rows[0].client=="RS300")
	service.owner_reply={"ok":true,"client":"RS300"}
	service.response={"ok":true,"data":{"veiculos":[{"numeroSerie":"024999991","placa":"AAA - 310"}]}}
	await service.analyze();assert(service.rows[0].category=="stock" and service.rows[0].client=="RS300" and service.owner_calls==1)
	service.owner_reply={"ok":false,"category":"error","message":"Portal indisponível"}
	await service.analyze();assert(service.rows[0].category=="error" and not service.rows[0].ok)
	service.owner_reply={"ok":false,"message":"Cliente indisponível (teste)"}
	service.response={"ok":true,"data":{"veiculos":[raw]}};await service.analyze()
	await service.apply_selected();assert(store.writes==0)
	service.rows[0].selected=true
	store.items[0].tracker_status="Manutenção"
	await service.apply_selected();assert(store.writes==0)
	store.items[0].tracker_status="Estoque";await service.analyze();service.rows[0].selected=true
	service.change_branch=true;await service.apply_selected();assert(store.writes==0)
	service.change_branch=false;shell.selected_branch_id="imperatriz";shell.selected_branch_name="Imperatriz"
	await service.analyze();service.rows[0].selected=true
	var applied:=await service.apply_selected();assert(applied.done==1);assert(store.writes==1)
	await service.apply_selected();assert(store.writes==1)
	store.items[0].tracker_status="Estoque";await service.analyze();service.rows[0].selected=true
	service.response={"ok":true,"data":{"veiculos":[{"numeroSerie":"024999991","placa":"DEF2G34","cliente":"OUTRO CLIENTE"}]}}
	await service.apply_selected();assert(store.writes==1)
	service.response={"ok":true,"data":{"veiculos":[{"numeroSerie":"024999991","placa":"ABC1D23"}]}}
	await service.analyze();assert(not service.rows[0].ok)
	service.response={"ok":true,"data":{"veiculos":[raw]}}
	await service.analyze();service.rows[0].selected=true;shell.persisted=false
	var pending:=await service.apply_selected();assert(pending.done==0 and pending.failed==1);assert(store.writes==2)
	shell.persisted=true
	store.items[0].tracker_status="Estoque"
	for i in range(2,5):store.items.append({"sku":"02499999%d" % i,"tracker_status":"Estoque"})
	var dialog:=preload("res://src/ui/stock_discharge.gd").new();dialog.host=shell;dialog.service=service;shell.add_child(dialog)
	await process_frame;await process_frame
	while service.busy:await process_frame
	await process_frame
	dialog.select_all(true);assert(not dialog.apply_button.disabled)
	dialog.search.text="NÃO EXISTE";dialog.render();assert(dialog.filtered.is_empty())
	dialog.search.clear();dialog.result_filter.select(1);dialog.render();assert(dialog.filtered.size()==1)
	dialog.result_filter.select(0);dialog.render()
	assert(service.rows.filter(func(row):return row.selected).size()==1)
	service.rows[1].category="stock";service.rows[1].plate="AAA - 310";service.rows[1].client="RS300";service.rows[1].message="Permanece em estoque • vínculo confirmado com RS300."
	service.rows[2].category="error";service.rows[2].message="Consulta indisponível (HTTP 503)."
	dialog.result_filter.select(3);dialog.render();assert(dialog.filtered.size()==1 and dialog.filtered[0]==1)
	dialog.result_filter.select(4);dialog.render();assert(dialog.filtered.size()==1 and dialog.filtered[0]==2)
	dialog.select_all(true);assert(not service.rows[2].selected)
	dialog.result_filter.select(0);dialog.render()
	if DisplayServer.get_name()!="headless":
		await create_timer(0.4).timeout;assert(dialog.size.y<root.size.y);RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("analisar-baixa.png"))
	service.rows[0].ok=false;service.rows[0].message="Baixa aplicada • Instalado"
	dialog.result_filter.select(2);dialog.render();assert(dialog.filtered.size()==1)
	shell.free();print("STOCK_DISCHARGE_OK");quit()
