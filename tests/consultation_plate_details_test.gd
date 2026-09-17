extends SceneTree
const Service=preload("res://src/services/equipment_consultation.gd")
class Mock extends Service:
	var calls:=0
	var failure:=false
	var wrong_vehicle:=false
	func request(path:String,fields:Dictionary={}) -> Dictionary:
		assert(fields.is_empty() and path.begins_with("/cadastro/veiculos_listar.php?"))
		calls+=1
		return {"ok":not failure,"code":200,"body":"<table id=\"tabelaVeiculos\"></table>"}
	func clients(_query:String,_branch:String)->Dictionary:
		return {"ok":true,"clients":[{"id":"1","name":"Cliente fictício"},{"id":"2","name":"Cliente fictício"}]}
	func links(id:String,_branch:String)->Dictionary:
		var stamp:=Time.get_datetime_string_from_system(false,true)
		return {"ok":true,"records":[{"CodVeiculo":99 if wrong_vehicle else 10,"equipamento":"024000001" if id=="1" else "024000009","placa":"ABC - 1D23","ignicao":0,"DataGPS":stamp,"DataComunicacaoServidor":stamp,"lat":"-5","lng":"-47"}]}
func _init()->void:run.call_deferred()
func run()->void:
	var service:=Mock.new();root.add_child(service);service.authenticated=true
	var product={"imei":"024000001","plate":"abc1d23"}
	var parser:=func(_html):return [{"serial":"024000001","plate":"ABC - 1D23","client":"Cliente fictício","edit_id":"10"}]
	var result:Dictionary=await service.details(product,"imperatriz",parser)
	assert(result.ok and result.client=="Cliente fictício" and result.communication.color_key=="vermelho")
	assert(not (await service.details(product,"maraba",parser)).ok and service.calls==1)
	var wrong:=func(_html):return [{"serial":"024000002","plate":"ABC - 1D23","client":"Outro"}]
	assert(not (await service.details(product,"imperatriz",wrong)).ok)
	var duplicate:=func(_html):return parser.call("")+parser.call("")
	assert(not (await service.details(product,"imperatriz",duplicate)).ok)
	service.wrong_vehicle=true
	result=await service.details(product,"imperatriz",parser)
	assert(result.communication.is_empty(),"Different vehicle ID must not color the plate")
	service.failure=true
	assert(not (await service.details(product,"imperatriz",parser)).ok)
	assert(product=={"imei":"024000001","plate":"abc1d23"},"Read only")
	print("PLATE_DETAILS_PASS: GET only, exact plate+serial+vehicle, homonyms, ambiguity, other branch, failure, no mutations")
	quit()
