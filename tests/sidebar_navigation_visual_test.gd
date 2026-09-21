extends SceneTree
const Shell = preload("res://tests/fixtures/offline_main_dashboard.gd")

func _initialize() -> void:
	run.call_deferred()

func run() -> void:
	create_timer(35).timeout.connect(func(): push_error("Sidebar timeout"); quit(1))
	root.size = Vector2i(1917, 991)
	var shell := Shell.new()
	root.add_child(shell)
	await process_frame
	assert(shell.sidebar_equipment_children.get_child_count() == 3)
	assert(shell.sidebar_tracking_children.get_child_count() == 3)
	assert(not shell.sidebar_buttons.maintenance_visits.get_meta("sidebar_child"))
	assert(shell.find_child("SidebarEquipmentGuide", true, false) == null)
	var footer_y: float = shell.sidebar_buttons.exit.get_global_rect().position.y
	for section in ["inventory", "consult", "records", "route", "maintenance_visits", "bulk"]:
		shell._set_page_context(section, "Navegação • prévia local")
		await process_frame
		assert(shell.sidebar_buttons[section].is_visible_in_tree())
		assert(shell.sidebar_panel.get_global_rect().encloses(shell.sidebar_buttons.exit.get_global_rect()))
		assert(absf(shell.sidebar_buttons.exit.get_global_rect().position.y - footer_y) < 1)
		if section in ["consult", "records", "route"]:
			assert(shell.sidebar_tracking_expanded and not shell.sidebar_equipment_expanded)
			assert(shell.topbar_subtitle_label.text.contains("Rastreamento"))
		if section in ["inventory", "bulk"]:
			assert(shell.sidebar_equipment_expanded and not shell.sidebar_tracking_expanded)
		if DisplayServer.get_name() != "headless" and section in ["inventory", "records"]:
			RenderingServer.force_draw()
			root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("sidebar-" + section + ".png"))
	shell._toggle_sidebar_equipment_group()
	assert(not shell.sidebar_equipment_expanded)
	shell._set_page_context("stock_link", "Vinculação")
	assert(shell.sidebar_equipment_expanded)
	shell.free()
	print("SIDEBAR_NAVIGATION_OK: grouping, automatic expansion, labels and anchored footer")
	quit()
