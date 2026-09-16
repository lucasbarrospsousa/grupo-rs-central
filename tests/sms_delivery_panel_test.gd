extends SceneTree
class Shell extends "res://tests/fixtures/offline_main_dashboard.gd":
 func _sms_recovery_check_pending() -> void:assert(false,"Old SMS page recovery must not run")
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
 var original:Node=shell.get_node_or_null("PhoneSMSGateway")
 if original:shell.remove_child(original);original.queue_free()
 var gateway:=Gateway.new();gateway.name="PhoneSMSGateway";shell.add_child(gateway);gateway.host=shell
 for status in ["waiting_gateway","received","sent","delivered","failed","indeterminate"]:
  gateway.sample.append({"id":status,"state":status,"detail":"Confirmação do Android" if status=="sent" else "", "payload":{"serial":"024000001","phone":"+5511999999999","command":"COMANDO DE DEMONSTRACAO","created_at":1789550000,"expires_at":1789557200},"acknowledgements":[{"state":status,"observed_at":1789560000}]})
 gateway.show_delivery_panel()
 var panel:Control=shell.content_area.get_child(0)
 await create_timer(0.5).timeout
 assert(panel.visible and shell.current_section=="sms_panel")
 assert(shell.content_area.get_child_count()==1 and panel.name=="SMSDeliveryPanel")
 assert(panel.counters[0].text=="2" and panel.counters[1].text=="2" and panel.counters[2].text=="1" and panel.counters[3].text=="2")
 assert(panel.connection.text.contains("diagnóstico"))
 assert(panel.find_child("DeliveryMetric0",true,false).has_meta("card_hover_motion"))
 await gateway._tick();assert(gateway.receipt_polls==1,"Receipt polling works with no active unsent job")
 panel.table.get_root().get_child(2).select(0);panel.show_details();assert(panel.detail.text.contains("SMS enviado"))
 if DisplayServer.get_name()!="headless":
  await process_frame;RenderingServer.force_draw()
  root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("sms-delivery-panel.png"))
 panel.render_jobs([]);assert(panel.detail.text.contains("Nenhum pedido"))
 shell._set_page_context("inventory","Estoque")
 var notice:AcceptDialog=gateway.show_submission_notice()
 assert(notice.find_child("SubmissionStatus",true,false).text.contains("registrado na fila") and notice.ok_button_text=="Painel SMS")
 assert(shell.current_section=="inventory","Submission notice must not navigate automatically")
 await create_timer(0.3).timeout
 if DisplayServer.get_name()!="headless":
  RenderingServer.force_draw();root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("sms-submission-notice.png"))
 notice.find_child("OpenSMSPanel",true,false).pressed.emit();await create_timer(0.4).timeout
 assert(shell.current_section=="sms_panel" and shell.content_area.get_child_count()==1)
 shell.selected_branch_id="maraba";gateway.show_delivery_panel();await create_timer(0.4).timeout
 var regional:Control=shell.content_area.get_child(0)
 assert(regional.jobs.is_empty() and regional.connection.text.contains("somente em Imperatriz"))
 shell.queue_free();await process_frame
 print("SMS_DELIVERY_PANEL_OK: read-only, counters, details, empty state, animation")
 quit()
