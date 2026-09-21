extends Node
## Private receipt service, independent of both SMS and operational inventory databases.
var busy := false
var worker: Thread
var runtime := ""
var python := ""
var database := ""

func setup() -> void:
	database = ProjectSettings.globalize_path("user://scanner_inventory.sqlite")
	var folder := ProjectSettings.globalize_path("user://scanner_bridge")
	DirAccess.make_dir_recursive_absolute(folder)
	runtime = folder.path_join("scanner_inventory_service.py")
	for filename in ["scanner_inventory_service.py", "sms_gateway_service.py"]:
		var file := FileAccess.open(folder.path_join(filename), FileAccess.WRITE)
		if file == null: return
		file.store_string(FileAccess.get_file_as_string("res://tools/" + filename))
		file.close()
	python = preload("res://src/local_sqlite_bridge.gd").new()._find_python()

func _exit_tree() -> void:
	if worker != null and worker.is_started(): worker.wait_to_finish()

func _execute(op: String, data: Dictionary) -> Dictionary:
	var key := str(Time.get_ticks_usec())
	var input := ProjectSettings.globalize_path("user://scanner_request_" + key + ".json")
	var output := ProjectSettings.globalize_path("user://scanner_response_" + key + ".json")
	var file := FileAccess.open(input, FileAccess.WRITE)
	if file == null: return {"ok":false, "error":"Falha ao preparar solicitação"}
	file.store_string(JSON.stringify(data));file.close()
	var stdout: Array = []
	OS.execute(python, PackedStringArray([runtime, op, database, input, output]), stdout, true, false)
	var result: Variant = JSON.parse_string(FileAccess.get_file_as_string(output)) if FileAccess.file_exists(output) else null
	DirAccess.remove_absolute(input);DirAccess.remove_absolute(output)
	return result if result is Dictionary else {"ok":false, "error":"Serviço do Scanner indisponível"}

func call_service(op: String, data: Dictionary = {}) -> Dictionary:
	while busy: await get_tree().process_frame
	if python.is_empty(): return {"ok":false, "error":"Python indisponível"}
	busy = true
	worker = Thread.new()
	if worker.start(_execute.bind(op, data.duplicate(true))) != OK:
		busy = false
		return {"ok":false, "error":"Não foi possível iniciar o recebimento"}
	while worker.is_alive(): await get_tree().process_frame
	var result: Dictionary = worker.wait_to_finish()
	worker = null
	busy = false
	return result
