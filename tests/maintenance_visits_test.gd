extends SceneTree
const Service = preload("res://src/services/maintenance_visits.gd")
const View = preload("res://src/ui/maintenance_visits.gd")
const Shell = preload("res://tests/fixtures/offline_main_dashboard.gd")
const Store = preload("res://src/inventory_store.gd")
class FakeService extends Service:
	var fail := false
	var delay := false
	func clients(_q: String, _branch: String) -> Dictionary:
		if delay: await get_tree().create_timer(0.05).timeout
		if fail: return {"ok": false, "message": "Falha simulada"}
		return {"ok": true, "clients": [{"id": "1", "name": "Cliente fictício"}]}
	func vehicles(_id: String, _branch: String) -> Dictionary:
		if fail: return {"ok": false, "message": "Falha simulada"}
		if _id == "2": return normalize_vehicles([{"placa": "DEM3C45", "equipamento": "024000303"}])
		if _id == "3": return normalize_vehicles([{"placa": "DEM3C45"}])
		return normalize_vehicles([{"placa": "DEM1A23", "equipamento": "024000101"}, {"placa": "DEM2B34", "equipamento": "024000202"}])
func _init() -> void:
	create_timer(60).timeout.connect(func(): push_error("Maintenance timeout"); quit(1))
	run.call_deferred()
func run() -> void:
	root.size = Vector2i(1917, 995)
	var store := Store.new()
	store.configure_isolated_sqlite_for_testing(ProjectSettings.globalize_path("user://visits.sqlite"))
	store.load_db()
	var item := {"client": "Cliente fictício", "plate": "DEM1A23", "serial": "024000101", "reason": "Sem comunicação", "status": "pendente"}
	assert(store.save_maintenance_visit(item).ok)
	assert(store.save_maintenance_visit(item).ok)
	assert(store.get_maintenances(true).size() == 2)
	var saved: Dictionary = store.get_maintenances(true)[0]
	saved.client = "Não substituir"
	saved.status = "concluido"
	assert(not store.save_maintenance_visit(saved).ok)
	saved.solution = "Reparo confirmado"
	assert(store.save_maintenance_visit(saved).ok)
	store.reload_db_from_disk()
	assert(store.get_maintenances(true)[0].client == "Cliente fictício")
	assert(Service.normalize_vehicles([]).ok)
	assert(not Service.normalize_vehicles({}).ok)
	assert(not Service.normalize_vehicles([{"placa": "ABC1234"}, {"placa": "ABC-1234"}]).ok)
	assert(Service.normalize_vehicles([{"placa": "ABC1234", "equipamento": 24000101}]).vehicles[0].serial == "")
	var host := Shell.new()
	root.add_child(host)
	await process_frame
	host.store = store
	host.selected_branch_id = "imperatriz"
	host.current_section = "maintenance_visits"
	host.online_data_available = true
	host._set_page_context("maintenance_visits", "Manutenções", "Histórico de retornos, diagnósticos e soluções")
	host._set_content_margins(44, 28, 44, 24)
	var view := View.new()
	view.setup(host, FakeService.new())
	host._set_content(view)
	view.show_form()
	view.search.text = "Cliente"
	view.timer.stop()
	await view.find_clients()
	await view.choose_client({"id": "1", "name": "Cliente fictício"})
	assert(view.vehicle.item_count == 3)
	view.vehicle.select(2)
	view.select_vehicle(2)
	assert(view.device.text == "024000202")
	view.search.text = "Outro"
	view.search.text_changed.emit(view.search.text)
	view.timer.stop()
	assert(view.device.text == "" and view.save_button.disabled)
	await view.choose_client({"id": "2", "name": "Um veículo"})
	assert(view.vehicle.item_count == 2 and view.vehicle.selected == 0)
	await view.choose_client({"id": "3", "name": "Sem aparelho"})
	view.vehicle.select(1)
	view.select_vehicle(1)
	assert(view.save_button.disabled)
	view.service.fail = true
	await view.choose_client({"id": "1", "name": "Falha"})
	assert(view.device.text == "" and view.save_button.disabled)
	view.service.fail = false
	view.service.delay = true
	view.find_clients()
	view.search.text = "Resposta antiga"
	view.search.text_changed.emit(view.search.text)
	view.timer.stop()
	await create_timer(0.1).timeout
	assert(view.picker.get_child_count() == 0)
	view.service.delay = false
	await view.choose_client({"id": "1", "name": "Cliente fictício"})
	view.vehicle.select(1)
	view.select_vehicle(1)
	view.reason.select(1)
	view.save()
	assert(store.get_maintenances(true).size() == 3)
	await process_frame
	await process_frame
	if DisplayServer.get_name() != "headless":
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("maintenance-cards.png"))
		view.show_form()
		await view.choose_client({"id": "1", "name": "Cliente fictício"})
		view.vehicle.select(1)
		view.select_vehicle(1)
		await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("maintenance-form.png"))
	host.free()
	print("MAINTENANCE_VISITS PASS: repeated visits, immutable identity, completion validation, persistence, linkage selection")
	quit()
