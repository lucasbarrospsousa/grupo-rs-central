## Explicitly run only for authorized live consultation. Outputs counts, never records/secrets.
extends SceneTree
class Reader extends "res://src/inventory_dashboard.gd":
	func _ready() -> void: pass
	func _process(_delta: float) -> void: pass
func _initialize() -> void: run.call_deferred()
func run() -> void:
	var reader := Reader.new()
	root.add_child(reader)
	for id in ["imperatriz", "araguaina", "maraba", "acailandia"]:
		var service := preload("res://src/services/hub_maintenance.gd").new()
		service.branch = id
		service.credentials = reader._hub_maintenance_credentials(id)
		root.add_child(service)
		var result: Dictionary = await service.fetch()
		print("HUB_READONLY %s ok=%s count=%s message=%s" % [id, result.get("ok",false),result.get("count","pending"), result.get("message", "confirmed")])
		service.queue_free()
		await process_frame
	reader.queue_free()
	await process_frame
	quit()
