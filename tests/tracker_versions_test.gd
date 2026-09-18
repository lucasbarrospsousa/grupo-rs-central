extends SceneTree
const Versions=preload("res://src/tracker_versions.gd")
class Shell extends "res://src/inventory_dashboard.gd":
	func _ready()->void: pass
	func _process(_delta:float)->void: pass
func _init()->void: call_deferred("run")
func run()->void:
	var shell=Shell.new(); root.add_child(shell)
	for pair in [["GRS - 001","V7.3.2"],["aaa-002","V7.2.2/7.1.6"],["XRS003","V7.3.5"],["NOV-004",""],["ABC-1D23",""]]:
		assert(shell._infer_bulk_model_from_plate(pair[0])==pair[1])
		assert(shell._infer_form_model_from_grupo_rs_plate(pair[0])==pair[1])
	assert(shell._normalize_bulk_model("RS Novo")=="V7.3.2")
	assert(shell._normalize_bulk_model("Reutilizado")=="V7.2.2/7.1.6")
	assert(shell._normalize_bulk_model("V7.1.6")=="V7.1.6")
	var cells: Array[String] = ["024999991", "V7.3.2"]
	assert(shell._parse_bulk_smart_line("024999991\tV7.3.2",cells).get("model")=="V7.3.2")
	var store=InventoryStore.new()
	var item=store._normalize_product({"sku":"024999991","plate":"GRS-001","tracker_status":"Estoque","model":"RS Novo"})
	assert(item.model=="V7.3.2")
	item=store._normalize_product({"sku":"024999991","plate":"AAA-001","tracker_status":"Instalado","model":"V7.1.6"})
	assert(item.model=="V7.1.6")
	item=store._normalize_product({"sku":"024999991","plate":"GRS-001","tracker_status":"Instalado"})
	assert(item.model!="V7.3.2") # vehicle plate alone must not claim firmware
	assert(not Versions.OPTIONS.has("Novo") and not Versions.OPTIONS.has("Reutilizado"))
	var block=shell._make_option_block("model","Versão / classificação",Versions.OPTIONS)
	shell.add_child(block); block.position=Vector2(30,30)
	await process_frame
	if DisplayServer.get_name()!="headless":
		RenderingServer.force_draw(); root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("tracker-versions.png"))
	shell.queue_free(); await process_frame
	print("TRACKER_VERSIONS_OK: mappings, legacy compatibility, no NOV inference, exact version preserved; no database/network")
	quit()
