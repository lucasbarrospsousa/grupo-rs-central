extends Node
## Exclusive local phone gateway; no fallback providers.
var host: Node
var busy := false
var ticking := false
var delivery_cursor := 0
var worker: Thread
var database := ""
var runtime := ""
var python := ""
var timer: Timer
var active_composer: AcceptDialog
func show_delivery_panel() -> void:
 host._show_sms_panel()

func show_submission_notice() -> AcceptDialog:
 var notice:=ConfirmationDialog.new();notice.name="SMSSubmissionNotice"
 notice.borderless=true;notice.transparent=true;notice.transparent_bg=true;notice.unresizable=true
 notice.title="Solicitação enviada";notice.dialog_text="Solicitação enviada"
 notice.ok_button_text="Painel SMS";notice.cancel_button_text="Agora não"
 notice.theme=Theme.new();notice.theme.default_font=REGULAR;notice.theme.default_font_size=16
 notice.add_theme_stylebox_override("panel",host._style_box(Color.WHITE,Color("#d9e5f0"),1,20,true))
 notice.get_label().hide();notice.get_ok_button().hide();notice.get_cancel_button().hide()
 var frame:=Control.new();frame.custom_minimum_size=Vector2(500,230);notice.add_child(frame)
 var margin:=MarginContainer.new();frame.add_child(margin);margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
 for side in ["left","right","top","bottom"]:margin.add_theme_constant_override("margin_"+side,24)
 var box:=VBoxContainer.new();box.add_theme_constant_override("separation",14);margin.add_child(box)
 var heading:=HBoxContainer.new();heading.add_theme_constant_override("separation",14);box.add_child(heading)
 var badge:=PanelContainer.new();badge.add_theme_stylebox_override("panel",host._style_box(Color("#e8f3ff"),Color.TRANSPARENT,0,14));badge.custom_minimum_size=Vector2(48,48);heading.add_child(badge)
 var icon:=TextureRect.new();icon.texture=load("res://assets/icons/approved/mail.svg");icon.expand_mode=TextureRect.EXPAND_IGNORE_SIZE;icon.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED;icon.custom_minimum_size=Vector2(24,24);icon.modulate=Color("#1678d4")
 var icon_margin:=MarginContainer.new()
 for side in ["left","right","top","bottom"]:icon_margin.add_theme_constant_override("margin_"+side,12)
 badge.add_child(icon_margin);icon_margin.add_child(icon)
 var titles:=VBoxContainer.new();titles.size_flags_horizontal=Control.SIZE_EXPAND_FILL;heading.add_child(titles)
 var title:=Label.new();title.text="Solicitação enviada";title.add_theme_font_size_override("font_size",23);title.add_theme_color_override("font_color",Color("#123555"));titles.add_child(title)
 var caption:=Label.new();caption.name="SubmissionStatus";caption.text="Pedido registrado na fila";caption.add_theme_font_size_override("font_size",13);caption.add_theme_color_override("font_color",Color("#5c7590"));titles.add_child(caption)
 var text:=Label.new();text.text="Acompanhe a confirmação de envio e os detalhes\nno Painel SMS.";text.add_theme_color_override("font_color",Color("#526e8a"));box.add_child(text)
 var actions:=HBoxContainer.new();actions.add_theme_constant_override("separation",12);box.add_child(actions)
 var primary:Button=host._make_action_button("Painel SMS",Color("#1678d4"),Color("#1678d4"),Color.WHITE,Vector2(210,46),func():notice.confirmed.emit())
 primary.name="OpenSMSPanel";primary.size_flags_horizontal=Control.SIZE_EXPAND_FILL;actions.add_child(primary)
 var secondary:Button=host._make_action_button("Agora não",Color.WHITE,Color("#d8e5f0"),Color("#526e8a"),Vector2(130,46),func():notice.canceled.emit())
 actions.add_child(secondary)
 for button in [primary,secondary]:
  for state_name in ["normal","hover","pressed"]:
   var button_style:StyleBox=button.get_theme_stylebox(state_name).duplicate()
   for side in [SIDE_LEFT,SIDE_RIGHT]:button_style.set_content_margin(side,18)
   for side in [SIDE_TOP,SIDE_BOTTOM]:button_style.set_content_margin(side,12)
   button.add_theme_stylebox_override(state_name,button_style)
  CARD_MOTION.attach(button)
 notice.confirmed.connect(func():notice.queue_free();show_delivery_panel())
 notice.canceled.connect(notice.queue_free)
 host.add_child(notice);notice.popup_centered(Vector2i(520,250))
 if OS.get_environment("GRUPO_RS_REDUCED_MOTION")!="1":
  box.modulate.a=0;var destination:=notice.position;notice.position+=Vector2i(0,12)
  var entry:=notice.create_tween().set_parallel(true)
  entry.tween_property(box,"modulate:a",1.0,0.2)
  entry.tween_property(notice,"position",destination,0.25).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
 return notice
const REGULAR = preload("res://assets/fonts/Noto_Sans/static/NotoSans-Regular.ttf")
const CARD_MOTION = preload("res://src/ui/card_hover_motion.gd")
const COMPOSER_SIZE = Vector2i(1000,660)

