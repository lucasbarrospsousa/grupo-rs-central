extends SceneTree

class View extends "res://src/inventory_dashboard.gd":
	var settings:Dictionary={"grupo_rs_api_base_url":"https://novogrupors.ddns.net/api_rest_app/docs/index.html", "grupo_rs_api_user":"synthetic", "grupo_rs_api_password":"synthetic"}
	var calls:Array[String]=[]
	func _ready()->void:pass
	func _process(_delta:float)->void:pass
	func _read_json_dictionary(_path:String)->Dictionary:return settings.duplicate(true)
	func _grupo_rs_supports_modern_api()->bool:return true
	func _grupo_rs_api_reads_enabled()->bool:return true
	func _http_post_json_with_headers(url:String,body:Variant,_headers:PackedStringArray,_timeout:float=15.0)->Dictionary:
		calls.append(url)
		assert(url=="https://imp.ogrupors.com.br/api_rest_app/endpoints/v1/auth/login.php")
		assert(body.usuario=="synthetic" and body.senha=="synthetic")
		return {"ok":true,"response_code":200,"body":JSON.stringify({"access_token":"synthetic-token"})}
	func _http_get_text_with_headers(url:String,headers:PackedStringArray,_timeout:float=15.0)->Dictionary:
		calls.append(url)
		assert(url.begins_with("https://imp.ogrupors.com.br/api_rest_app/endpoints/veiculos.php?"))
		assert("Authorization: Bearer synthetic-token" in headers)
		var second:=url.contains("skip=1&")
		return {"ok":true,"response_code":200,"body":JSON.stringify({"veiculos":[{"CodVeiculo":2 if second else 1,"Placa":"ABC1D24" if second else "ABC1D23"}],"paginacao":{"temMais":not second,"proximoSkip":2 if second else 1}})}

func _init()->void:
	create_timer(25).timeout.connect(func():push_error("Migration test timeout");quit(1))
	run.call_deferred()
func run()->void:
	var v=View.new();root.add_child(v)
	var original:Dictionary=v.settings.duplicate(true)
	for previous in ["", "https://novogrupors.ddns.net/api_rest_app", "https://novogrupors.ddns.net/api_rest_app/docs/index.html#/Auth", "http://novogrupors.ddns.net/api_rest_app/", "https://fullprotect.newplataforma.com.br/api_rest_app/docs", "http://fullprotect.newplataforma.com.br/api_rest_app"]:
		assert(v._normalize_grupo_rs_api_base_url(previous)==v.GRUPO_RS_API_BASE_URL)
	for branch in ["arg","acl","mab"]:
		var url:="https://%s.ogrupors.com.br/api_rest_app"%branch
		assert(v._normalize_grupo_rs_api_base_url(url)==url)
	assert(v._normalize_grupo_rs_api_base_url("https://example.invalid/api_rest_app")=="https://example.invalid/api_rest_app")
	assert(v.GRUPO_RS_BASE_URL=="https://novogrupors.ddns.net/cadastro/")
	var response:Dictionary=await v._grupo_rs_api_fetch_all_pages("/endpoints/veiculos.php",true)
	assert(response.get("ok",false) and response.get("rows",[]).size()==2)
	assert(v.calls.size()==3 and v.calls[2].contains("skip=1&"))
	assert(v.settings==original,"Resolving the old URL must not rewrite settings or credentials")
	v.queue_free();await process_frame
	print("IMPERATRIZ_API_MIGRATION_PASS: saved URLs, authentication, metadata pagination, unchanged web/custom/regional destinations; mocked HTTP only")
	quit(0)
