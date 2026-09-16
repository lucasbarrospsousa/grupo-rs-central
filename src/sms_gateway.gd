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
 var branch := str(host.selected_branch_id)
 var result: Dictionary = await host._resolve_grupo_rs_manual_sms_target(product)
 if str(host.selected_branch_id)!=branch:return
 if not result.get("ok",false):
  host._show_warning("Gateway SMS",str(result.get("message","Consulta falhou")));return
 var serial := str(result.get("serial",""))
 var apn := str(result.get("apn",""))
 var command: String=host._rs300_apn_command_for_apn(serial,apn)
 var phone: String="+55"+host._digits_only(str(result.get("phone","")))
 if command.is_empty():return
 var snapshot: String=str(product.get("tracker_status",product.get("status","")))
 if snapshot.is_empty():
  host._show_warning("Gateway SMS","Status do equipamento não confirmado.");return
 var conf := await call_service("config")
 var dialog := ConfirmationDialog.new()
 dialog.title="Confirmar SMS pelo celular"
 dialog.dialog_text="Aparelho: %s\nTelefone: %s\nAPN: %s\nGateway: %s\n\n%s\n\nValidade: 2 horas. SMS pode gerar custo.\nEntrará na fila; envio automático quando o gateway estiver disponível." % [serial,phone,apn,conf.get("config",{}).get("url",""),command]
 dialog.ok_button_text="Confirmar e colocar na fila"
 host.add_child(dialog);dialog.popup_centered(Vector2i(800,380))
 dialog.canceled.connect(dialog.queue_free)
 dialog.confirmed.connect(func():
  dialog.queue_free()
  if str(host.selected_branch_id)!=branch:return
  var saved := await call_service("enqueue",{"serial":serial,"phone":phone,"command":command,"status_snapshot":snapshot,"confirmed_at":int(Time.get_unix_time_from_system())})
  if saved.get("ok",false):host._show_success("Gateway SMS","Pedido registrado. Validade de 2 horas; acompanhe em Configurações SMS → Gateway.")
  else:host._show_warning("Gateway SMS",str(saved.get("error","Não gravado")))
 )

func _tick() -> void:
 if ticking:return
 ticking=true
 await _sync_one()
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
 var target: Dictionary=await host._resolve_grupo_rs_manual_sms_target(product)
 if str(host.selected_branch_id)!="imperatriz" or host.store!=bound_store:return
 if not target.get("ok",false):return
 var phone: String="+55"+host._digits_only(str(target.get("phone","")))
 var command: String=host._rs300_apn_command_for_apn(str(payload.get("serial","")),str(target.get("apn","")))
 var latest: Dictionary=host.store.get_product(str(payload.get("serial","")))
 var status: String=str(latest.get("tracker_status",latest.get("status","")))
 if phone!=str(payload.get("phone","")) or command!=str(payload.get("command","")) or status!=str(payload.get("status_snapshot","")):
  await call_service("revalidate_failed",{"id":id});return
 await call_service("reconcile",{"id":id,"validated":true})