func _open_composer(card:AcceptDialog) -> void:
 card.popup_centered(COMPOSER_SIZE)
 if OS.get_environment("GRUPO_RS_REDUCED_MOTION")=="1":return
 var previous:Tween=card.get_meta("entry_tween") if card.has_meta("entry_tween") else null
 if previous:previous.kill()
 var destination:=card.position
 card.position=destination+Vector2i(0,24)
 var content:Control=card.find_child("ComposerLayout",true,false)
 content.modulate.a=0.0
 var entry:=card.create_tween().set_parallel(true)
 entry.tween_property(card,"position",destination,0.32).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
 entry.tween_property(content,"modulate:a",1.0,0.22)
 card.set_meta("entry_tween",entry)

func _summary_card(title_text:String, value_text:String, icon_path:String, accent:Color, node_name:String) -> PanelContainer:
 var panel:=PanelContainer.new();panel.name=node_name;panel.size_flags_horizontal=Control.SIZE_EXPAND_FILL
 var style:StyleBox=host._style_box(Color.WHITE,Color("#d3e2ef"),1,16,true)
 for side in [SIDE_LEFT,SIDE_RIGHT]:style.set_content_margin(side,16)
 for side in [SIDE_TOP,SIDE_BOTTOM]:style.set_content_margin(side,12)
 panel.add_theme_stylebox_override("panel",style)
 var row:=HBoxContainer.new();row.add_theme_constant_override("separation",12);panel.add_child(row)
 var icon:=TextureRect.new();icon.texture=load(icon_path);icon.custom_minimum_size=Vector2(24,24);icon.expand_mode=TextureRect.EXPAND_IGNORE_SIZE;icon.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_CENTERED;icon.modulate=accent;row.add_child(icon)
 var labels:=VBoxContainer.new();labels.size_flags_horizontal=Control.SIZE_EXPAND_FILL;row.add_child(labels)
 var caption:=Label.new();caption.text=title_text;caption.add_theme_font_size_override("font_size",12);caption.add_theme_color_override("font_color",Color("#58738e"));labels.add_child(caption)
 var value:=Label.new();value.name="Value";value.text=value_text;value.add_theme_font_size_override("font_size",16);value.add_theme_color_override("font_color",accent);labels.add_child(value)
 CARD_MOTION.attach(panel)
 return panel
const SERVICE = "res://tools/sms_gateway_service.py"
const LABELS = {"waiting_gateway":"Aguardando gateway","received":"Recebido no celular","sending":"Enviando","sent":"SMS enviado (não comprova configuração)","delivered":"Entrega confirmada pela rede","failed":"Falhou","expired":"Expirado","cancelled":"Cancelado","indeterminate":"Resultado indeterminado — sem reenvio","needs_confirmation":"Cadastro mudou — exige nova confirmação"}

func setup(owner_node: Node) -> void:
 host = owner_node
 database = ProjectSettings.globalize_path("user://sms_gateway.sqlite")
 runtime = ProjectSettings.globalize_path("user://sms_gateway_service.py")
 var file := FileAccess.open(runtime, FileAccess.WRITE)
 if file == null: return
 file.store_string(FileAccess.get_file_as_string(SERVICE))
 file.close()
 python = preload("res://src/local_sqlite_bridge.gd").new()._find_python()
 timer = Timer.new()
 timer.wait_time = 10
 timer.timeout.connect(_tick)
 add_child(timer)
 timer.start()

func _exit_tree() -> void:
 if worker != null and worker.is_started(): worker.wait_to_finish()

func _execute(op: String, req: Dictionary) -> Dictionary:
 var token := str(Time.get_ticks_usec())
 var input := ProjectSettings.globalize_path("user://gateway_request_" + token + ".json")
 var output := ProjectSettings.globalize_path("user://gateway_response_" + token + ".json")
 var f := FileAccess.open(input, FileAccess.WRITE)
 if f == null: return {"ok":false,"error":"Falha ao preparar requisição"}
 f.store_string(JSON.stringify(req));f.close()
 var stdout: Array = []
 OS.execute(python, PackedStringArray([runtime, op, database, input, output]), stdout, true, false)
 var result: Variant = JSON.parse_string(FileAccess.get_file_as_string(output)) if FileAccess.file_exists(output) else null
 DirAccess.remove_absolute(input);DirAccess.remove_absolute(output)
 return result if result is Dictionary else {"ok":false,"error":"Serviço local indisponível"}

func call_service(op: String, req: Dictionary = {}) -> Dictionary:
 while busy: await get_tree().process_frame
 if python == "": return {"ok":false,"error":"Python indisponível"}
 busy = true
 worker = Thread.new()
 var err := worker.start(_execute.bind(op, req.duplicate(true)))
 if err != OK:
  busy = false
  return {"ok":false,"error":"Não foi possível iniciar a fila"}
 while worker.is_alive(): await get_tree().process_frame
 var result: Dictionary = worker.wait_to_finish()
 worker = null
 busy = false
 return result

