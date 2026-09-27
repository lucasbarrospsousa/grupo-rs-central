extends SceneTree
const Service = preload("res://src/services/hub_maintenance.gd")
const View = preload("res://src/ui/hub_maintenance.gd")
class Shell extends "res://src/inventory_dashboard.gd":
	func _ready() -> void: pass
	func _process(_delta: float) -> void: pass
	func _auto_start_branch_preview_sync() -> void: pass
	func _hub_maintenance_credentials(_id: String) -> Dictionary: return {}

func _initialize() -> void: run.call_deferred()
func run() -> void:
	create_timer(30).timeout.connect(func(): push_error("Hub test timeout"); quit(1))
	assert(Service.ORIGINS.acailandia == "https://acl.ogrupors.com.br")
	assert(Service.ORIGINS.maraba == "https://mab.ogrupors.com.br")
	var first := Service.new()
	var second := Service.new()
	first.cookies["session"] = "synthetic"
	assert(second.cookies.is_empty())
	first.free()
	second.free()
	var table := '<h2>Veiculos (1)</h2><table><tbody><tr><td>CLIENTE DEMO</td><td>DEM-0001</td><td>024000001</td><td>demo</td><td></td><td>21/09/2026</td></tr></tbody></table>'
	assert(Service.parse(table).ok)
	assert(Service.parse(table).rows[0].serial == "024000001")
	assert(not Service.parse(table.replace('(1)', '(2)')).ok)
	assert(not Service.parse('<html>Login</html>').ok)
	assert(not Service.parse(table + '<input type="password">').ok)
	assert(Service.parse('<h2>Veiculos (0)</h2><tbody></tbody>').ok)
	assert(Service.color_for(4, [4,4,8]) == Service.color_for(4, [4,8]))
	assert(Service.color_for(0,[0]) == Color('#20ad66'))
	root.size = Vector2i(1917,991)
	root.gui_embed_subwindows = true
	var shell := Shell.new()
	root.add_child(shell)
	shell.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var view:=View.new()
	view.custom_minimum_size=Vector2(1400,320)
	shell.add_child(view)
	# Prevent deferred network work; all rows and counts below are synthetic.
	view.credentials_for = Callable()
	var index := 1
	for id in View.BASES:
		var rows: Array = []
		for number in range(index * 120):
			rows.append({"client":"CLIENTE DEMONSTRAÇÃO %d" % number, "plate":"DEM-%04d" % number, "serial":"024%06d" % number, "apn":"demo" if number % 2 == 0 else "outro", "phone":"(00) 00000-0000", "updated_at":"21/09/2026 12:00"})
		view.results[id] = {"ok":true,"count":rows.size(),"rows":rows,"source":"DADOS FICTÍCIOS", "queried_at":"21/09/2026 12:00"}
		index += 1
	view.render()
	view.summary.text = "Demonstração visual • números e registros fictícios"
	await process_frame
	await process_frame
	assert(root.get_visible_rect().encloses(view.get_global_rect()))
	assert(view.bars.imperatriz.bar.anchor_right == 1.0)
	assert(view.bars.acailandia.bar.anchor_right == 0.25)
	assert(view.bars.imperatriz.bar.tooltip_text.contains("480"))
	if DisplayServer.get_name() != "headless":
		RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("hub-maintenance.png"))
	view.credentials_for = func(_id): return {}
	view.bars.imperatriz.bar.pressed.emit()
	assert(view.active_branch == "imperatriz")
	view.list_search.text = "DEM-0001"
	view.populate_list()
	assert(view.filtered_rows.size() == 1)
	assert(view.list_rows.get_children().filter(func(item): return item.has_meta("vehicle_row")).size() == 1)
	view.list_search.text = ""
	view.populate_list()
	assert(view.filtered_rows.size() == 480)
	assert(view.list_rows.get_children().filter(func(item): return item.has_meta("vehicle_row")).size() == View.PAGE_SIZE)
	assert(view.list_rows.get_child(0).has_meta("apn_group"))
	assert(view.list_rows.get_child(0).get_meta("group_count") == 240)
	view.list_apn.select(1)
	view.list_apn.item_selected.emit(1)
	assert(view.filtered_rows.size() == 240)
	view.list_apn.select(0)
	view.populate_list()
	view.list_pages.get_child(view.list_pages.get_child_count()-1).pressed.emit()
	assert(view.page == 1)
	view.list_base.select(0)
	view.list_base.item_selected.emit(0)
	assert(view.active_branch == "" and view.page == 0)
	assert(view.filtered_rows.size() == 1200)
	view.list_search.text = "DEM-0001"
	view.populate_list()
	assert(view.filtered_rows.size() == 4)
	view.show_details(view.filtered_rows[2])
	assert(view.detail_dialog.title.contains("DEM-0001"))
	view.detail_dialog.free()
	var vehicle_line: Control = view.list_rows.get_children().filter(func(item): return item.has_meta("vehicle_row"))[0]
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	vehicle_line.gui_input.emit(click)
	assert(is_instance_valid(view.detail_dialog))
	view.detail_dialog.free()
	view.list_search.text = ""
	view.populate_list()
	await process_frame
	await process_frame
	assert(view.list_pages.get_global_rect().end.y < view.list_dialog.size.y)
	if DisplayServer.get_name() != "headless":
		RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("hub-maintenance-list.png"))
	view.results.imperatriz = {"ok":false,"message":"Consulta pendente"}
	view.render()
	assert(view.list_status.text.contains("Consulta parcial"))
	assert(view.filtered_rows.size() == 720)
	# Empty fixture credentials exercise refresh failure without any HTTP request.
	await view.load_all()
	assert(not view.busy and view.filtered_rows.is_empty())
	assert(view.list_status.text.contains("Pendentes:"))
	assert(view.list_rows.get_child(0).text.contains("Lista indisponível"))
	view.list_dialog.free()
	assert(view.bars.imperatriz.number.text == "—")
	assert(view.bars.imperatriz.bar.disabled)
	assert(view.bars.maraba.bar.disabled)
	shell.queue_free()
	await process_frame
	await process_frame
	RenderingServer.force_draw()
	print("HUB_MAINTENANCE_OK: parsing, complete totals, ties, failures, click, filters and layout")
	quit()
