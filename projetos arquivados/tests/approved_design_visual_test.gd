extends SceneTree
const Shell := preload("res://tests/fixtures/offline_main_dashboard.gd")
const Store := preload("res://src/inventory_store.gd")

func _init() -> void:
	call_deferred("_run")

func _run() -> void:
	root.size = Vector2i(1920, 1080)
	root.content_scale_size = Vector2i(1920, 1080)
	var store := Store.new()
	store.configure_isolated_sqlite_for_testing(ProjectSettings.globalize_path("user://design.sqlite"), "imperatriz")
	store.load_db()
	for i in range(6):
		store.upsert_product({"sku":"099900%03d" % i,"imei":"099900%03d" % i,"plate":"TST-%03d" % i,"tracker_status":"Estoque","stock":1,"quantity":1,"model":"RS Novo","operator":"Vivo" if i % 2 == 0 else "Claro"})
	var shell := Shell.new()
	var reserved: Dictionary = store.get_products()[0].duplicate(true)
	reserved["tracker_status"] = "Reserva"
	store.upsert_product(reserved)
	shell.store = store
	shell.online_data_available = true
	root.add_child(shell)
	await process_frame
	assert(not shell.has_method("_build_legacy_dashboard_view"))
	assert(not shell.has_method("_build_legacy_form_view"))
	var before := JSON.stringify(store.get_products())
	shell._show_dashboard()
	await create_timer(0.5).timeout
	assert(shell.content_area.get_child_count() == 1, "Navigation must mount one view, never overlay the old one")
	var approved := shell.find_child("ApprovedDashboard", true, false)
	assert(approved != null, "Home navigation must mount the new dashboard")
	var stock_card := shell.find_child("Metric_available", true, false) as Button
	assert(stock_card != null)
	var resting_position := stock_card.position
	stock_card.mouse_entered.emit()
	await create_timer(0.4).timeout
	assert(stock_card.scale.y > 1.0)
	assert(stock_card.position == resting_position)
	stock_card.mouse_exited.emit()
	await create_timer(0.3).timeout
	assert(stock_card.scale.is_equal_approx(Vector2.ONE))
	stock_card.pressed.emit()
	await create_timer(0.5).timeout
	assert(shell.current_section == "inventory", "Card must open stock through the existing route")
	assert(shell.content_area.get_child_count() == 1)
	assert(shell.find_child("ApprovedDashboard", true, false) == null, "Previous dashboard must be removed on navigation")
	assert(shell._filtered_products().size() == 5)
	shell.selected_status_filter_key = "all"
	print("DESIGN_NAVIGATION_OK: home -> stock card, single mounted view, old builders absent")
	for page in ["inicio","estoque","novo","edicao","sms","relatorio","cadastro","config"]:
		var view: Control
		match page:
			"cadastro":
				shell._set_page_context("bulk", "Cadastro em massa", "Preparação e revisão")
				view = shell._build_bulk_registration_view()
			"config":
				shell._set_page_context("settings", "Configurações", "Conexões e ambiente")
				shell.config_selected_section = "connections"
				view = shell._build_arya_config_view()
			"inicio":
				shell._set_page_context("dashboard", "Visão geral da operação", "Estoque, equipamentos e rotina da filial")
				view = shell._build_dashboard_view()
			"estoque":
				shell._set_page_context("inventory", "Estoque de equipamentos", "Cadastro, disponibilidade e situação dos rastreadores")
				view = shell._build_list_view()
			"novo":
				shell._set_page_context("inventory", "Novo equipamento", "Dados cadastrais e integrações do rastreador")
				view = shell._build_form_view("")
			"edicao":
				shell._set_page_context("inventory", "Reentrada de equipamento", "Dados cadastrais e integrações do rastreador")
				view = shell._build_form_view("099900001")
			"sms":
				shell._set_page_context("sms_panel", "Painel SMS", "Controle de envios e consumo")
				view = shell._build_sms_panel_view()
			"relatorio":
				shell._set_page_context("inventory", "Relatório de equipamentos", "Conteúdo e pré-visualização")
				shell.inventory_report_products = store.get_products()
				view = shell._build_inventory_report_builder()
		shell._set_content_margins(44, 38, 44, 38)
		shell._set_content(view)
		if page == "config":
			assert(view.name == "ApprovedSettingsView")
			assert(shell.find_child("ApiSessionGrid", true, false) != null)
			assert(_labels(view).contains("Ambiente da operação"))
		if page == "cadastro":
			assert(is_instance_valid(shell.bulk_text_edit))
			assert(is_instance_valid(shell.bulk_preview_body))
			shell.bulk_text_edit.text = "024000001\n024000002\n024000001"
			shell._preview_bulk_registration_text(shell.bulk_text_edit.text)
			assert(int(shell.bulk_last_analysis.get("duplicate_count", 0)) == 1)
			assert(shell.bulk_last_analysis.get("clean_rows", []).size() == 2)
			assert(shell.bulk_preview_body.get_child_count() > 0)
			print("DESIGN_BULK_OK: preview renders two unique rows, duplicate identified, no registration")
		if page == "estoque":
			shell._refresh_table()
			assert(shell.table_body.get_child_count() > 0, "Stock capture must contain real fixture rows")
		if page in ["novo", "edicao"]:
			assert(shell.form_options.has("tracker_status") and shell.form_options.has("model"))
			shell._set_option_value(shell.form_options.get("tracker_status"), "Reserva")
			shell.form_fields["plate"].text = "TST-9A99"
			shell._update_form_summary()
			assert("Reserva" in shell.form_summary_label.text and "TST" in shell.form_summary_label.text)
		if page == "relatorio":
			shell.inventory_report_option_buttons["operators"].button_pressed = false
			assert(not _labels(shell.inventory_report_preview_host).contains("Distribuição por operadora"))
			shell.inventory_report_option_buttons["operators"].button_pressed = true
			assert(_labels(shell.inventory_report_preview_host).contains("Distribuição por operadora"))
			shell._select_inventory_report_format("xlsx")
			assert(_labels(shell.inventory_report_preview_host).contains("XLSX"))
			shell._change_inventory_report_zoom(0.1)
			assert(is_equal_approx(shell.inventory_report_zoom, 1.1))
			assert(shell.inventory_report_preview_host.get_child_count() == 1)
			print("DESIGN_REPORT_OK: sections, format, zoom, single preview document")
		await create_timer(0.5).timeout
		if page == "inicio":
			assert(not _labels(view).contains("Equipamentos da filial"))
			assert(not _labels(view).contains("Atenção da central"))
			var hub_scroll := view as ScrollContainer
			assert(hub_scroll != null)
			assert(hub_scroll.get_v_scroll_bar().max_value <= hub_scroll.get_v_scroll_bar().page, "Hub should fit at 1920x1080")
		if page == "estoque":
			var groups := shell.find_children("InventoryRowActions", "HFlowContainer", true, false)
			assert(not groups.is_empty())
			for group in groups:
				for action in group.get_children():
					assert(action.position.x + action.size.x <= group.size.x + 1.0, "Action cropped horizontally")
					assert(action.position.y + action.size.y <= group.size.y + 1.0, "Action cropped vertically")
		assert(view.position.y >= 38, "Animation must preserve container top margin")
		if DisplayServer.get_name() != "headless":
			RenderingServer.force_draw()
			var destination := OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("design-" + page + ".png")
			assert(root.get_texture().get_image().save_png(destination) == OK)
		print("DESIGN_VIEW_OK: ", page)
	assert(JSON.stringify(store.get_products()) == before, "Visual navigation and draft edits must not mutate stock")
	root.remove_child(shell)
	shell.queue_free()
	await process_frame
	quit(0)

func _labels(node: Node) -> String:
	var result := str(node.text) if node is Label else ""
	for child in node.get_children(): result += "\n" + _labels(child)
	return result
