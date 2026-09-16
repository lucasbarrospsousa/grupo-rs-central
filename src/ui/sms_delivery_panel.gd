extends MarginContainer
## Read-only monitor: never enqueue, retransmit or cancel from this panel.
const MOTION=preload("res://src/ui/card_hover_motion.gd")
const COLORS={"waiting_gateway":"#2377ce","received":"#2377ce","sending":"#2377ce","sent":"#168364","delivered":"#168364","failed":"#c84545","expired":"#af641b","indeterminate":"#af641b","needs_confirmation":"#af641b","cancelled":"#64768a"}
const TITLES={"waiting_gateway":"Aguardando celular","received":"Recebido pelo celular","sending":"Enviando SMS","sent":"SMS enviado","delivered":"Entrega confirmada","failed":"Falhou","expired":"Expirado","indeterminate":"Resultado indeterminado","needs_confirmation":"Nova confirmação necessária","cancelled":"Cancelado"}
var gateway:Node
var host:Node
var connection:Label
var detail:Label
var table:Tree
var counters:Array[Label]=[]
var jobs:Array=[]
var refreshing:=false
var refreshing_button:Button
var content:VBoxContainer

func label(text:String,size:int=16,color:Color=Color("#123555")) -> Label:
 var item:=Label.new();item.text=text;item.add_theme_font_size_override("font_size",size);item.add_theme_color_override("font_color",color)
 return item

func panel(color:Color=Color.WHITE) -> PanelContainer:
 var item:=PanelContainer.new()
 var style:StyleBox=host._style_box(color,Color("#d9e5ef"),1,16,true)
 for side in [SIDE_LEFT,SIDE_RIGHT,SIDE_TOP,SIDE_BOTTOM]:style.set_content_margin(side,16)
 item.add_theme_stylebox_override("panel",style)
 return item

