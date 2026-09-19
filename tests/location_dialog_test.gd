extends SceneTree
const Dialog = preload("res://src/ui/location_dialog.gd")
const Dashboard = preload("res://src/inventory_dashboard.gd")
class FakeHost extends Control:
	var selected_branch_id := "imperatriz"
	var next: Dictionary = {}
	var calls := 0
	var delay := 0.0
	var client_calls := 0
	var client_name := "Cliente web"
	func _complete_location_client(data: Dictionary, web_only: bool = false) -> Dictionary:
		assert(web_only)
		client_calls += 1
		await get_tree().create_timer(0.1).timeout
		data.client = client_name
		return data
	func _location_ignition_state(value: Variant) -> int:
		if value == null or str(value) == "": return -1
		return 1 if str(value).to_lower() in ["1", "true", "ligada"] else 0
	func _lookup_grupo_rs_location(_serial: String, _progress: Callable, _source: String, _plate: String, _client: String) -> Dictionary:
		calls += 1
		if delay > 0: await get_tree().create_timer(delay).timeout
		return next

func _init() -> void:
	create_timer(35).timeout.connect(func(): push_error("Location test timeout"); quit(1))
	run.call_deferred()

func run() -> void:
	root.size = Vector2i(1610, 977)
	root.gui_embed_subwindows = true
	assert(Dialog.voltage("") == "Não informado")
	assert(Dialog.voltage("0") == "0 V")
	assert(Dialog.voltage("12,6") == "12,6 V")
	assert(Dialog.voltage("80%") == "80%")
	assert(not Dialog.valid_coordinates({"lat": "bad", "lng": 12}))
	assert(not Dialog.valid_coordinates({"lat": 99, "lng": 12}))
	assert(not Dialog.valid_coordinates({"lat": 0, "lng": 0}))
	var dashboard := Dashboard.new()
	var normalized: Dictionary = dashboard._grupo_rs_api_normalize_location({"latitude": -5.5266, "longitude": -47.4797, "bateria": "12.6", "bateriaExterna": "4.1", "bateriaInterna": "80%"})
	assert(normalized.battery_voltage == "12.6" and normalized.external_battery == "4.1")
	var adapted: Dictionary = dashboard._grupo_rs_api_location_result("000000001", "ABC1D23", "Demonstração", {"lat": -5.5266, "lng": -47.4797, "battery_voltage": "12.6", "external_battery": "4.1"})
	assert(adapted.battery_voltage == "12.6" and adapted.external_battery == "4.1")
	dashboard.free()
	var host := FakeHost.new()
	root.add_child(host)
	host.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var data := {"ok": true, "lat": -5.5266, "lng": -47.4797, "client": "Cliente de demonstração", "plate": "ABC1D23", "serial": "000000001", "updated_at": "2026-09-19 09:10:41", "ignition": 1, "battery_voltage": "12.6", "external_battery": "4.1", "source": "grupo_rs_api"}
	var dialog := Dialog.new()
	dialog.network_enabled = false
	dialog.open(host, data)
	await process_frame
	assert(dialog.values.ignition.text == "Ligada")
	assert(not dialog.values.has("external_battery"))
	assert(dialog.map.pixel(dialog.map.world(data)).distance_to(dialog.map.size / 2) < 1)
	var initial_zoom: int = dialog.map.zoom
	dialog.map.change_zoom(1)
	assert(dialog.map.zoom == initial_zoom + 1)
	assert(dialog.map.pixel(dialog.map.world(data)).distance_to(dialog.map.size / 2) < 1)
	var down := InputEventMouseButton.new()
	down.button_index = MOUSE_BUTTON_LEFT
	down.pressed = true
	dialog.map._gui_input(down)
	var move := InputEventMouseMotion.new()
	move.relative = Vector2(60, 30)
	dialog.map._gui_input(move)
	down.pressed = false
	dialog.map._gui_input(down)
	assert(dialog.map.pixel(dialog.map.world(data)).distance_to(dialog.map.size / 2 + move.relative) < 1)
	dialog.map.fit_route()
	assert(dialog.map.pixel(dialog.map.world(data)).distance_to(dialog.map.size / 2) < 1)
	host.next = {"ok": false}
	await dialog.refresh()
	assert(dialog.location.plate == "ABC1D23" and dialog.feedback.text.contains("anterior"))
	host.next = data.duplicate(true)
	host.next.ignition = 0
	host.next.erase("external_battery")
	await dialog.refresh()
	assert(dialog.values.ignition.text == "Desligada" and not dialog.values.has("external_battery"))
	var missing_client := data.duplicate(true)
	missing_client.client = ""
	missing_client.client_lookup_status = "unavailable"
	dialog.apply_location(missing_client)
	assert(dialog.values.client.text == "Consulta indisponível")
	missing_client.client_lookup_status = "not_returned"
	dialog.apply_location(missing_client)
	assert(dialog.values.client.text == "Não retornado pela origem")
	host.selected_branch_id = "maraba"
	var calls := host.calls
	await dialog.refresh()
	assert(host.calls == calls)
	host.selected_branch_id = "imperatriz"
	host.delay = 0.1
	create_timer(0.03).timeout.connect(func(): host.selected_branch_id = "maraba")
	await dialog.refresh()
	assert(dialog.feedback.text.contains("descartado"))
	host.selected_branch_id = "imperatriz"
	host.delay = 0.0
	var pending := data.duplicate(true)
	pending.client = ""
	dialog.apply_location(pending)
	assert(dialog.values.client.text == "Consultando…" and not dialog.refresh_button.disabled)
	await create_timer(0.15).timeout
	assert(dialog.values.client.text == "Cliente web" and dialog.location.client == "Cliente web")
	var client_calls := host.client_calls
	dialog.apply_location(data)
	assert(host.client_calls == client_calls + 1)
	assert(dialog.values.client.text == "Consultando…" and dialog.location.client == "")
	await create_timer(0.15).timeout
	assert(dialog.values.client.text == "Cliente web")
	var confirmed_portal := data.duplicate(true)
	confirmed_portal.source = "grupo_rs_platform"
	dialog.apply_location(pending)
	dialog.apply_location(confirmed_portal)
	await create_timer(0.15).timeout
	assert(dialog.values.client.text == data.client)
	dialog.apply_location(pending)
	host.selected_branch_id = "maraba"
	await create_timer(0.15).timeout
	assert(dialog.values.client.text == "Consulta indisponível")
	host.selected_branch_id = "imperatriz"
	dialog.apply_location(data)
	dialog.feedback.text = "Arraste o mapa para mover • Use a roda do mouse para zoom"
	await process_frame
	assert(dialog.size.x <= root.size.x and dialog.size.y <= root.size.y)
	assert(dialog.feedback.get_global_rect().end.y <= dialog.size.y)
	# Optional public-tile smoke: only the fictitious point above, never a live account.
	if OS.get_environment("GRUPO_RS_LOCATION_TILE_SMOKE") == "1":
		dialog.map.network_enabled = true
		await dialog.map.load_visible()
		assert(not dialog.map.tiles.is_empty())
		assert(dialog.map.status == "")
		print("LOCATION_PUBLIC_TILES: PASS | OpenStreetMap viewport loaded at fictitious position")
	if DisplayServer.get_name() != "headless":
		await process_frame
		RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("location-dialog.png"))
	host.delay = 0.15
	dialog.apply_location(pending)
	dialog.refresh()
	dialog.queue_free()
	await create_timer(0.25).timeout
	host.queue_free()
	print("LOCATION_DIALOG_TEST: PASS | mapping, missing values, ignition, projection, pan, zoom, refresh failure, branch isolation, close during refresh")
	quit()
