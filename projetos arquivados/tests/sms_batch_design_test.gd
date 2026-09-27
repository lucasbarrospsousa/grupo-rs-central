extends SceneTree
class Shell extends "res://src/inventory_dashboard.gd":
	func _ready() -> void:pass
	func _process(_delta:float) -> void:pass
	func _ensure_phone_sms_gateway() -> Node:return self
	func call_service(_op:String,_request:Dictionary={}) -> Dictionary:
		assert(false,"Visual test must not dispatch SMS");return {}
func _initialize() -> void:call_deferred("run")
func run() -> void:
	root.size=Vector2i(1536,1024)
	root.gui_embed_subwindows=true
	root.content_scale_size=Vector2i.ZERO
	root.content_scale_mode=Window.CONTENT_SCALE_MODE_DISABLED
	root.transparent_bg=false
	RenderingServer.set_default_clear_color(Color("#e6f1fc"))
	var shell:=Shell.new();root.add_child(shell);shell.selected_branch_id="imperatriz";shell.store=null
	var d:=preload("res://src/ui/bulk_sms_dialog.gd").new();shell.add_child(d);d.setup(shell)
	var rows:=""
	for i in range(6):rows+="024%06d\t1199999%04d\t4\n"%[i+1,i+1]
	d.paste_text(rows)
	await create_timer(0.5).timeout
	d.position=Vector2i(120,50)
	await create_timer(0.2).timeout
	assert(d.visible_rows==6 and not d.inputs[6][0].visible)
	assert(d.get_meta("count_label").text=="6")
	assert(d.get_meta("groups_label").text=="Grupo 4")
	assert(d.confirm_button.disabled)
	print("VISUAL_GEOMETRY dialog=",d.size," root=",root.size," viewport=",root.get_visible_rect().size)
	assert(d.size.x<=root.size.x and d.size.y<=root.size.y)
	assert(d.inputs[5][0].get_global_rect().end.y<=d.inputs[5][0].get_parent().get_parent().get_global_rect().end.y)
	if DisplayServer.get_name()!="headless":
		RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT")+"/sms-batch-approved.png")
	d.apn_selector.select(1);d.apn_selector.item_selected.emit(1);d.prepare()
	await create_timer(0.2).timeout
	assert(d.get_meta("apn_label").text=="linksolutions.br" and d.review.text.contains(";linksolutions.br;link;link;"))
	if DisplayServer.get_name()!="headless":
		RenderingServer.force_draw();root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT")+"/sms-batch-link.png")
	for i in range(5):d.add_row()
	assert(d.visible_rows==10 and d.get_meta("add_button").disabled)
	d.lock_fields(true);assert(d.get_meta("add_button").disabled)
	d.lock_fields(false)
	d.prepare()
	assert(d.prepared.size()==6 and not d.confirm_button.disabled)
	d.inputs[0][0].text="024000009";d.inputs[0][0].text_changed.emit("024000009");assert(d.confirm_button.disabled)
	var card:Control=d.get_meta("count_label").get_parent().get_parent().get_parent()
	assert(card.has_meta("card_hover_motion"))
	for child in card.get_children():
		if child.get_script()==preload("res://src/ui/card_hover_motion.gd"):
			child.set_process(false);child.animate(true)
			await create_timer(0.4).timeout
			if OS.get_environment("GRUPO_RS_REDUCED_MOTION")!="1":assert(card.scale.x>1)
			child.animate(false);await create_timer(0.25).timeout
			assert(card.scale.is_equal_approx(Vector2.ONE))
	assert(d.validate_button.has_meta("button_motion"))
	d.validate_button.mouse_entered.emit()
	await create_timer(0.25).timeout
	if OS.get_environment("GRUPO_RS_REDUCED_MOTION")!="1":assert(d.validate_button.scale.x>1)
	d.validate_button.mouse_exited.emit()
	await create_timer(0.3).timeout
	assert(d.validate_button.scale.is_equal_approx(Vector2.ONE))
	shell.queue_free();await process_frame
	print("SMS_BATCH_DESIGN_OK: 6 visible rows; add limit 10; reactive summary; review invalidation; button motion; no queue/network")
	quit()