func configured() -> bool:
 var result := await call_service("config")
 return not result.get("config", {}).is_empty()

func configure_dialog() -> void:
 var d := AcceptDialog.new()
 d.title = "RS SMS Gateway • pareamento e fila"
 d.min_size = Vector2i(700,560)
 var box := VBoxContainer.new()
 d.add_child(box)
 var url := LineEdit.new();url.placeholder_text="https://IP-DO-CELULAR:8743";box.add_child(url)
 var pin := LineEdit.new();pin.placeholder_text="SHA256 exibido no aplicativo (64 caracteres)";box.add_child(pin)
 var code := LineEdit.new();code.placeholder_text="Código temporário de pareamento";code.secret=true;box.add_child(code)
 var feedback := Label.new();feedback.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;box.add_child(feedback)
 var pair := Button.new();pair.text="Conferi o certificado • Parear";box.add_child(pair)
 pair.pressed.connect(func():
  pair.disabled=true
  var result := await call_service("pair",{"url":url.text.strip_edges(),"fingerprint":pin.text.strip_edges().to_lower(),"code":code.text.strip_edges()})
  code.clear()
  if is_instance_valid(feedback): feedback.text="Pareado. Pedidos vencem em 2 horas." if result.get("ok",false) else str(result.get("error","Falha"))
  if is_instance_valid(pair): pair.disabled=false
 )
 var address := Button.new();address.text="Atualizar somente endereço (preserva certificado)";box.add_child(address)
 address.pressed.connect(func():
  var result := await call_service("address",{"url":url.text.strip_edges()})
  if is_instance_valid(feedback):feedback.text="Endereço atualizado" if result.get("ok",false) else str(result.get("error","Falha"))
 )
 var history := ItemList.new();history.custom_minimum_size=Vector2(640,240);box.add_child(history)
 var refresh := Button.new();refresh.text="Atualizar histórico";box.add_child(refresh)
 var refresh_action := func():
  await call_service("refresh_delivery",{"cursor":delivery_cursor})
  delivery_cursor+=1
  var result := await call_service("list")
  if not is_instance_valid(history):return
  history.clear()
  for job in result.get("jobs",[]):
   var payload: Dictionary=job.get("payload",{})
   var index := history.add_item("%s • %s" % [payload.get("serial",""), LABELS.get(job.get("state",""),job.get("state",""))])
   history.set_item_metadata(index,job.get("id",""))
   history.set_item_tooltip(index,str(job.get("detail","")))
 refresh.pressed.connect(refresh_action)
 var cancel := Button.new();cancel.text="Cancelar pedido selecionado";box.add_child(cancel)
 cancel.pressed.connect(func():
  if history.get_selected_items().is_empty():return
  var id: String=history.get_item_metadata(history.get_selected_items()[0])
  var result := await call_service("cancel",{"id":id})
  if is_instance_valid(feedback):feedback.text="Cancelamento registrado; se recebido, aguarda confirmação do celular." if result.get("ok",false) else str(result.get("error","Falha"))
  refresh_action.call()
 )
 host.add_child(d);d.popup_centered()
 d.confirmed.connect(d.queue_free);d.canceled.connect(d.queue_free)
 var existing := await call_service("config")
 if is_instance_valid(url):
  url.text=str(existing.get("config",{}).get("url",""))
  pin.text=str(existing.get("config",{}).get("fingerprint",""))
  refresh_action.call()

func confirm_send(product: Dictionary) -> void:
 if str(host.selected_branch_id) != "imperatriz":return
 if is_instance_valid(active_composer):return
 var branch := str(host.selected_branch_id)
 var serial_local: String=host._digits_only(str(product.get("imei",product.get("sku",""))))
 if serial_local.is_empty():serial_local=host._digits_only(str(product.get("equipment_number",product.get("serial",""))))
 var context:Dictionary={"version":2,"serial":serial_local,"source_phone_snapshot":"","apn_snapshot":"","standard_command_snapshot":"","status_snapshot":str(product.get("tracker_status",product.get("status",""))),"ready":false}
 var card:=show_composer(context,"")
 active_composer=card
 var input:LineEdit=card.find_child("Recipient",true,false)
 input.text=host._format_grupo_rs_sms_phone(str(product.get("chip_phone","")))
 input.text_changed.emit(input.text)
 var initial_phone:=input.text
 await _load_composer_target(card,product,context,branch,initial_phone)

func _composer_failure(card: AcceptDialog, message: String, summary: String) -> void:
 var feedback:Label=card.find_child("ValidationError",true,false)
 feedback.text=message
 feedback.add_theme_color_override("font_color",Color("#a25714"))
 var value:Label=card.find_child("GatewaySummary",true,false).find_child("Value",true,false)
 value.text=summary
 value.add_theme_color_override("font_color",Color("#a25714"))
 card.find_child("RetryLookup",true,false).show()

