extends AcceptDialog
const UI=preload("res://src/ui/approved_dashboard.gd")
var host:Node
var gateway:Node
var inputs:Array=[]
var feedback:Label
var review:TextEdit
var validate_button:Button
var confirm_button:Button
var prepared:Array=[]
var branch:String
var pasted_rows:Array=[]
var page:=0
var page_label:Label
var paste_button:Button
var previous_button:Button
var next_button:Button
var row_labels:Array=[]
var fields_locked:=false
var apn_selector:OptionButton

func selected_apn() -> String:
	return "linksolutions.br" if apn_selector and apn_selector.selected==1 else "hinova.br"
var visible_rows:=6

func add_row() -> void:
	if fields_locked or visible_rows>=10:return
	visible_rows+=1;update_visible_rows()

func update_visible_rows() -> void:
	for i in inputs.size():
		row_labels[i].visible=i<visible_rows
		for field in inputs[i]:field.visible=i<visible_rows
	if has_meta("row_hint"):get_meta("row_hint").text="%d de 10 linhas"%visible_rows
	if has_meta("add_button"):get_meta("add_button").disabled=fields_locked or visible_rows>=10

func setup(owner_node:Node) -> void:
	host=owner_node;gateway=host._ensure_phone_sms_gateway();branch=str(host.selected_branch_id)
	preload("res://src/ui/bulk_sms_view.gd").build(self)
func invalidate(_value:Variant=null) -> void:
	prepared.clear()
	if confirm_button:confirm_button.disabled=true
	if has_meta("review_state"):get_meta("review_state").text="Aguardando revisão"
	if review:review.text=""
	update_summary.call_deferred()

func update_summary() -> void:
	if not has_meta("count_label"):return
	var count:=0;var groups:Dictionary={}
	for row in inputs:
		if row[0].text.strip_edges()!="" or row[1].text.strip_edges()!="" or row[2].get_selected_id()!=0:
			count+=1
			if row[2].get_selected_id()>0:groups[row[2].get_selected_id()]=true
	get_meta("count_label").text=str(count)
	if has_meta("apn_label"):get_meta("apn_label").text=selected_apn()
	var numbers:=groups.keys();numbers.sort()
	get_meta("groups_label").text="Selecione os grupos" if numbers.is_empty() else ("Grupo %d"%numbers[0] if numbers.size()==1 else "%d grupos"%numbers.size())

func lock_fields(locked:bool) -> void:
	fields_locked=locked
	if apn_selector:apn_selector.disabled=locked
	update_visible_rows()
	validate_button.disabled=locked
	paste_button.disabled=locked
	update_page_controls()
	for row in inputs:
		row[0].editable=not locked;row[1].editable=not locked;row[2].disabled=locked

func paste_text(text:String) -> void:
	if fields_locked:return
	var parsed:Dictionary=preload("res://src/ui/sms_paste_parser.gd").parse(text)
	if not parsed.get("ok",false):feedback.text=str(parsed.error)+" Nada foi substituído.";return
	pasted_rows=parsed.rows;page=0;load_page()
	feedback.text="%d aparelhos organizados em %d lotes de até 10. Cada lote exige revisão e confirmação; nada foi enviado." % [pasted_rows.size(),ceili(pasted_rows.size()/10.0)]

func update_page_controls() -> void:
	var pages:=maxi(1,ceili(pasted_rows.size()/10.0))
	page_label.text="Lote %d/%d · %d aparelhos" % [page+1,pages,pasted_rows.size()] if not pasted_rows.is_empty() else "Lote 1 · até 10"
	previous_button.disabled=fields_locked or page==0
	next_button.disabled=fields_locked or page+1>=pages
	previous_button.visible=pages>1;next_button.visible=pages>1

