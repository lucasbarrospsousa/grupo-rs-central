extends SceneTree
const View = preload("res://src/ui/stock_link.gd")
class Shell extends "res://tests/fixtures/offline_main_dashboard.gd":
	func _process(_delta: float) -> void: pass
	func _set_content(control: Control, _allow_offline: bool = false) -> void:
		for child in content_area.get_children(): content_area.remove_child(child); child.queue_free()
		content_area.add_child(control)
	func _grupo_rs_api_get(_path: String, _retry: bool = true, _force: bool = false) -> Dictionary:
		assert(false, "UI preview must not contact API")
		return {}
class Store extends "res://src/inventory_store.gd":
	func _init() -> void:
		_loaded = true
		_db = {"products": [], "movements": [], "system_logs": []}
		for i in range(6):
			var state := "Manutenção" if i in [1, 4] else "Reserva"
			_db.products.append({"sku": "00000010%d" % i, "imei": "00000010%d" % i, "status": state, "tracker_status": state, "model": "V7.3.2", "plate": "", "stock": 0})
		_db.products.append({"sku":"000000999", "imei":"000000999", "status":"Instalado", "tracker_status":"Instalado", "model":"V7.3.2"})
	func reload_db_from_disk() -> Dictionary: return _db

func _init() -> void:
	create_timer(30).timeout.connect(func(): print("STOCK_LINK_UI_TIMEOUT"); quit(2))
	run.call_deferred()
func run() -> void:
	root.size = Vector2i(1917, 991)
	root.content_scale_size = Vector2i(1917, 991)
	root.gui_embed_subwindows = true
	var shell := Shell.new()
	shell.store = Store.new()
	shell.selected_branch_id = "imperatriz"
	shell.selected_branch_name = "Imperatriz"
	root.add_child(shell)
	await process_frame
	shell._show_stock_link()
	await process_frame
	var view: View = shell.content_area.get_child(0)
	if view.rows.get_child_count() != 6:
		for p in shell.store.get_products(): print("SYNTHETIC_STATUS=", p.get("tracker_status"), " eligible=", preload("res://src/services/stock_link.gd").eligible(p))
		print("FILTER=",view.filter," SEARCH=",view.search.text)
		quit(1)
		return
	view.search.text = "101"
	view.render_rows()
	assert(view.rows.get_child_count() == 1)
	view.search.text = ""
	view.filter = "Reserva"
	view.render_rows()
	assert(view.rows.get_child_count() == 4)
	view.filter = "Todos"
	view.choose("000000100")
	view.plate.text = "GRS - 021"
	view.review()
	assert(view.confirmation.visible)
	assert(view.confirmation.dialog_text.contains("RS300"))
	await process_frame
	await process_frame
	if DisplayServer.get_name() != "headless":
		RenderingServer.force_draw()
		assert(root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("stock-link-confirmation.png")) == OK)
	view.confirmation.hide()
	var service := shell._stock_link_service()
	service.busy = true
	assert(shell._sidebar_branch_switch_busy())
	service.busy = false
	assert(view.submit.get_global_rect().end.y < root.size.y)
	view.set_busy(true)
	assert(view.search.has_theme_stylebox("read_only"))
	assert(view.submit.has_theme_stylebox_override("disabled"))
	view.show_progress("Confirmando série, identificação e titular na plataforma…")
	await process_frame
	await process_frame
	if DisplayServer.get_name() != "headless":
		RenderingServer.force_draw()
		assert(root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("stock-link-busy.png")) == OK)
	view.set_busy(false)
	view.feedback.hide()
	await process_frame
	await process_frame
	if DisplayServer.get_name() != "headless":
		RenderingServer.force_draw()
		var output := OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("stock-link-1917x1018.png")
		assert(root.get_texture().get_image().save_png(output) == OK)
		print("STOCK_LINK_SCREENSHOT=" + output)
	assert(shell.offline_external_calls == 0)
	shell.free()
	print("STOCK_LINK_UI_TEST PASS: eligible list, search, filters, review, no writes, branch guard")
	quit()