func _load_composer_target(card: AcceptDialog, product: Dictionary, context: Dictionary, branch: String, initial_phone: String) -> void:
 var input:LineEdit=card.find_child("Recipient",true,false)
 var retry:Button=card.find_child("RetryLookup",true,false)
 retry.hide()
 if not retry.pressed.is_connected(_retry_composer.bind(card,product,context,branch)):
  retry.pressed.connect(_retry_composer.bind(card,product,context,branch))
 var conf:=await call_service("config")
 if not is_instance_valid(card):return
 if str(host.selected_branch_id)!=branch:card.queue_free();return
 var feedback:Label=card.find_child("ValidationError",true,false)
 if not conf.get("ok",false):
  _composer_failure(card,"Não foi possível ler a configuração do gateway. Consulte novamente.","Configuração indisponível")
  return
 if conf.get("config",{}).is_empty():
  card.queue_free()
  host._show_arya_sms_dialog(product,true)
  return
 var result: Dictionary = await host._resolve_grupo_rs_manual_sms_target(product, false)
 if not is_instance_valid(card):return
 if str(host.selected_branch_id)!=branch:card.queue_free();return
 if not result.get("ok",false):
  _composer_failure(card,str(result.get("message","Consulta falhou. Envio bloqueado.")),str(result.get("summary","Consulta não confirmada")))
  return
 var serial := str(result.get("serial",""))
 var local_sync:Dictionary=host._sync_confirmed_sms_contact(product,result)
 var apn := str(result.get("apn",""))
 var command: String=host._rs300_apn_command_for_apn(serial,apn)
 var phone: String="+55"+host._digits_only(str(result.get("phone","")))
 var snapshot: String=str(product.get("tracker_status",product.get("status","")))
 if snapshot.is_empty():
  _composer_failure(card,"Status do equipamento não confirmado.","Status não confirmado")
  return
 context.merge({"serial":serial,"source_phone_snapshot":phone,"apn_snapshot":apn,"standard_command_snapshot":command,"status_snapshot":snapshot,"gateway_url":str(conf.config.get("url","")),"ready":true},true)
 if input.text==initial_phone:
  input.text=host._format_grupo_rs_sms_phone(str(result.get("phone","")))
  input.text_changed.emit(input.text)
 feedback.text="Dados conferidos. Revise o destinatário antes de enviar."
 if str(result.get("origin","")).begins_with("Portal"):
  feedback.text="Telefone confirmado no portal: mesma série e chip. Revise antes de enviar."
 if local_sync.get("changed",false):feedback.text+=" Cadastro local atualizado."
 elif not local_sync.get("ok",false):feedback.text+=" Sem atualização local."
 card.find_child("GatewaySummary",true,false).find_child("Value",true,false).text="Pronto para revisar"
 card.find_child("GatewaySummary",true,false).find_child("Value",true,false).add_theme_color_override("font_color",Color("#137d78"))
 feedback.add_theme_color_override("font_color",Color("#49708f"))
 card.find_child("QuickSMS",true,false).disabled=command.is_empty()
 card.find_child("SendCustomSMS",true,false).disabled=false

func _retry_composer(card: AcceptDialog, product: Dictionary, context: Dictionary, branch: String) -> void:
 if not is_instance_valid(card):return
 context["ready"]=false
 card.find_child("QuickSMS",true,false).disabled=true
 card.find_child("SendCustomSMS",true,false).disabled=true
 card.find_child("GatewaySummary",true,false).find_child("Value",true,false).text="Consultando aparelho…"
 card.find_child("ValidationError",true,false).text="Conferindo o cadastro online. Você pode continuar escrevendo."
 await _load_composer_target(card,product,context,branch,host._format_grupo_rs_sms_phone(str(product.get("chip_phone",""))))

