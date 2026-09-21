extends SceneTree
const Shell=preload("res://tests/fixtures/offline_main_dashboard.gd")
class FakeBridge extends Node:
	func call_service(op:String,data:Dictionary={}) -> Dictionary:
		if op=="list":return {"ok":true,"total":1,"counts":{"equipment":1,"chip":1},"rows":[{"number":"024000123" if data.kind=="equipment" else "89553000000000000123","received_at":1700000000}]}
		if op=="sync":return {"ok":true,"added":1,"received":1,"ack_pending":0}
		return {"ok":true}
func _initialize() -> void:run.call_deferred()
func run() -> void:
	create_timer(30).timeout.connect(func():push_error("Scanner UI timeout");quit(1))
	root.size=Vector2i(1917,991)
	var shell:=Shell.new();root.add_child(shell);await process_frame
	var fake:=FakeBridge.new();shell.add_child(fake);shell.set_meta("scanner_bridge",fake)
	shell._show_scanner_inventory();await process_frame;await process_frame
	var view:Node=shell.find_child("ScannerInventory",true,false)
	assert(view!=null)
	assert(view.table.get_root().get_child(0).get_text(0)=="024000123")
	assert(shell.sidebar_panel.get_global_rect().encloses(shell.sidebar_buttons.exit.get_global_rect()))
	view.chips.pressed.emit();await process_frame
	assert(view.table.get_root().get_child(0).get_text(0)=="89553000000000000123")
	await view.receive()
	assert(view.status.text.contains("1 novos"))
	if DisplayServer.get_name()!="headless":
		await process_frame;RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("scanner-inventory.png"))
	shell.free();print("SCANNER_INVENTORY_UI_OK");quit()