func change_page(direction:int) -> void:
	if fields_locked or pasted_rows.is_empty():return
	var target:=page+direction
	if target<0 or target>=ceili(pasted_rows.size()/10.0):return
	for i in range(10):
		var index:=page*10+i
		if index>=pasted_rows.size():
			if inputs[i][0].text=="" and inputs[i][1].text=="" and inputs[i][2].get_selected_id()==0:continue
			while pasted_rows.size()<=index:pasted_rows.append({})
		pasted_rows[index]={"serial":inputs[i][0].text,"phone":inputs[i][1].text,"group":inputs[i][2].get_selected_id()}
	page=target;load_page()
	feedback.text="Lote %d selecionado. Prepare, revise e confirme somente este lote." % (page+1)

func load_page() -> void:
	invalidate();review.text=""
	visible_rows=maxi(6,mini(10,pasted_rows.size()-page*10))
	for i in range(10):
		var index:=page*10+i
		var value:Dictionary=pasted_rows[index] if index<pasted_rows.size() else {}
		inputs[i][0].text=str(value.get("serial",""));inputs[i][1].text=str(value.get("phone",""));inputs[i][2].select(int(value.get("group",0)))
		row_labels[i].text="%02d" % (index+1)
	update_page_controls();update_visible_rows()

func prepare() -> void:
	prepared.clear();confirm_button.disabled=true;review.text=""
	if branch!="imperatriz" or str(host.selected_branch_id)!=branch:feedback.text="Disponível somente na base Imperatriz.";return
	var rows:Array=[];var seen:Dictionary={}
	for row in inputs:
		var serial:String=host._digits_only(row[0].text)
		var phone:String=host._format_grupo_rs_sms_phone(row[1].text)
		var group:int=row[2].get_selected_id()
		if row[0].text.strip_edges()=="" and row[1].text.strip_edges()=="" and group==0:continue
		if serial.length()!=9 or not serial.begins_with("024") or phone=="" or group<1:
			feedback.text="Todas as linhas usadas exigem série 024 válida, telefone e grupo.";return
		if seen.has(serial) or seen.has(phone):feedback.text="Série ou telefone repetido no lote.";return
		seen[serial]=true;seen[phone]=true;rows.append({"serial":serial,"phone":phone,"group":group})
	if rows.is_empty():feedback.text="Preencha ao menos uma linha.";return
	lock_fields(true);feedback.text="Preparando os comandos com os dados informados…"
	for row in rows:
		var command:String=host._rs300_apn_command_for_apn(row.serial,selected_apn()).replace("grupors1.ddns.net","grupors%d.ddns.net" % row.group)
		var phone:String="+55"+host._digits_only(row.phone)
		prepared.append({"version":2,"serial":row.serial,"phone":phone,"command":command,"command_mode":"standard","source_phone_snapshot":phone,"standard_command_snapshot":command,"apn_snapshot":selected_apn(),"status_snapshot":"Informado no lote","group":row.group})
		review.text+="%s • %s • Grupo %d\n%s\n" % [row.serial,row.phone,row.group,command]
	lock_fields(false);confirm_button.disabled=false
	if has_meta("review_state"):get_meta("review_state").text="Pronto para confirmar"
	feedback.text="Revise os %d destinatários e os comandos (APN %s). Sem consulta ao cadastro. Confirmar autoriza o lote por até 2 horas." % [prepared.size(),selected_apn()]

func submit() -> void:
	if prepared.is_empty() or str(host.selected_branch_id)!=branch:return
	confirm_button.disabled=true;lock_fields(true)
	var result:Dictionary=await gateway.call_service("enqueue_batch",{"manual":true,"rows":prepared})
	lock_fields(false)
	if result.get("ok",false):
		prepared.clear();feedback.text="Lote registrado. Acompanhe cada confirmação no Painel SMS."
	else:feedback.text=str(result.get("error","Não foi possível registrar o lote. Consulte novamente."));prepared.clear()

func cancel_batch() -> void:
	var listed:Dictionary=await gateway.call_service("list")
	var ids:Dictionary={}
	for job in listed.get("jobs",[]):
		if job.has("batch") and job.get("state") in ["waiting_gateway","received","sending"]:ids[job.batch.batch_id]=true
	for id in ids:await gateway.call_service("cancel_batch",{"batch_id":id})
	feedback.text="Cancelamento solicitado. Pedidos recebidos pelo celular dependem da confirmação dele; confira o Painel SMS."