func show_composer(context: Dictionary, gateway_url: String) -> AcceptDialog:
 var card := AcceptDialog.new()
 card.name="SMSComposer"
 card.title="SMS • aparelho "+str(context.serial)
 card.borderless=true
 card.transparent_bg=true
 card.transparent=true
 card.unresizable=true
 card.min_size=Vector2i(940,580)
 card.get_ok_button().hide()
 var palette:=Theme.new()
 palette.default_font_size=16
 palette.default_font=REGULAR
 palette.set_color("font_color","Label",Color("#123555"))
 palette.set_stylebox("panel","AcceptDialog",host._style_box(Color("#f5f8fc"),Color("#d9e5f0"),1,18,true))
 card.theme=palette
 # A fixed layout host prevents transient autowrap minimum sizes (including
 # while hidden for review) from enlarging the native dialog beyond the screen.
 var layout_host:=Control.new();layout_host.name="ComposerLayout";layout_host.custom_minimum_size=Vector2(940,580);card.add_child(layout_host)
 var root_box:=VBoxContainer.new();root_box.add_theme_constant_override("separation",0);layout_host.add_child(root_box);root_box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
 var banner:=PanelContainer.new()
 var banner_style:=StyleBoxTexture.new();banner_style.texture=preload("res://assets/ui/sms_header.svg")
 # Nine-patch margins retain the same 18 px top corners as the outer card.
 for side in [SIDE_LEFT,SIDE_RIGHT,SIDE_TOP]:banner_style.set_texture_margin(side,18)
 for side in [SIDE_LEFT,SIDE_RIGHT]:banner_style.set_content_margin(side,24)
 for side in [SIDE_TOP,SIDE_BOTTOM]:banner_style.set_content_margin(side,14)
 banner.add_theme_stylebox_override("panel",banner_style);root_box.add_child(banner)
 var header:=HBoxContainer.new();header.add_theme_constant_override("separation",20);banner.add_child(header)
 var heading:=VBoxContainer.new();heading.size_flags_horizontal=Control.SIZE_EXPAND_FILL;header.add_child(heading)
 var title:=Label.new();title.text="Enviar comando por SMS";title.add_theme_font_size_override("font_size",22);title.add_theme_color_override("font_color",Color.WHITE);heading.add_child(title)
 var subtitle:=Label.new();subtitle.text="Mensagem personalizada ou configuração rápida.";subtitle.add_theme_font_size_override("font_size",14);subtitle.add_theme_color_override("font_color",Color("#d8eaff"));heading.add_child(subtitle)
 var quick:Button=host._make_action_button("SMS padrão",Color.WHITE,Color.WHITE,Color("#174c7c"),Vector2(170,48),func():
  _confirm_message(context,context.source_phone_snapshot,context.standard_command_snapshot,"standard",gateway_url,card)
 )
 quick.name="QuickSMS";quick.icon=load("res://assets/icons/approved/mail.svg");quick.tooltip_text="Consulta já confirmada: usar telefone original e comando de configuração, sem aproveitar o texto digitado.";quick.disabled=str(context.standard_command_snapshot).is_empty();header.add_child(quick)
 quick.icon_alignment=HORIZONTAL_ALIGNMENT_LEFT
 quick.add_theme_constant_override("h_separation",10)
 for state_name in ["normal","hover","pressed","focus"]:
  var quick_style:StyleBox=quick.get_theme_stylebox(state_name).duplicate()
  quick_style.set_content_margin(SIDE_LEFT,18);quick_style.set_content_margin(SIDE_RIGHT,18)
  quick.add_theme_stylebox_override(state_name,quick_style)
 var close:=Button.new();close.text="×";close.flat=true;close.add_theme_font_size_override("font_size",28);close.add_theme_color_override("font_color",Color.WHITE);close.pressed.connect(card.queue_free);header.add_child(close)
 var margin:=MarginContainer.new()
 for side in ["left","right","top","bottom"]:margin.add_theme_constant_override("margin_"+side,20)
 root_box.add_child(margin)
 var columns:=HBoxContainer.new();columns.add_theme_constant_override("separation",24);margin.add_child(columns)
 var box:=VBoxContainer.new();box.size_flags_horizontal=Control.SIZE_EXPAND_FILL;box.size_flags_stretch_ratio=2.2;box.add_theme_constant_override("separation",10);columns.add_child(box)
 var summaries:=HBoxContainer.new();summaries.add_theme_constant_override("separation",14);box.add_child(summaries)
 summaries.add_child(_summary_card("APARELHO • IMPERATRIZ",str(context.serial),"res://assets/icons/approved/chip.svg",Color("#176dc0"),"EquipmentSummary"))
 summaries.add_child(_summary_card("VALIDAÇÃO PARA SMS","Consultando aparelho…" if not context.get("ready",true) else "Confirmação antes do envio","res://assets/icons/approved/signal.svg",Color("#137d78"),"GatewaySummary"))
 var phone_label:=Label.new();phone_label.text="Telefone do chip do rastreador";box.add_child(phone_label)
 var phone:=LineEdit.new();phone.name="Recipient";phone.text=host._format_grupo_rs_sms_phone(str(context.source_phone_snapshot));phone.placeholder_text="DDD + telefone";host._style_line_edit(phone);box.add_child(phone)
 var hint:=Label.new();hint.text="Telefone do cadastro • confira antes de enviar.";hint.add_theme_font_size_override("font_size",13);box.add_child(hint)
 var message_label:=Label.new();message_label.text="Mensagem / comando personalizado";box.add_child(message_label)
 var message:=TextEdit.new();message.name="Message";message.placeholder_text="Digite o comando que deseja enviar…";message.custom_minimum_size=Vector2(0,120);host._style_text_edit(message);box.add_child(message)
 message.add_theme_font_override("font",REGULAR);message.add_theme_font_size_override("font_size",18)
 var counter:=Label.new();counter.text="0 / 160 • somente texto simples; sem SMS dividido";counter.add_theme_font_size_override("font_size",14);box.add_child(counter)
 message.text_changed.connect(func():counter.text="%d / 160 • somente texto simples; sem SMS dividido" % message.text.length())
 var error:=Label.new();error.name="ValidationError";error.add_theme_color_override("font_color",Color("#b83232"));error.add_theme_font_size_override("font_size",14);error.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;box.add_child(error)
 var retry:Button=host._make_action_button("Consultar novamente",Color("#ffffff"),Color("#c7dcef"),Color("#174c7c"),Vector2(215,44),func():pass)
 retry.name="RetryLookup";retry.icon=load("res://assets/icons/approved/refresh.svg");retry.size_flags_horizontal=Control.SIZE_SHRINK_BEGIN;retry.hide()
 if not context.get("ready",true):
  error.text="Conferindo cadastro e gateway… Você já pode escrever."
  error.add_theme_color_override("font_color",Color("#58738e"))
 var send:Button=host._make_action_button("Enviar mensagem",Color("#1678d4"),Color("#1678d4"),Color.WHITE,Vector2(0,58),func():
  _confirm_message(context,phone.text,message.text,"custom",gateway_url,card)
 )
 var actions:=HBoxContainer.new();actions.add_theme_constant_override("separation",12);box.add_child(actions)
 send.name="SendCustomSMS";send.icon=load("res://assets/icons/sms_send.svg");send.icon_alignment=HORIZONTAL_ALIGNMENT_LEFT;send.size_flags_horizontal=Control.SIZE_SHRINK_BEGIN;send.custom_minimum_size=Vector2(260,56);send.disabled=not context.get("ready",true);actions.add_child(send);actions.add_child(retry)
 for state_name in ["normal","hover","pressed","focus"]:
  var send_style:StyleBox=send.get_theme_stylebox(state_name).duplicate()
  send_style.set_content_margin(SIDE_LEFT,24);send_style.set_content_margin(SIDE_RIGHT,24)
  send.add_theme_stylebox_override(state_name,send_style)
 var footer:=Label.new();footer.text="Você revisará o destinatário e o texto antes de confirmar. Validade: 2 horas.";footer.add_theme_font_size_override("font_size",14);footer.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;box.add_child(footer)
 var preview:=PanelContainer.new();preview.custom_minimum_size.x=300;preview.size_flags_horizontal=Control.SIZE_EXPAND_FILL;preview.size_flags_vertical=Control.SIZE_SHRINK_BEGIN;preview.add_theme_stylebox_override("panel",host._style_box(Color("#e3edf6"),Color("#bfd2e5"),1,18,true));columns.add_child(preview)
 preview.name="SMSPreviewCard";CARD_MOTION.attach(preview)
 var preview_margin:=MarginContainer.new()
 for side in ["left","right","top","bottom"]:preview_margin.add_theme_constant_override("margin_"+side,20)
 preview.add_child(preview_margin)
 var preview_box:=VBoxContainer.new();preview_box.add_theme_constant_override("separation",16);preview_margin.add_child(preview_box)
 var preview_title:=Label.new();preview_title.text="PRÉVIA DO SMS";preview_title.add_theme_font_size_override("font_size",15);preview_box.add_child(preview_title)
 var bubble:=PanelContainer.new();bubble.add_theme_stylebox_override("panel",host._style_box(Color.WHITE,Color("#d1dfec"),1,16,true));preview_box.add_child(bubble)
 var bubble_margin:=MarginContainer.new()
 for side in ["left","right","top","bottom"]:bubble_margin.add_theme_constant_override("margin_"+side,18)
 bubble.add_child(bubble_margin)
 var bubble_box:=VBoxContainer.new();bubble_box.add_theme_constant_override("separation",16);bubble_margin.add_child(bubble_box)
 var recipient_preview:=Label.new();recipient_preview.name="RecipientPreview";recipient_preview.add_theme_font_size_override("font_size",16);recipient_preview.add_theme_color_override("font_color",Color("#1473ce"));bubble_box.add_child(recipient_preview)
 var message_preview:=Label.new();message_preview.name="MessagePreview";message_preview.custom_minimum_size.y=140;message_preview.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;message_preview.add_theme_font_size_override("font_size",17);bubble_box.add_child(message_preview)
 var preview_note:=Label.new();preview_note.text="SMS via Galaxy\nWi-Fi local • fila de 2 horas\nNenhum envio antes da confirmação";preview_note.add_theme_font_size_override("font_size",14);preview_note.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;preview_box.add_child(preview_note)
 var update_preview:=func():
  recipient_preview.text="Para: "+phone.text
  message_preview.text=message.text if not message.text.is_empty() else "Sua mensagem aparecerá aqui antes do envio."
 phone.text_changed.connect(func(_text:String):update_preview.call())
 message.text_changed.connect(update_preview);update_preview.call()
 host.add_child(card);card.canceled.connect(card.queue_free);_open_composer(card)
 return card

