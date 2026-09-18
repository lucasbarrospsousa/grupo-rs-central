extends SceneTree
const Shell = preload("res://tests/fixtures/offline_main_dashboard.gd")
const Store = preload("res://src/inventory_store.gd")
const Batch = preload("res://src/ui/inventory_batch_search.gd")
class TestShell extends Shell:
	func _setup_integration_maintenance() -> void: pass
	func _setup_online_plate_sync() -> void: pass
	func _branch_supports_operational_apis() -> bool: return true
func _init() -> void:
	create_timer(60).timeout.connect(func(): push_error("Batch test timeout"); quit(1))
	run.call_deferred()
func run() -> void:
	root.size = Vector2i(1917, 1000)
	assert(Batch.parse("0241; 0241;\r\n0242;;").serials.size() == 2)
	assert(not Batch.parse("TST-003").active)
	for branch in ["imperatriz", "araguaina", "acailandia", "maraba"]:
		var store = Store.new()
		store.configure_isolated_sqlite_for_testing(ProjectSettings.globalize_path("user://batch.sqlite"), branch)
		store.load_db()
		for item in [["024553699", "Estoque"], ["024558974", "Instalado"], ["24553699", "Estoque"], ["0245536999", "Estoque"]]:
			store.upsert_product({"sku":item[0], "imei":item[0], "plate":"TST-003" if item[0]=="024553699" else "", "name":"Fictício", "tracker_status":item[1], "stock":1, "quantity":1})
		var before := JSON.stringify(store.get_products())
		var shell = TestShell.new();shell.store=store;shell.selected_branch_id=branch;shell.selected_branch_name=branch
		shell.online_data_available=true
		root.add_child(shell);await process_frame
		shell._show_list();await process_frame
		shell.selected_status_filter_key="all"
		shell.search_input.text="024553699;024558974;024563387;024553699"
		shell._submit_search();await process_frame
		assert(shell._filtered_products().size()==2, "Exact serial filter")
		assert(shell.batch_search_summary.text.contains("3 pesquisados"))
		assert(shell.batch_search_summary.text.contains("Não encontrados: 024563387"))
		shell._select_status_filter("estoque");await process_frame
		assert(shell._filtered_products().size()==1)
		assert(shell.batch_search_all_status.visible)
		assert(shell.batch_search_summary.text.contains("Ocultos pelo status: 024558974"))
		if DisplayServer.get_name()!="headless" and branch=="imperatriz":
			await create_timer(.4).timeout;RenderingServer.force_draw()
			root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("batch-search.png"))
			var clipboard := DisplayServer.clipboard_get()
			DisplayServer.clipboard_set("024553699\r\n024558974")
			shell.search_input.grab_focus()
			var paste := InputEventKey.new();paste.keycode=KEY_V;paste.ctrl_pressed=true;paste.pressed=true
			Input.parse_input_event(paste);await process_frame
			paste.pressed=false;Input.parse_input_event(paste)
			DisplayServer.clipboard_set(clipboard)
			assert(shell.search_input.text=="024553699;024558974", "Keyboard multiline paste")
		shell.batch_search_all_status.pressed.emit();await process_frame
		assert(shell._filtered_products().size()==2)
		shell.inventory_start_date="2099-01-01";shell._refresh_table()
		assert(shell._filtered_products().is_empty())
		assert(shell.batch_search_summary.text.contains("Ocultos pelo período"))
		shell.inventory_start_date=""
		shell.search_input.text="024553699\n024558974";assert(shell._filtered_products().size()==2)
		shell.search_input.text="TST-003";assert(shell._filtered_products().size()==1)
		assert(not shell.batch_search_summary.visible)
		shell._clear_search();assert(shell._filtered_products().size()==4)
		assert(JSON.stringify(store.get_products())==before, "Must not mutate stock")
		root.remove_child(shell);shell.queue_free();await process_frame
	print("BATCH_SEARCH_PASS: four branches, exact identifiers, duplicates, newlines, status/date, missing, normal search, no stock changes")
	quit()
