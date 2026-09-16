extends SceneTree
class Shell extends "res://src/inventory_dashboard.gd":
	var queued:Dictionary={}
	func _ready() -> void:pass
	func _process(_delta:float) -> void:pass
	func _ensure_phone_sms_gateway() -> Node:return self
	func _resolve_grupo_rs_manual_sms_target(_product:Dictionary,_require:bool=true) -> Dictionary:
		assert(false,"Manual batch must never query equipment");return {}
	func call_service(op:String,request:Dictionary={}) -> Dictionary:
		assert(op=="enqueue_batch");queued=request.duplicate(true);return {"ok":true}
func _initialize() -> void:call_deferred("run")
func run() -> void:
	root.size=Vector2i(1917,1022)
	var shell:=Shell.new();root.add_child(shell);shell.selected_branch_id="imperatriz"
	shell.store=null
	var dialog:=preload("res://src/ui/bulk_sms_dialog.gd").new();shell.add_child(dialog);dialog.setup(shell)
	assert(dialog.inputs.size()==10)
	assert(dialog.confirm_button.disabled)
	dialog.inputs[0][0].text="024000001";dialog.inputs[0][1].text="11999999999"
	await dialog.prepare()
	assert(dialog.prepared.is_empty() and dialog.confirm_button.disabled)
	assert(dialog.feedback.text.contains("grupo"))
	dialog.inputs[0][2].select(4)
	await dialog.prepare()
	assert(dialog.prepared.size()==1)
	assert(dialog.prepared[0].command.contains("grupors4.ddns.net;5940;grupors4.ddns.net;5941"))
	assert(shell.queued.is_empty(),"Review does not enqueue")
	dialog.apn_selector.select(1);dialog.apn_selector.item_selected.emit(1)
	assert(dialog.confirm_button.disabled and dialog.prepared.is_empty() and dialog.review.text=="")
	for group in range(1,5):
		dialog.inputs[0][2].select(group)
		await dialog.prepare()
		assert(dialog.prepared[0].apn_snapshot=="linksolutions.br")
		assert(dialog.prepared[0].command.contains(";linksolutions.br;link;link;grupors%d.ddns.net;5940;grupors%d.ddns.net;5941;"%[group,group]))
	dialog.apn_selector.select(0);dialog.apn_selector.item_selected.emit(0);await dialog.prepare()
	assert(dialog.prepared[0].command.contains(";hinova.br;hinova;hinova;"))
	await create_timer(0.5).timeout
	if DisplayServer.get_name()!="headless":
		RenderingServer.force_draw();root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT")+"/sms-batch.png")
	await dialog.submit()
	assert(shell.queued.rows.size()==1 and shell.queued.rows[0].group==4)
	assert(shell.queued.manual and shell.queued.rows[0].status_snapshot=="Informado no lote")
	shell.queue_free();await process_frame
	print("SMS_BATCH_UI_OK: no stock required; mandatory group; manual confirmation; mocked queue")
	quit()
