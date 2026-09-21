extends RefCounted
## Read-only Arya lookup for a full warehouse ICCID; never uses suffix matching.

func valid_iccid(value: String) -> bool:
	if not value.begins_with("89") or value.length() not in [19,20]:return false
	for character in value:
		if character<"0" or character>"9":return false
	return true

func lookup(client: Node, iccid: String) -> Dictionary:
	if not valid_iccid(iccid):return {"state":"invalid","message":"Informe o ICCID completo, com 19 ou 20 dígitos e início 89."}
	var auth:Dictionary=await client._ensure_arya_token(false)
	if not auth.get("ok",false) and client._arya_token()=="":return {"state":"unavailable","message":"Configure o acesso à Arya nas Configurações da Central."}
	var url:String=client.ARYA_API_INVENTARY_URL % iccid.uri_encode()
	var response:Dictionary=await client._arya_inventory_get_with_retry(url)
	if int(response.get("response_code",0)) in [401,403]:
		auth=await client._ensure_arya_token(true)
		if auth.get("ok",false):response=await client._arya_inventory_get_with_retry(url)
	if not response.get("ok",false):
		if int(response.get("response_code",0))==404:return {"state":"not_found","message":"ICCID não localizado na Arya."}
		return {"state":"unavailable","message":"Não foi possível consultar a Arya. Verifique o acesso e tente novamente."}
	return parse_response(str(response.get("body","")),iccid)

func parse_response(body: String, iccid: String) -> Dictionary:
	var decoder:=JSON.new()
	if decoder.parse(body)!=OK:return {"state":"unavailable","message":"A Arya não retornou um inventário válido. Tente novamente."}
	var parsed:Variant=decoder.data
	if not parsed is Dictionary:return {"state":"unavailable","message":"A Arya não retornou um inventário válido. Tente novamente."}
	if parsed.get("status",true)==false:return {"state":"unavailable","message":"A Arya não confirmou a consulta. Tente novamente."}
	if not parsed.has("data") and not parsed.has("iccid"):return {"state":"unavailable","message":"Resposta da Arya incompleta. Tente novamente."}
	var data:Variant=parsed.get("data",parsed)
	var rows:Array=[]
	if data is Array:rows=data
	elif data is Dictionary:rows=[data] if not data.is_empty() else []
	else:return {"state":"unavailable","message":"Resposta da Arya incompleta. Tente novamente."}
	var matches:Array=[]
	for item in rows:
		if item is Dictionary and str(item.get("iccid",""))==iccid:matches.append(item)
	if matches.size()>1:return {"state":"unavailable","message":"A Arya retornou mais de um registro para este ICCID. Validação pendente."}
	if matches.is_empty():return {"state":"not_found","message":"Nenhum registro com este ICCID completo foi localizado na Arya."}
	var item:Dictionary=matches[0]
	var raw:Variant=item.get("conn_status",item.get("inSession",""))
	var connection:="Não informada"
	if str(raw).to_lower() in ["1","true","online","on","connected","conectado","em sessao","em_sessao"]:connection="Online"
	elif str(raw).to_lower() in ["0","false","offline","off","disconnected","desconectado","fora de sessao","fora_sessao"]:connection="Offline"
	return {"state":"found","iccid":iccid,"phone":str(item.get("msisdn",item.get("number",""))),"operator":str(item.get("provider",item.get("operator",item.get("operadora","")))),"apn":str(item.get("apn","")),"connection":connection,"last_connection":str(item.get("last_conn_update",item.get("lastConnUpdate","")))}
