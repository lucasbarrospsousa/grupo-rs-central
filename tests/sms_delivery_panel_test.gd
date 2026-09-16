extends SceneTree
class Shell extends "res://src/inventory_dashboard.gd":
 func _ready() -> void:pass
 func _process(_delta:float) -> void:pass
class Gateway extends "res://src/sms_gateway.gd":
 var sample:Array=[]
 var receipt_polls:=0
 func call_service(op:String,_req:Dictionary={}) -> Dictionary:
  assert(op in ["list","health","refresh_delivery"])
  await get_tree().process_frame
  if op=="refresh_delivery":receipt_polls+=1;return {"ok":true}
  if op=="list":return {"ok":true,"jobs":sample}
  return {"ok":true,"checked_at":1789560000,"health":{"send_enabled":false}}
func _initialize() -> void:call_deferred("run")
func run() -> void:
 assert(OS.get_environment("GRUPO_RS_TEST_OUTPUT")!="")
 root.size=Vector2i(1917,1022);root.content_scale_size=root.size
 var shell:=Shell.new();root.add_child(shell);shell.selected_branch_id="imperatriz"
 var gateway:=Gateway.new();shell.add_child(gateway);gateway.host=shell
 for status in ["waiting_gateway","received","sent","delivered","failed","indeterminate"]:
  gateway.sample.append({"id":status,"state":status,"detail":"Confirmação do Android" if status=="sent" else "", "payload":{"serial":"024000001","phone":"+5511999999999","command":"COMANDO DE DEMONSTRACAO","created_at":1789550000,"expires_at":1789557200},"acknowledgements":[{"state":status,"observed_at":1789560000}]})
 gateway.show_delivery_panel()
 var panel:AcceptDialog=gateway.delivery_panel
 await create_timer(0.5).timeout
 assert(panel.visible and panel.size==Vector2i(1100,740))
 assert(panel.counters[0].text=="2" and panel.counters[1].text=="2" and panel.counters[2].text=="1" and panel.counters[3].text=="2")
 assert(panel.connection.text.contains("diagnóstico"))
 assert(panel.find_child("DeliveryMetric0",true,false).has_meta("card_hover_motion"))
 await gateway._tick();assert(gateway.receipt_polls==1,"Receipt polling works with no active unsent job")
 panel.table.get_root().get_child(2).select(0);panel.show_details();assert(panel.detail.text.contains("SMS enviado"))
 if DisplayServer.get_name()!="headless":
  await process_frame;RenderingServer.force_draw()
  root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("sms-delivery-panel.png"))
 panel.render_jobs([]);assert(panel.detail.text.contains("Nenhum pedido"))
 panel.queue_free();await process_frame;shell.queue_free();await process_frame
 print("SMS_DELIVERY_PANEL_OK: read-only, counters, details, empty state, animation")
 quit()
