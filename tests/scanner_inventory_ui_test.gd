extends SceneTree
const Shell=preload("res://tests/fixtures/offline_main_dashboard.gd")
class FakeBridge extends Node:
	var offline:=false
	var registers:=0
	var paginated:=false
	var sent:=false
	var usage_calls:=0
	var use_chip:=false
	var usage_fail:=false
	func call_service(op:String,data:Dictionary={}) -> Dictionary:
		if op=="reconcile_usage":
			usage_calls+=1
			if usage_fail:return {"ok":false,"error":"Verificação pendente (teste)"}
			return {"ok":true,"checked":7,"used":1 if use_chip else 0,"used_numbers":["89553000000000000120"] if use_chip else [],"ambiguous":0}
		if op=="list":
			var rows:=[]
			for i in range(7):
				rows.append({"kind":"equipment" if data.kind=="movements" else data.kind,"number":("02400012%d" % i) if data.kind!="chip" else ("8955300000000000012%d" % i),"received_at":1700000000,"state":"sent" if data.kind=="movements" else "available","destination":"Marabá","note":"Demonstração fictícia","sent_at":1700000000})
			if use_chip:
				rows[0].state="used";rows[0].kind="chip";rows[0].number="89553000000000000120"
				rows[0].device_serial="024000555";rows[0].used_branch="Araguaína";rows[0].registered_at="2026-09-21 15:00:00";rows[0].detected_at=1700000001
			return {"ok":true,"total":37 if paginated else 7,"page":data.page if paginated else 0,"counts":{"equipment":7,"chip":7,"sent_today":2},"rows":rows}
		if op=="register":
			registers+=1
			if data.number=="invalid":return {"ok":false,"error":"Número inválido"}
			return {"ok":true,"kind":data.kind,"number":data.number}
		if op=="dispatch":sent=true;return {"ok":true,"sent":data.items.size()}
		return {"ok":true}
func _initialize() -> void:run.call_deferred()
func run() -> void:
	create_timer(45).timeout.connect(func():push_error("Scanner UI timeout");quit(1))
	root.size=Vector2i(1917,991)
	var shell:=Shell.new();root.add_child(shell);await process_frame
	var fake:=FakeBridge.new();shell.add_child(fake);shell.set_meta("scanner_bridge",fake)
	shell._show_scanner_inventory();await process_frame;await process_frame
	var view:Node=shell.find_child("ScannerInventory",true,false)
	assert(view!=null);assert(fake.registers==0)
	assert(view.table.get_root().get_child(0).get_text(1)=="024000120")
	assert(shell.sidebar_panel.get_global_rect().encloses(shell.sidebar_buttons.exit.get_global_rect()))
	view.check_page(true);assert(view.selected.size()==7)
	view.chips.pressed.emit();await process_frame
	assert(view.table.get_root().get_child(0).get_text(1)=="89553000000000000120")
	assert(view.selected.size()==7)
	view.check_page(true);assert(view.selected.size()==14)
	view.set_mode("custom");assert(view.custom.visible);assert(view.review_button.disabled)
	view.custom.text="Laboratório fictício";view.update_selection();assert(not view.review_button.disabled)
	view.manual_dialog();await process_frame
	var manual:AcceptDialog=view.get_node("ManualWarehouseDialog")
	assert(fake.registers==0);assert(manual.borderless)
	if DisplayServer.get_name()!="headless":
		await create_timer(0.4).timeout;RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("cadastro-armazem.png"))
	manual.find_child("ItemNumber",true,false).text="invalid"
	manual.find_child("SaveManualItem",true,false).pressed.emit();await process_frame
	assert(is_instance_valid(manual));assert(fake.registers==1)
	manual.find_child("ItemNumber",true,false).text="89553000000000000123"
	manual.find_child("SaveManualItem",true,false).pressed.emit();await process_frame;await process_frame
	assert(fake.registers==2);assert(not is_instance_valid(manual))
	view.manual_dialog();await process_frame
	view.get_node("ManualWarehouseDialog").canceled.emit();await process_frame;await process_frame
	assert(root.find_child("WarehouseModalShade",true,false)==null)
	assert(fake.registers==2)
	view.set_mode("base");view.base.select(3);view.update_selection();view.select_kind("equipment");await process_frame
	assert(view.review_button.get_global_rect().end.y<=root.size.y)
	assert(view.table.get_global_rect().end.x<view.review_button.get_global_rect().position.x)
	if DisplayServer.get_name()!="headless":
		DisplayServer.warp_mouse(Vector2i(1,1));await create_timer(0.5).timeout;RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("armazem.png"))
	view.review_dispatch();await process_frame
	var dialog:ConfirmationDialog=null
	for child in view.get_children():
		if child is ConfirmationDialog:dialog=child
	assert(dialog!=null);assert(dialog.dialog_text.contains("14 item"));assert(not fake.sent)
	dialog.canceled.emit();assert(not fake.sent)
	await view.submit_dispatch({"items":view.selected.values()});assert(fake.sent);assert(view.selected.is_empty())
	view.selected["chip:89553000000000000120"]={"kind":"chip","number":"89553000000000000120"}
	fake.usage_fail=true;view.last_usage_check=-15000;await view.receive()
	assert(view.usage_status.text.contains("pendente"));assert(view.selected.size()==1)
	fake.usage_fail=false;fake.use_chip=true;fake.offline=true;view.last_usage_check=-15000;await view.receive()
	assert(view.selected.is_empty());assert(view.usage_status.text.contains("1 utilizado"))
	view.select_kind("movements");await process_frame
	assert(view.table.get_root().get_child(0).get_text(3)=="Utilizado • Araguaína")
	assert(view.table.get_root().get_child(0).get_tooltip_text(3).contains("024000555"))
	fake.use_chip=false;fake.paginated=true;view.select_kind("equipment");await process_frame
	assert(view.page_buttons.get_child_count()==4)
	view.page_buttons.get_child(2).pressed.emit();await process_frame;assert(view.page_index==2)
	view.go_page(0);await process_frame;view.clear_selection()
	for i in range(3):view.selected["equipment:02400012%d" % i]={"kind":"equipment","number":"02400012%d" % i}
	view.base.select(1);await view.refresh()
	if DisplayServer.get_name()!="headless":
		root.content_scale_size=Vector2i(1920,1088);root.content_scale_mode=Window.CONTENT_SCALE_MODE_CANVAS_ITEMS;root.size=Vector2i(1310,742)
		await create_timer(0.5).timeout;RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("armazem-referencia.png"))
	var checks:=fake.usage_calls
	shell._show_dashboard();await process_frame
	await create_timer(6).timeout;assert(fake.usage_calls==checks)
	shell.free();print("SCANNER_INVENTORY_UI_OK");quit()
