extends SceneTree

const Dashboard := preload("res://tests/fixtures/offline_inventory_dashboard.gd")

func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var dashboard := Dashboard.new()
	root.add_child(dashboard)
	await process_frame
	var input := LineEdit.new()
	dashboard.inventory_date_input = input
	var selector: Control = dashboard.call("_make_inventory_calendar_selector", input, "Período inicial", false)
	dashboard.add_child(selector)
	await process_frame
	assert(selector is Button, "O seletor precisa ser clicável como um único botão.")
	assert(input.mouse_filter == Control.MOUSE_FILTER_IGNORE, "O campo oculto não pode capturar o clique.")
	(selector as Button).pressed.emit()
	await process_frame
	assert(is_instance_valid(dashboard.system_log_calendar_popup), "O clique não abriu o calendário.")
	dashboard.call("_commit_system_log_calendar_date", 2026, 9, 4)
	await process_frame
	assert(input.text == "04/09/2026", "A data escolhida não foi aplicada ao filtro.")
	assert(dashboard.inventory_start_date == "04/09/2026", "O período inicial não foi atualizado.")
	dashboard.queue_free()
	await process_frame
	print("INVENTORY_CALENDAR_SELECTOR_TEST: OK")
	quit(0)
