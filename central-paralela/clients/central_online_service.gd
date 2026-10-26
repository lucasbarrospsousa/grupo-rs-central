extends Node
const Provisioning=preload("res://src/services/provisioning_service.gd")
const ENDPOINT="https://central-paralela.sinderacode.workers.dev/api/configurator"
var versions:Dictionary={}
var preparing:Dictionary={}

func _access_path()->String:
	var service=Provisioning.new()
	var path:String=service._shared_settings_path()
	service.free()
	return path.get_base_dir().path_join("central_drive_online.vault") if path!="" else "user://central_drive_online.vault"
func _access_key()->String:
	return ("rs300-central-drive-online|%s|%s"%[OS.get_unique_id(),OS.get_environment("USERNAME").to_lower()]).sha256_text()
func install_access(token:String)->bool:
	if token.length()!=64 or not token.is_valid_hex_number(false): return false
	var path:=_access_path()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(path.get_base_dir()))
	var file:=FileAccess.open_encrypted_with_pass(path,FileAccess.WRITE,_access_key())
	if file==null: return false
	file.store_string(token); file.close()
	return _token()==token
func _token()->String:
	if not FileAccess.file_exists(_access_path()):
		var token:="" # Independent credential; never reuse the original bundle token.
		return token if token.length()==64 and token.is_valid_hex_number(false) else ""
	var file:=FileAccess.open_encrypted_with_pass(_access_path(),FileAccess.READ,_access_key())
	if file==null: return ""
	var token:=file.get_as_text(); file.close(); return token
func request_online(payload:Dictionary)->Dictionary:
	var token:=_token()
	if token=="": return {"ok":false,"stage":"central_online","message":"Acesso à Central online não instalado neste computador."}
	var http:=HTTPRequest.new(); http.timeout=50.0; http.max_redirects=0; http.body_size_limit=65536; add_child(http)
	var code:=http.request(ENDPOINT,["Content-Type: application/json","x-central-configurator: "+token],HTTPClient.METHOD_POST,JSON.stringify(payload))
	if code!=OK:
		http.queue_free(); return {"ok":false,"message":"Não foi possível iniciar a conexão com a Central online."}
	var answer:Array=await http.request_completed; http.queue_free()
	if int(answer[0])!=HTTPRequest.RESULT_SUCCESS: return {"ok":false,"stage":"central_online","message":"Gravação online não confirmada. Use Repetir etapa pendente; o mesmo pedido não será duplicado."}
	var result=JSON.parse_string(answer[3].get_string_from_utf8())
	if typeof(result)!=TYPE_DICTIONARY: return {"ok":false,"message":"Resposta da Central online não reconhecida."}
	result["http_status"]=int(answer[1])
	if int(answer[1])<200 or int(answer[1])>=300: result["ok"]=false
	return result
func preflight(settings:Dictionary,series:String)->Dictionary:
	var branch:=str(settings.get("central_branch","imperatriz"))
	var payload={"action":"preflight","branch":branch,"serial":series}
	if settings.has("central_status"): payload["status"]=settings.central_status
	var result:=await request_online(payload)
	if result.get("ok",false): versions[branch+":"+series]=int(result.get("version",0))
	return result
func prepare_equipment(data:Dictionary,settings:Dictionary)->Dictionary:
	var slot=str(settings.get("central_branch","imperatriz"))+":"+str(data.get("series",""))
	while preparing.has(slot): await get_tree().process_frame
	preparing[slot]=true
	var result=await _send_equipment(data,settings,"prepare")
	preparing.erase(slot)
	return result
func sync_equipment(data:Dictionary,settings:Dictionary)->Dictionary:
	var slot=str(settings.get("central_branch","imperatriz"))+":"+str(data.get("series",""))
	while preparing.has(slot): await get_tree().process_frame
	return await _send_equipment(data,settings,"save")
func _send_equipment(data:Dictionary,settings:Dictionary,action:String)->Dictionary:
	var branch:=str(settings.get("central_branch","imperatriz")); var series:=str(data.get("series","")); var slot:=branch+":"+series
	if not versions.has(slot):
		var check:=await preflight(settings,series)
		if not check.get("ok",false): return check
	var payload={"action":"save","apn":str(data.get("apn",preload("res://src/config/chip_profiles.gd").network(settings).apn)),"branch":branch,"serial":series,"iccid":str(data.get("iccid","")),"phone":str(data.get("phone","")),"operator":str(data.get("operator","")).to_upper(),"version":versions[slot]}
	if str(data.get("tracker_version",""))!="": payload["tracker_version"]=str(data.tracker_version)
	if settings.has("central_status"): payload["status"]=settings.central_status
	var digest:=JSON.stringify(payload).sha256_text()
	payload["key"]="%s-%s-%s-%s-%s"%[digest.substr(0,8),digest.substr(8,4),digest.substr(12,4),digest.substr(16,4),digest.substr(20,12)]
	payload.action=action # Key is identical for prepare, save and uncertain retries.
	return await request_online(payload)