func _confirm_message(context: Dictionary, recipient: String, message: String, mode: String, gateway_url: String, card: AcceptDialog) -> void:
 if str(host.selected_branch_id)!="imperatriz":return
 if not context.get("ready",true):return
 var formatted:String=host._format_grupo_rs_sms_phone(recipient)
 var feedback:Label=card.find_child("ValidationError",true,false);feedback.text=""
 if formatted.is_empty():feedback.text="Informe um telefone brasileiro válido com DDD.";return
 if message.strip_edges().is_empty() or message.length()>160:
  feedback.text="Digite uma mensagem de 1 a 160 caracteres.";return
 for index in message.length():
  if message.unicode_at(index)<32 or message.unicode_at(index)>126:
   feedback.text="Use texto simples, sem acentos ou quebras de linha.";return
 var payload:=context.duplicate(true)
 payload.erase("ready");payload.erase("gateway_url")
 payload["phone"]="+55"+host._digits_only(formatted)
 payload["command"]=message
 payload["command_mode"]=mode
 var dialog := ConfirmationDialog.new()
 dialog.name="SMSReview"
 dialog.title="Confirmar SMS pelo celular"
 dialog.theme=card.theme.duplicate()
 var review_style:StyleBox=host._style_box(Color("#f5f8fc"),Color("#d9e5f0"),1,22,true)
 for side in [SIDE_LEFT,SIDE_RIGHT,SIDE_TOP,SIDE_BOTTOM]:review_style.set_content_margin(side,28)
 dialog.theme.set_stylebox("panel","AcceptDialog",review_style)
 dialog.borderless=true
 dialog.transparent_bg=true
 dialog.transparent=true
 dialog.dialog_text="Revisar mensagem\n\nAparelho: %s\nDestinatário: %s\nAPN: %s\nModo: %s\nGateway: %s\n\n%s\n\nSMS pode gerar custo e alterar a configuração do rastreador.\nValidade: 2 horas; o envio será automático quando disponível." % [context.serial,formatted,context.apn_snapshot,"Personalizado" if mode=="custom" else "Configuração padrão",context.get("gateway_url",gateway_url),message]
 dialog.ok_button_text="Confirmar e colocar na fila"
 dialog.cancel_button_text="Voltar e editar"
 dialog.get_label().hide()
 var review_box:=VBoxContainer.new();review_box.name="ReviewCards";review_box.add_theme_constant_override("separation",16);dialog.add_child(review_box)
 var title:=Label.new();title.text="Revisar mensagem";title.add_theme_font_size_override("font_size",23);title.add_theme_font_override("font",host.UI_FONT);review_box.add_child(title)
 var subtitle:=Label.new();subtitle.text="Confira o destino e o comando antes de confirmar.";subtitle.add_theme_color_override("font_color",Color("#58738e"));review_box.add_child(subtitle)
 var summaries:=HBoxContainer.new();summaries.add_theme_constant_override("separation",16);review_box.add_child(summaries)
 summaries.add_child(_summary_card("APARELHO • IMPERATRIZ",str(context.serial),"res://assets/icons/approved/chip.svg",Color("#176dc0"),"ReviewEquipment"))
 summaries.add_child(_summary_card("DESTINATÁRIO",formatted,"res://assets/icons/approved/mail.svg",Color("#137d78"),"ReviewRecipient"))
 var command_card:=PanelContainer.new();command_card.name="ReviewCommand";review_box.add_child(command_card)
 var command_style:StyleBox=host._style_box(Color.WHITE,Color("#c5daed"),1,16,true)
 for side in [SIDE_LEFT,SIDE_RIGHT,SIDE_TOP,SIDE_BOTTOM]:command_style.set_content_margin(side,18)
 command_card.add_theme_stylebox_override("panel",command_style);CARD_MOTION.attach(command_card)
 var command_box:=VBoxContainer.new();command_box.add_theme_constant_override("separation",10);command_card.add_child(command_box)
 var mode_label:=Label.new();mode_label.text="COMANDO PERSONALIZADO" if mode=="custom" else "CONFIGURAÇÃO PADRÃO";mode_label.add_theme_font_size_override("font_size",12);mode_label.add_theme_color_override("font_color",Color("#176dc0"));command_box.add_child(mode_label)
 var command_text:=Label.new();command_text.name="ReviewCommandText";command_text.text=message;command_text.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;command_text.custom_minimum_size=Vector2(680,70);command_text.add_theme_font_size_override("font_size",18);command_box.add_child(command_text)
 var connection:=Label.new();connection.text="APN: %s   •   Gateway: %s" % [context.apn_snapshot,context.get("gateway_url",gateway_url)];connection.add_theme_font_size_override("font_size",13);connection.add_theme_color_override("font_color",Color("#58738e"));command_box.add_child(connection)
 var warning:=PanelContainer.new();warning.add_theme_stylebox_override("panel",host._style_box(Color("#fff2e4"),Color("#f5dfc5"),1,12));review_box.add_child(warning)
 var warning_margin:=MarginContainer.new()
 for side in ["left","right","top","bottom"]:warning_margin.add_theme_constant_override("margin_"+side,14)
 warning.add_child(warning_margin)
 var warning_text:=Label.new();warning_text.text="SMS pode gerar custo e alterar a configuração do rastreador.\nFila válida por 2 horas; envio automático quando o gateway estiver disponível.";warning_text.add_theme_font_size_override("font_size",14);warning_text.add_theme_color_override("font_color",Color("#88551e"));warning_margin.add_child(warning_text)
 for button in [dialog.get_ok_button(),dialog.get_cancel_button()]:
  button.custom_minimum_size.y=46
  button.add_theme_font_override("font",REGULAR)
  button.add_theme_color_override("font_color",Color("#123555"))
  button.add_theme_color_override("font_focus_color",Color("#123555"))
  button.add_theme_color_override("font_hover_color",Color("#123555"))
  button.add_theme_color_override("font_pressed_color",Color("#123555"))
  button.add_theme_stylebox_override("normal",host._style_box(Color("#e7f1fc"),Color("#c5dbee"),1,10))
  button.add_theme_stylebox_override("hover",host._style_box(Color("#d6e9fc"),Color("#7eaedd"),1,10))
  for state_name in ["normal","hover"]:
   var button_style:StyleBox=button.get_theme_stylebox(state_name)
   button_style.set_content_margin(SIDE_TOP,12);button_style.set_content_margin(SIDE_BOTTOM,12)
   button_style.set_content_margin(SIDE_LEFT,18);button_style.set_content_margin(SIDE_RIGHT,18)
  button.add_theme_stylebox_override("focus",host._style_box(Color.TRANSPARENT,Color("#78b4ed"),2,10))
  CARD_MOTION.attach(button)
 var confirm_button:=dialog.get_ok_button()
 for color_name in ["font_color","font_hover_color","font_pressed_color","font_focus_color"]:confirm_button.add_theme_color_override(color_name,Color.WHITE)
 for state_name in ["normal","hover","pressed"]:
  var confirm_style:StyleBox=host._style_box(Color("#1678d4") if state_name=="normal" else Color("#1164b5"),Color("#1678d4"),1,10)
  for side in [SIDE_TOP,SIDE_BOTTOM]:confirm_style.set_content_margin(side,12)
  for side in [SIDE_LEFT,SIDE_RIGHT]:confirm_style.set_content_margin(side,20)
  confirm_button.add_theme_stylebox_override(state_name,confirm_style)
 dialog.get_label().add_theme_color_override("font_color",Color("#123555"))
 dialog.get_label().add_theme_font_override("font",REGULAR)
 card.hide()
 host.add_child(dialog);dialog.popup_centered(Vector2i(820,580))
 if OS.get_environment("GRUPO_RS_REDUCED_MOTION")!="1":
  var destination:=dialog.position;dialog.position+=Vector2i(0,20);review_box.modulate.a=0.0
  var entrance:=dialog.create_tween().set_parallel(true)
  entrance.tween_property(dialog,"position",destination,0.3).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
  entrance.tween_property(review_box,"modulate:a",1.0,0.22)
 dialog.canceled.connect(func():
  dialog.hide()
  dialog.queue_free()
  if is_instance_valid(card):_open_composer(card)
 )
 dialog.confirmed.connect(func():
  dialog.hide()
  dialog.queue_free()
  if str(host.selected_branch_id)!="imperatriz":return
  payload["confirmed_at"]=int(Time.get_unix_time_from_system())
  var saved := await call_service("enqueue",payload)
  if saved.get("ok",false) and is_instance_valid(card):card.queue_free()
  elif is_instance_valid(card):_open_composer(card)
  if saved.get("ok",false):show_submission_notice()
  elif is_instance_valid(card):card.find_child("ValidationError",true,false).text=str(saved.get("error","Não gravado"))
 )

