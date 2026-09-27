## Explicit live read probe. No stock writes; prints branch/status/schema counts only.
extends SceneTree
class Reader extends "res://src/inventory_dashboard.gd":
	func _ready()->void:pass
	func _process(_delta:float)->void:pass
	func _read_json_dictionary(path:String)->Dictionary:
		var data:=_read_json_dictionary_raw(path)
		if path!=SETTINGS_PATH:return data
		var vault:=SecretVaultScript.new()
		if FileAccess.file_exists(vault.vault_path()):data=vault.merge_secrets("app",data,SecretVaultScript.APP_SECRET_KEYS)
		vault.free();return data
func _initialize():run.call_deferred()
func run():
	var reader:=Reader.new();root.add_child(reader)
	for branch in preload("res://src/services/stock_discharge.gd").ORIGINS:
		var service:=preload("res://src/services/stock_discharge.gd").new();service.host=reader;service.branch=branch;root.add_child(service)
		var auth:=await service.login()
		if not auth.ok:print("DISCHARGE_READONLY ",branch," auth=false reason=",auth.get("message","pending"));service.queue_free();continue
		var result:=await service.request("/endpoints/veiculos.php?skip=0&take=20")
		var rows:Array=reader._grupo_rs_api_extract_rows(result.get("data",{}))
		var serial_present:=false;var plate_present:=false;var client_present:=false
		if not rows.is_empty():
			var row:Dictionary=reader._grupo_rs_api_normalize_location(rows[0]);serial_present=str(row.serial)!="";plate_present=str(row.plate)!="";client_present=str(row.client)!=""
		var hub:=preload("res://src/services/hub_maintenance.gd").new();hub.branch=branch;hub.credentials=reader._hub_maintenance_credentials(branch);hub.decode_body=reader._decode_http_body_bytes;root.add_child(hub)
		var maintenance:Dictionary=await hub.fetch()
		if maintenance.ok:
			for raw in maintenance.rows:
				if str(raw.serial)!="" and reader._looks_like_vehicle_plate(str(raw.plate)):
					var checked:Dictionary=await service.lookup(str(raw.serial))
					print("EXACT_LINK ",branch," confirmed=",checked.ok," message=",checked.get("message",""))
					break
		hub.queue_free()
		print("DISCHARGE_READONLY %s auth=true read=%s serial=%s plate=%s client=%s" % [branch,result.ok,serial_present,plate_present,client_present])
		service.queue_free()
	reader.queue_free();await process_frame;quit()
