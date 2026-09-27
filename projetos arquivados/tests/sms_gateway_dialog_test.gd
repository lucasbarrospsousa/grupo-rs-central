extends SceneTree
class Shell extends "res://src/inventory_dashboard.gd":
	func _ready() -> void: pass
	func _process(_delta: float) -> void: pass
func _initialize() -> void: call_deferred("run")
func run() -> void:
	assert(OS.get_environment("GRUPO_RS_TEST_OUTPUT")!="","Requires isolated runner")
	var shell:=Shell.new()
	root.add_child(shell)
	var gateway:Node=shell._ensure_phone_sms_gateway()
	await gateway.configure_dialog()
	await create_timer(0.5).timeout
	var dialog:AcceptDialog
	for child in shell.get_children():
		if child is AcceptDialog:dialog=child
	assert(dialog!=null and dialog.visible)
	assert(dialog.size.x>=700 and dialog.size.y>=560)
	if DisplayServer.get_name()!="headless":
		RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("gateway-dialog.png"))
	while gateway.busy:await process_frame
	shell.queue_free()
	await process_frame
	print("SMS_GATEWAY_DIALOG_OK: isolated pairing/history dialog, no network or SMS")
	quit()