func _tick() -> void:
 if ticking:return
 ticking=true
 await _sync_one()
 if is_instance_valid(host) and str(host.selected_branch_id)=="imperatriz":
  await call_service("refresh_delivery",{"cursor":delivery_cursor})
  delivery_cursor+=1
 ticking=false

func _sync_one() -> void:
 if busy or not is_instance_valid(host) or str(host.selected_branch_id)!="imperatriz" or host.store==null:return
 var pending := await call_service("pending")
 var job: Variant=pending.get("job")
 if not job is Dictionary:return
 var id: String=str(job.get("id",""))
 var sync := await call_service("reconcile",{"id":id})
 if not sync.get("needs_validation",false):return
 if str(host.selected_branch_id)!="imperatriz" or host.store==null:return
 var bound_store: Variant=host.store
 var payload: Dictionary=job.get("payload",{})
 var product: Dictionary=host.store.get_product(str(payload.get("serial","")))
 if product.is_empty():return
 var target: Dictionary=await host._resolve_grupo_rs_manual_sms_target(product, int(payload.get("version",1))==1)
 if str(host.selected_branch_id)!="imperatriz" or host.store!=bound_store:return
 if not target.get("ok",false):return
 var phone: String="+55"+host._digits_only(str(target.get("phone","")))
 var command: String=host._rs300_apn_command_for_apn(str(payload.get("serial","")),str(target.get("apn","")))
 if job.has("batch"):
  command=command.replace("grupors1.ddns.net","grupors%d.ddns.net" % int(job.batch.group_no))
 var latest: Dictionary=host.store.get_product(str(payload.get("serial","")))
 var status: String=str(latest.get("tracker_status",latest.get("status","")))
 var expected_phone:String=str(payload.get("source_phone_snapshot",payload.get("phone","")))
 var expected_command:String=str(payload.get("standard_command_snapshot",payload.get("command","")))
 var changed_apn:bool=int(payload.get("version",1))==2 and str(target.get("apn",""))!=str(payload.get("apn_snapshot",""))
 if phone!=expected_phone or command!=expected_command or changed_apn or status!=str(payload.get("status_snapshot","")):
  await call_service("revalidate_failed",{"id":id});return
 await call_service("reconcile",{"id":id,"validated":true})
