extends SceneTree
class Shell extends "res://src/inventory_dashboard.gd":
	var warnings:=0
	func _ready() -> void:pass
	func _process(_delta:float) -> void:pass
	func _show_warning(_title:String,_message:String) -> void:warnings+=1
func _initialize() -> void:call_deferred("run")
func run() -> void:
	var shell:=Shell.new();root.add_child(shell);shell.selected_branch_id="imperatriz"
	var gateway:Node=shell._ensure_phone_sms_gateway()
	var context={"version":2,"serial":"024000001","source_phone_snapshot":"+5511999999999","apn_snapshot":"hinova.br","standard_command_snapshot":"ST300NTW;024000001;TEST;#","status_snapshot":"Estoque"}
	var card:AcceptDialog=gateway.show_composer(context,"https://192.168.1.2:8743")
	var phone:LineEdit=card.find_child("Recipient",true,false)
	var message:TextEdit=card.find_child("Message",true,false)
	var send:Button=card.find_child("SendCustomSMS",true,false)
	var quick:Button=card.find_child("QuickSMS",true,false)
	assert(phone.text==context.source_phone_snapshot and message.text=="")
	send.pressed.emit();assert(not card.find_child("ValidationError",true,false).text.is_empty())
	message.text="reset,123456";phone.text="+5521999999999";send.pressed.emit()
	var review:ConfirmationDialog=shell.get_node("SMSReview")
	assert(review.dialog_text.contains("reset,123456") and review.dialog_text.contains("Destinatário: +5521999999999"))
	review.canceled.emit();await process_frame
	quick.pressed.emit();review=shell.get_node("SMSReview")
	assert(review.dialog_text.contains(context.standard_command_snapshot))
	assert(review.dialog_text.contains("Destinatário: +5511999999999") and not review.dialog_text.contains("reset,123456"))
	review.canceled.emit();await process_frame
	message.text="reset,123456";phone.text=context.source_phone_snapshot
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
