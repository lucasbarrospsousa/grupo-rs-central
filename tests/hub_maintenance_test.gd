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
	shell._show_branch_selector()
	var view: PanelContainer = shell.find_child("HubMaintenance", true, false)
	# Prevent deferred network work; all rows and counts below are synthetic.
	view.credentials_for = Callable()
	var index := 1
	for id in View.BASES:
		var rows: Array = []
		for number in range(index * 120):
			rows.append({"client":"CLIENTE DEMONSTRAÇÃO %d" % number, "plate":"DEM-%04d" % number, "serial":"024%06d" % number, "apn":"demo" if number % 2 == 0 else "outro", "phone":"", "updated_at":"21/09/2026 12:00"})
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
	view.bars.imperatriz.bar.pressed.emit()
	assert(view.active_branch == "imperatriz")
	view.list_search.text = "DEM-0001"
	view.populate_list()
	assert(view.list_tree.get_root().get_child_count() == 1)
	view.list_search.text = ""
	view.populate_list()
	assert(view.list_tree.get_root().get_child_count() == 480)
	view.list_apn.select(1)
	view.list_apn.item_selected.emit(1)
	assert(view.list_tree.get_root().get_child_count() == 240)
	view.list_apn.select(0)
	view.populate_list()
	await process_frame
	if DisplayServer.get_name() != "headless":
		RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("hub-maintenance-list.png"))
	view.list_dialog.free()
	view.results.imperatriz = {"ok":false,"message":"Consulta pendente"}
	view.render()
	assert(view.bars.imperatriz.number.text == "—")
	assert(view.bars.imperatriz.bar.disabled)
	assert(view.bars.maraba.bar.anchor_right == 1.0)
	shell.queue_free()
	await process_frame
	await process_frame
	RenderingServer.force_draw()
	print("HUB_MAINTENANCE_OK: parsing, complete totals, ties, failures, click, filters and layout")
	quit()