func setup(controller:Node) -> void:
 gateway=controller;host=controller.host;name="SMSDeliveryPanel"
 size_flags_horizontal=Control.SIZE_EXPAND_FILL;size_flags_vertical=Control.SIZE_EXPAND_FILL
 theme=Theme.new();theme.default_font=controller.REGULAR;theme.default_font_size=15
 theme.set_color("font_color","Label",Color("#123555"))
 content=VBoxContainer.new();add_child(content);content.add_theme_constant_override("separation",18)
 var header:=HBoxContainer.new();content.add_child(header)
 var titles:=VBoxContainer.new();titles.size_flags_horizontal=Control.SIZE_EXPAND_FILL;header.add_child(titles)
 titles.add_child(label("ACOMPANHAMENTO • IMPERATRIZ",12,Color("#377abd")))
 titles.add_child(label("Painel SMS",30))
 titles.add_child(label("Retorno do Galaxy pelo Wi-Fi • atualização automática",14,Color("#617a95")))
 refreshing_button=host._make_action_button("Atualizar",Color.WHITE,Color("#d3e2ef"),Color("#123555"),Vector2(120,42),refresh)
 refreshing_button.name="RefreshStatus";header.add_child(refreshing_button)
 refreshing_button.size_flags_vertical=Control.SIZE_SHRINK_CENTER
 var metrics:=HBoxContainer.new();metrics.add_theme_constant_override("separation",14);content.add_child(metrics)
 var names=["Na fila / em andamento","SMS enviados¹","Entrega confirmada","Precisam de atenção"]
 var accents=[Color("#2377ce"),Color("#168364"),Color("#168364"),Color("#af641b")]
 var icons=["refresh","mail","check","signal"]
 for i in range(4):
  var card:PanelContainer=gateway._summary_card(names[i],"0","res://assets/icons/approved/"+icons[i]+".svg",accents[i],"DeliveryMetric"+str(i))
  metrics.add_child(card);counters.append(card.find_child("Value",true,false))
 var status_card:=panel(Color("#eaf3fe"));content.add_child(status_card)
 connection=label("Conferindo conexão…",14);connection.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;status_card.add_child(connection)
 var history_card:=panel();history_card.size_flags_vertical=Control.SIZE_EXPAND_FILL;content.add_child(history_card)
 var history_box:=VBoxContainer.new();history_card.add_child(history_box)
 history_box.add_child(label("Últimos 100 pedidos • selecione uma linha para conferir",14,Color("#617a95")))
 table=Tree.new();table.name="DeliveryHistory";table.columns=5;table.hide_root=true;table.column_titles_visible=true;table.select_mode=Tree.SELECT_ROW
 table.size_flags_vertical=Control.SIZE_EXPAND_FILL;table.custom_minimum_size.y=190
 var columns=["Aparelho / telefone","Confirmação atual","Pedido criado","Retorno recebido²","Detalhes"]
 for i in range(5):table.set_column_title(i,columns[i])
 table.set_column_expand_ratio(0,5);table.set_column_expand_ratio(1,6);table.set_column_expand_ratio(2,4);table.set_column_expand_ratio(3,4);table.set_column_expand_ratio(4,2)
 table.add_theme_stylebox_override("panel",host._style_box(Color.WHITE,Color.TRANSPARENT,0,10))
 table.add_theme_color_override("font_color",Color("#123555"));table.add_theme_color_override("font_selected_color",Color("#123555"))
 table.add_theme_stylebox_override("selected",host._style_box(Color("#e5f1ff"),Color.TRANSPARENT,0,6))
 table.add_theme_stylebox_override("selected_focus",host._style_box(Color("#e5f1ff"),Color("#85b8ed"),1,6))
 for state_name in ["title_button_normal","title_button_hover","title_button_pressed"]:
  table.add_theme_stylebox_override(state_name,host._style_box(Color("#eef4fa"),Color.TRANSPARENT,0,4))
 table.add_theme_color_override("title_button_color",Color("#536f8c"))
 table.add_theme_constant_override("v_separation",12);history_box.add_child(table);table.item_selected.connect(show_details)
 var details_card:=panel();content.add_child(details_card);MOTION.attach(details_card)
 detail=label("Nenhum pedido selecionado. O envio só é confirmado após o retorno do Android.",14);detail.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;detail.custom_minimum_size.y=62;details_card.add_child(detail)
 var footer:=label("¹ Inclui entregas confirmadas. ² Horário em que o Central recebeu o estado.\nEnvio não significa entrega; entrega não comprova execução do comando. Sem retorno, não reenvie automaticamente.",12,Color("#617a95"));content.add_child(footer)
 var timer:=Timer.new();timer.wait_time=10;timer.timeout.connect(refresh);add_child(timer);timer.call_deferred("start")
 call_deferred("open")

func open() -> void:
 if OS.get_environment("GRUPO_RS_REDUCED_MOTION")!="1":
  content.modulate.a=0
  var tween:=create_tween().set_parallel(true)
  tween.tween_property(content,"modulate:a",1.0,0.25)
 refresh()

func refresh() -> void:
 if refreshing:return
 if str(host.selected_branch_id)!="imperatriz":
  connection.text="Gateway Android disponível somente em Imperatriz. Nenhum histórico de outra base é exibido."
  render_jobs([]);refreshing_button.disabled=true;return
 refreshing=true;refreshing_button.disabled=true
 var data:Dictionary=await gateway.call_service("list")
 if not is_instance_valid(self):return
 if data.get("ok",false):render_jobs(data.get("jobs",[]))
 else:connection.text="Não foi possível ler a fila local. Tente atualizar.";refreshing=false;refreshing_button.disabled=false;return
 var result:Dictionary=await gateway.call_service("health")
 if not is_instance_valid(self):return
 if result.get("ok",false):
  var enabled:bool=result.get("health",{}).get("send_enabled",false)==true
  connection.text=("● Galaxy conectado • envio real habilitado" if enabled else "● Galaxy conectado • modo diagnóstico: envio real desligado")+" • conferido às "+clock_text(result.get("checked_at",0))
  connection.add_theme_color_override("font_color",Color("#168364") if enabled else Color("#2377ce"))
 else:
  connection.text="● Sem confirmação de conexão • exibindo o último retorno salvo. A queda do Wi-Fi não significa falha do SMS."
  connection.add_theme_color_override("font_color",Color("#af641b"))
 refreshing=false;refreshing_button.disabled=false

