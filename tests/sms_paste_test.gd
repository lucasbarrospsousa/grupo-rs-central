extends SceneTree
const Parser=preload("res://src/ui/sms_paste_parser.gd")
class Shell extends "res://src/inventory_dashboard.gd":
	func _ready() -> void:pass
	func _process(_delta:float) -> void:pass
	func _ensure_phone_sms_gateway() -> Node:return self
func _initialize() -> void:call_deferred("run")
func run() -> void:
	var text:=""
	for i in range(28):
		text+="| 024%06d | (11) 9999-%05d | grupo 4 |\n" % [i+1,90001+i]
		if i==0:text+="| --------: | --------------- | ------- |\n"
	var result:=Parser.parse(text)
	assert(result.ok and result.rows.size()==28)
	assert(result.rows[0].serial=="024000001" and result.rows[27].serial=="024000028")
	assert(result.rows[0].phone=="(11) 99999-0001")
	assert(Parser.parse("Série\tTelefone\tGrupo\n024000001\t+55 (11) 99999-0001\t4").ok)
	for bad in ["024000001\t11999990001\t",text+"| 024000001 | 11999990001 | grupo 4 |", "024000001\t11999990001\t5","024000001\ttelefone11999990001\t4"]:
		assert(not Parser.parse(bad).ok)
	root.size=Vector2i(1917,1022)
	var shell:=Shell.new();root.add_child(shell);shell.selected_branch_id="imperatriz"
	var dialog:=preload("res://src/ui/bulk_sms_dialog.gd").new();shell.add_child(dialog);dialog.setup(shell)
	dialog.paste_text(text)
	assert(dialog.pasted_rows.size()==28 and dialog.inputs[0][0].text=="024000001")
	assert(dialog.confirm_button.disabled and dialog.prepared.is_empty())
	dialog.inputs[0][1].text="(11) 98888-8888"
	dialog.change_page(1);assert(dialog.inputs[0][0].text=="024000011")
	dialog.change_page(1);assert(dialog.inputs[0][0].text=="024000021" and dialog.inputs[7][0].text=="024000028")
	assert(dialog.inputs[8][0].text=="" and dialog.next_button.disabled)
	dialog.change_page(-1);dialog.change_page(-1)
	assert(dialog.inputs[0][1].text=="(11) 98888-8888")
	dialog.paste_text("invalid")
	assert(dialog.pasted_rows.size()==28 and dialog.inputs[0][1].text=="(11) 98888-8888")
	dialog.paste_text(text)
	await create_timer(0.4).timeout
	if DisplayServer.get_name()!="headless":
		RenderingServer.force_draw();root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT")+"/sms-paste.png")
	shell.queue_free();await process_frame
	print("SMS_PASTE_OK: 28 rows, 10/10/8, formatting, headers, invalid atomic rejection, page edit retention; no SMS or network")
	quit()
