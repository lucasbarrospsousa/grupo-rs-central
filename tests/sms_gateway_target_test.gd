extends SceneTree
class Shell extends "res://src/inventory_dashboard.gd":
	var sample_rows: Array[Dictionary] = []
	var sample_apn := "hinova.br"
	func _ready() -> void: pass
	func _process(_delta: float) -> void: pass
	func _grupo_rs_supports_modern_api() -> bool: return true
	func _fetch_grupo_rs_equipment_rows(_serial: String) -> Array[Dictionary]: return sample_rows
	func _fetch_grupo_rs_equipment_apn(_row: Dictionary) -> String: return sample_apn
func _initialize() -> void: call_deferred("run")
func run() -> void:
	var shell := Shell.new()
	root.add_child(shell)
	var product := {"imei":"024000001","phone":"11999999999","apn":"hinova.br"}
	var result: Dictionary = await shell._resolve_grupo_rs_manual_sms_target(product)
	assert(not result.get("ok",false),"Cannot silently use local data on query failure")
	shell.sample_rows.assign([{"serial":"024000002","phone":"11999999999"}])
	result=await shell._resolve_grupo_rs_manual_sms_target(product)
	assert(not result.get("ok",false),"Approximate result must be rejected")
	shell.sample_rows.assign([{"serial":"024000001","phone":"11999999999"}])
	result=await shell._resolve_grupo_rs_manual_sms_target(product)
	assert(result.get("ok",false))
	assert(result.get("origin")=="Grupo RS")
	shell.sample_rows.append(shell.sample_rows[0].duplicate())
	result=await shell._resolve_grupo_rs_manual_sms_target(product)
	assert(not result.get("ok",false),"Duplicate exact results must be rejected")
	shell.sample_rows.resize(1)
	shell.sample_rows[0]["phone"]=""
	result=await shell._resolve_grupo_rs_manual_sms_target(product)
	assert(not result.get("ok",false),"Missing online phone must not fall back")
	shell.sample_rows[0]["phone"]="11999999999"
	shell.sample_apn=""
	result=await shell._resolve_grupo_rs_manual_sms_target(product)
	assert(not result.get("ok",false),"Missing online APN must not fall back")
	shell.queue_free()
	await process_frame
	print("SMS_GATEWAY_EXACT_TARGET_OK: six synthetic cases; no database/network")
	quit()
