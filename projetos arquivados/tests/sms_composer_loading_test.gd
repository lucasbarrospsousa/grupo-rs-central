extends SceneTree
class Shell extends "res://src/inventory_dashboard.gd":
	var fail_lookup:=false
	var missing_phone:=false
	var synced:Dictionary={}
	func _sync_confirmed_sms_contact(_product:Dictionary,result:Dictionary) -> Dictionary:
		synced=result.duplicate(true)
		return {"ok":true,"changed":true}
	func _ready() -> void:pass
	func _process(_delta:float) -> void:pass
	func _resolve_grupo_rs_manual_sms_target(_product:Dictionary,_require:bool=true) -> Dictionary:
		await get_tree().create_timer(0.3).timeout
		if fail_lookup:return {"ok":false,"message":"Consulta indisponível"}
		if missing_phone:return {"ok":false,"summary":"Telefone não confirmado","message":"O cadastro online não retornou um telefone de chip válido. O número exibido é local; confirme o cadastro antes de enviar."}
		return {"ok":true,"serial":"024000001","phone":"(11) 99999-9999","apn":"hinova.br"}
class Gateway extends "res://src/sms_gateway.gd":
	var fail_config:=false
	func call_service(_op:String,_req:Dictionary={}) -> Dictionary:
		await get_tree().create_timer(0.3).timeout
		if fail_config:return {"ok":false}
		return {"ok":true,"config":{"url":"https://192.168.1.2:8743"}}
func _initialize() -> void:call_deferred("run")
func run() -> void:
	root.size=Vector2i(1917,1022)
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
	card.find_child("Recipient",true,false).text="(21) 98888-8888"
	await create_timer(0.8).timeout
	assert(not card.find_child("SendCustomSMS",true,false).disabled)
	assert(input.text=="(21) 98888-8888")
	assert(shell.synced.get("phone")=="(11) 99999-9999","Only online data may be persisted, never the edited recipient")
	assert(card.find_child("Message",true,false).text=="reset,123456")
	assert(card.find_child("Recipient",true,false).text=="(21) 98888-8888")
	card.queue_free();await process_frame
	shell.missing_phone=true;gateway.confirm_send(product)
	await create_timer(0.8).timeout
	card=gateway.active_composer
	assert(card.find_child("GatewaySummary",true,false).find_child("Value",true,false).text=="Telefone não confirmado")
	assert(card.find_child("SendCustomSMS",true,false).disabled)
	assert(card.find_child("QuickSMS",true,false).disabled)
	if DisplayServer.get_name()!="headless":
		RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT")+"/sms-lookup-unconfirmed.png")
	card.queue_free();await process_frame
	gateway.fail_config=true;gateway.confirm_send(product)
	await create_timer(0.8).timeout
	card=gateway.active_composer
	assert(card.find_child("GatewaySummary",true,false).find_child("Value",true,false).text=="Configuração indisponível")
	assert(card.find_child("SendCustomSMS",true,false).disabled)
	card.queue_free();await process_frame
	gateway.fail_config=false
	shell.missing_phone=false
	shell.fail_lookup=true;gateway.confirm_send(product)
	await create_timer(0.8).timeout
	card=gateway.active_composer
	assert(card.find_child("SendCustomSMS",true,false).disabled)
	assert(card.find_child("ValidationError",true,false).text=="Consulta indisponível")
	assert(card.find_child("GatewaySummary",true,false).find_child("Value",true,false).text=="Consulta não confirmada")
	assert(card.find_child("RetryLookup",true,false).visible)
	card.find_child("Message",true,false).text="reset,123456"
	shell.fail_lookup=false
	card.find_child("RetryLookup",true,false).pressed.emit()
	assert(not card.find_child("RetryLookup",true,false).visible)
	await create_timer(0.8).timeout
	assert(not card.find_child("SendCustomSMS",true,false).disabled)
	assert(card.find_child("Message",true,false).text=="reset,123456")
	assert(card.find_child("GatewaySummary",true,false).find_child("Value",true,false).text=="Pronto para revisar")
	card.queue_free();await process_frame
	gateway.confirm_send(product);gateway.active_composer.queue_free()
	await create_timer(0.8).timeout
	shell.queue_free();await process_frame
	print("SMS_LOADING_OK: immediate card, deferred lookup, draft preserved, failure blocked, close safe; no SMS")
	quit()
