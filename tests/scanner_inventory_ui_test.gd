extends SceneTree
const Shell=preload("res://tests/fixtures/offline_main_dashboard.gd")
class FakeBridge extends Node:
	var offline:=false
	var syncs:=0
	var sent:=false
	func call_service(op:String,data:Dictionary={}) -> Dictionary:
		if op=="config":return {"ok":true,"config":{"url":"https://127.0.0.1:18843"}}
		if op=="list":
			var rows:=[]
			for i in range(7):
				rows.append({"kind":"equipment" if data.kind=="movements" else data.kind,"number":("02400012%d" % i) if data.kind!="chip" else ("8955300000000000012%d" % i),"received_at":1700000000,"state":"sent" if data.kind=="movements" else "available","destination":"Marabá","note":"Demonstração fictícia","sent_at":1700000000})
			return {"ok":true,"total":7,"page":0,"counts":{"equipment":7,"chip":7,"sent_today":2},"rows":rows}
		if op=="sync":
			syncs+=1
			return {"ok":false,"error":"Sem rede (teste)"} if offline else {"ok":true,"added":1,"received":1,"ack_pending":0}
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
	assert(view!=null);assert(fake.syncs==1)
	assert(view.table.get_root().get_child(0).get_text(1)=="024000120")
	assert(shell.sidebar_panel.get_global_rect().encloses(shell.sidebar_buttons.exit.get_global_rect()))
	view.check_page(true);assert(view.selected.size()==7)
	view.chips.pressed.emit();await process_frame
	assert(view.table.get_root().get_child(0).get_text(1)=="89553000000000000120")
	assert(view.selected.size()==7)
	view.check_page(true);assert(view.selected.size()==14)
	view.set_mode("custom");assert(view.custom.visible);assert(view.review_button.disabled)
	view.custom.text="Laboratório fictício";view.update_selection();assert(not view.review_button.disabled)
	fake.offline=true;await view.receive();assert(view.connection_status.text.contains("reconexão"));assert(not view.retry.is_stopped())
	fake.offline=false;view.retry.timeout.emit();await process_frame;assert(view.connection_status.text.contains("conectado"))
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
	var syncs:=fake.syncs;shell._show_dashboard();await process_frame
	await create_timer(6).timeout;assert(fake.syncs==syncs)
	shell.free();print("SCANNER_INVENTORY_UI_OK");quit()
