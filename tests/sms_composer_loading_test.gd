extends SceneTree
class Shell extends "res://src/inventory_dashboard.gd":
	var fail_lookup:=false
	func _ready() -> void:pass
	func _process(_delta:float) -> void:pass
	func _resolve_grupo_rs_manual_sms_target(_product:Dictionary,_require:bool=true) -> Dictionary:
		await get_tree().create_timer(0.3).timeout
		if fail_lookup:return {"ok":false,"message":"Consulta indisponível"}
		return {"ok":true,"serial":"024000001","phone":"(11) 99999-9999","apn":"hinova.br"}
class Gateway extends "res://src/sms_gateway.gd":
	func call_service(_op:String,_req:Dictionary={}) -> Dictionary:
		await get_tree().create_timer(0.3).timeout
		return {"ok":true,"config":{"url":"https://192.168.1.2:8743"}}
func _initialize() -> void:call_deferred("run")
func run() -> void:
	var shell:=Shell.new();root.add_child(shell);shell.selected_branch_id="imperatriz"
	var gateway:=Gateway.new();shell.add_child(gateway);gateway.host=shell
	var product={"imei":"024000001","chip_phone":"11999999999","tracker_status":"Estoque"}
	var start:=Time.get_ticks_msec()
	gateway.confirm_send(product)
	assert(is_instance_valid(gateway.active_composer))
	var card:=gateway.active_composer
	assert(card.visible and Time.get_ticks_msec()-start<250)
	assert(card.find_child("SendCustomSMS",true,false).disabled)
	var input:LineEdit=card.find_child("Recipient",true,false)
	assert(input.text=="(11) 99999-9999")
	input.text="(21) 98888-8888"
	card.find_child("Message",true,false).text="reset,123456"
	await create_timer(0.8).timeout
	assert(not card.find_child("SendCustomSMS",true,false).disabled)
	assert(input.text=="(21) 98888-8888")
	assert(card.find_child("Message",true,false).text=="reset,123456")
	card.queue_free();await process_frame
	shell.fail_lookup=true;gateway.confirm_send(product)
	await create_timer(0.8).timeout
	card=gateway.active_composer
	assert(card.find_child("SendCustomSMS",true,false).disabled)
	assert(card.find_child("ValidationError",true,false).text=="Consulta indisponível")
	card.queue_free();await process_frame
	gateway.confirm_send(product);gateway.active_composer.queue_free()
	await create_timer(0.8).timeout
	shell.queue_free();await process_frame
	print("SMS_LOADING_OK: immediate card, deferred lookup, draft preserved, failure blocked, close safe; no SMS")
	quit()
