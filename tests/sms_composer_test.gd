extends SceneTree
class Shell extends "res://src/inventory_dashboard.gd":
	var warnings:=0
	func _ready() -> void:pass
	func _process(_delta:float) -> void:pass
	func _show_warning(_title:String,_message:String) -> void:warnings+=1
func _initialize() -> void:call_deferred("run")
func run() -> void:
	root.size=Vector2i(1917,1022)
	root.content_scale_size=Vector2i(1917,1022)
	var shell:=Shell.new();root.add_child(shell);shell.selected_branch_id="imperatriz"
	shell.theme=Theme.new();shell.theme.default_font=shell.UI_FONT;shell.theme.default_font_size=18
	var gateway:Node=shell._ensure_phone_sms_gateway()
	var context={"version":2,"serial":"024000001","source_phone_snapshot":"+5511999999999","apn_snapshot":"hinova.br","standard_command_snapshot":"ST300NTW;024000001;TEST;#","status_snapshot":"Estoque"}
	var card:AcceptDialog=gateway.show_composer(context,"https://192.168.1.2:8743")
	var entry_position:=card.position
	assert(card.find_child("ComposerLayout",true,false).modulate.a<0.1)
	await create_timer(0.4).timeout
	assert(card.position.y<entry_position.y)
	assert(is_equal_approx(card.find_child("ComposerLayout",true,false).modulate.a,1.0))
	assert(card.size==Vector2i(1000,660))
	assert(card.size.y<800 and card.position.y+card.size.y<=root.size.y)
	for name_value in ["EquipmentSummary","GatewaySummary","SMSPreviewCard"]:
		var animated:Control=card.find_child(name_value,true,false)
		assert(animated.has_meta("card_hover_motion"))
		for child in animated.get_children():
			if child.get_script()==preload("res://src/ui/card_hover_motion.gd"):
				child.set_process(false);child.animate(true)
				await create_timer(0.4).timeout
				assert(animated.scale.x>1.0 and animated.scale.y>1.0)
				child.animate(false);await create_timer(0.25).timeout
				assert(animated.scale.is_equal_approx(Vector2.ONE))
	var phone:LineEdit=card.find_child("Recipient",true,false)
	var message:TextEdit=card.find_child("Message",true,false)
	var send:Button=card.find_child("SendCustomSMS",true,false)
	var quick:Button=card.find_child("QuickSMS",true,false)
	assert(phone.text=="(11) 99999-9999" and message.text=="")
	send.pressed.emit();assert(not card.find_child("ValidationError",true,false).text.is_empty())
	message.text="reset,123456";phone.text="+5521999999999";send.pressed.emit()
	var review:ConfirmationDialog=shell.get_node("SMSReview")
	assert(review.dialog_text.contains("reset,123456") and review.dialog_text.contains("Destinatário: (21) 99999-9999"))
	assert(review.transparent and review.transparent_bg)
	assert(review.find_child("ReviewCommandText",true,false).text=="reset,123456")
	var review_start:=review.position
	await create_timer(0.4).timeout
	assert(review.position.y<review_start.y)
	for name_value in ["ReviewEquipment","ReviewRecipient","ReviewCommand"]:
		var animated:Control=review.find_child(name_value,true,false)
		assert(animated.has_meta("card_hover_motion"))
		for child in animated.get_children():
			if child.get_script()==preload("res://src/ui/card_hover_motion.gd"):
				child.set_process(false);child.animate(true)
				await create_timer(0.4).timeout
				assert(animated.scale.y>1.0)
				child.animate(false);await create_timer(0.25).timeout
				assert(animated.scale.is_equal_approx(Vector2.ONE))
	assert(card.size.y<800)
	if DisplayServer.get_name()!="headless":
		RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("sms-review.png"))
	review.canceled.emit();await process_frame
	quick.pressed.emit();review=shell.get_node("SMSReview")
	assert(review.dialog_text.contains(context.standard_command_snapshot))
	assert(review.find_child("ReviewCommandText",true,false).text==context.standard_command_snapshot)
	assert(review.dialog_text.contains("Destinatário: (11) 99999-9999") and not review.dialog_text.contains("reset,123456"))
	review.canceled.emit();await process_frame
	message.text="reset,123456";phone.text="(11) 99999-9999"
	message.text_changed.emit()
	await create_timer(0.2).timeout
	if DisplayServer.get_name()!="headless":
		RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("sms-composer.png"))
	var rows:Dictionary=await gateway.call_service("list")
	assert(rows.get("jobs",[]).is_empty(),"No confirmation: nothing can enter queue")
	shell.queue_free();await process_frame
	print("SMS_COMPOSER_OK: prefill, custom override, quick standard, empty rejected, confirmation required; no SMS")
	quit()