func clock_text(stamp:Variant) -> String:
 if not stamp is int and not stamp is float:return "—"
 if int(stamp)<=0:return "—"
 var local_time:=int(stamp)+int(Time.get_time_zone_from_system().bias)*60
 var parts:=Time.get_datetime_dict_from_unix_time(local_time)
 return "%02d/%02d %02d:%02d:%02d" % [parts.day,parts.month,parts.hour,parts.minute,parts.second]

func render_jobs(values:Array) -> void:
 var selected_id:=""
 if table.get_selected():selected_id=str(table.get_selected().get_metadata(0))
 jobs=values;table.clear();var root_item:=table.create_item();var counts=[0,0,0,0]
 for job in jobs:
  var state:String=job.get("state","");var payload:Dictionary=job.get("payload",{})
  if state in ["waiting_gateway","received","sending"]:counts[0]+=1
  if state in ["sent","delivered"]:counts[1]+=1
  if state=="delivered":counts[2]+=1
  if state in ["failed","expired","indeterminate","needs_confirmation"]:counts[3]+=1
  var row:=table.create_item(root_item);row.set_metadata(0,job.get("id",""))
  row.set_text(0,str(payload.get("serial",""))+"\n"+host._format_grupo_rs_sms_phone(str(payload.get("phone",""))))
  row.set_text(1,TITLES.get(state,state));row.set_custom_color(1,Color(COLORS.get(state,"#64768a")))
  row.set_text(2,clock_text(payload.get("created_at",0)))
  var observed:Variant=0
  for ack in job.get("acknowledgements",[]):
   if ack.get("state")==state:observed=ack.get("observed_at",0)
  row.set_text(3,clock_text(observed));row.set_text(4,"Ver pedido")
  if job.get("cancel_requested",0)==1 and state not in ["sent","delivered","failed","expired","cancelled","indeterminate"]:row.set_text(1,"Cancelamento pendente")
  if str(job.get("id",""))==selected_id:row.select(0)
 for i in range(4):counters[i].text=str(counts[i])
 if jobs.is_empty():detail.text="Nenhum pedido registrado. Seus próximos envios aparecerão aqui automaticamente."
 elif table.get_selected():show_details()

func show_details() -> void:
 if not table.get_selected():return
 var id:String=str(table.get_selected().get_metadata(0))
 for job in jobs:
  if str(job.get("id",""))!=id:continue
  var p:Dictionary=job.get("payload",{})
  var info:String=str(job.get("detail","")).strip_edges()
  if info.is_empty():info="Sem informação adicional do celular."
  var hints={"waiting_gateway":"Mantenha o Galaxy ativo e conectado. A fila expira em duas horas.","received":"O celular recebeu o pedido; ainda não confirmou o envio do SMS.","sending":"Aguardando retorno do Android. Não envie novamente.","sent":"Envio confirmado pelo Android. A entrega ao rastreador ainda não foi confirmada.","delivered":"Entrega informada pela rede. Isso não comprova execução do comando.","failed":"Verifique chip, sinal e o erro antes de confirmar outro pedido.","expired":"Prazo encerrado. Consulte o cadastro e confirme um novo pedido se ainda necessário.","indeterminate":"Não reenvie automaticamente: o SMS pode ter sido transmitido.","needs_confirmation":"O cadastro mudou. Reconsulte o aparelho antes de confirmar outro pedido.","cancelled":"Pedido cancelado. Nenhuma nova transmissão será iniciada por este pedido."}
  detail.text="%s • %s\nComando: %s\n%s" % [p.get("serial",""),TITLES.get(job.get("state",""),"Desconhecido"),p.get("command",""),hints.get(job.get("state",""),info)]
  detail.tooltip_text="Pedido: "+id+"\nValidade: "+clock_text(p.get("expires_at",0))+"\nRetorno técnico: "+info
