extends SceneTree
class Shell extends "res://src/inventory_dashboard.gd":
	func _ready() -> void: pass
	func _process(_delta: float) -> void: pass
func _initialize() -> void: call_deferred("run")
func run() -> void:
	var shell := Shell.new()
	root.add_child(shell)
	var picker := shell._make_bulk_operator_picker()
	shell.add_child(picker)
	picker.position = Vector2(32, 32)
	assert(shell.bulk_operator_option.item_count == 4)
	assert(shell._selected_bulk_operator() == "Claro")
	for i in range(4):
		shell.bulk_operator_option.select(i)
		assert(shell._selected_bulk_operator() == ["Claro", "Vivo", "Tim", "Multi Operadora"][i])
	for alias in ["Multioperadora", "MULTI OPERADORA", "multi-operadora", "multi_operadora"]:
		assert(shell._normalize_bulk_operator(alias) == "Multi Operadora")
		assert(shell._smart_registration_operator_label(shell._normalize_bulk_operator(alias)) == "Multi Operadora")
		var cells: Array[String] = ["024000001", alias]
		var parsed: Dictionary = shell._parse_bulk_smart_line("024000001\t" + alias, cells)
		assert(parsed.get("operator") == "Multi Operadora")
	assert(shell._normalize_bulk_operator("NLT") == "NLT")
	await create_timer(0.2).timeout
	assert(shell.bulk_operator_option.size.x >= shell.bulk_operator_option.get_minimum_size().x)
	if DisplayServer.get_name() != "headless":
		RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("bulk-multioperator.png"))
	shell.queue_free()
	await process_frame
	print("BULK_MULTIOPERATOR_OK: selection, aliases, pasted rows and integration label; no database or network")
	quit()
