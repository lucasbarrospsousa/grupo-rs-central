extends SceneTree
const Records=preload("res://src/services/tracking_records.gd")
class Mock extends Records:
	var calls:=0
	var wrong:=false
	var invalid_pdf:=false
	func request(path:String,fields:Dictionary={})->Dictionary:
		assert(fields.is_empty() and path.begins_with("/cadastro/veiculos_listar.php?"));calls+=1
		return {"ok":true,"code":200,"body":"<table id=\"tabelaVeiculos\"></table>"}
	func clients(_query:String,_branch:String)->Dictionary:
		return {"ok":true,"clients":[{"id":"1","name":"Teste"},{"id":"2","name":"Teste"}]}
	func links(id:String,_branch:String)->Dictionary:
		return {"ok":true,"records":[{"id":11 if wrong else 10,"equipamento":"024000001" if id=="1" else "024000009","placa":"ABC-1D23"}]}
	func read_bytes(path:String)->Dictionary:
		calls+=1
		assert(path.contains("cliente=1&veiculo=10&inicio="))
		if path.begins_with("/exportar_pdf.php?"):return {"ok":true,"bytes":("<html>Login</html>" if invalid_pdf else "%PDF-1.4\n%%EOF").to_utf8_buffer()}
		assert(path.begins_with("/get_eventos.php?"))
		return {"ok":true,"bytes":'{"eventos":[{"id":1,"cod_veiculo":10,"data":"17/09/2026 11:30:00"}],"total":1}'.to_utf8_buffer()}
func _init()->void:run.call_deferred()
func run()->void:
	var service:=Mock.new();root.add_child(service);service.authenticated=true
	var product:={"imei":"024000001","plate":"ABC-1D23"}
	var parser:=func(_html):return [{"serial":"024000001","plate":"ABC-1D23","client":"Teste","edit_id":"10"}]
	var context:Dictionary=await service.resolve(product,"imperatriz",parser)
	assert(context.ok and context.client_id=="1")
	var prior:=service.calls
	assert(not (await service.resolve(product,"maraba",parser)).ok and service.calls==prior)
	var duplicate:=func(html):return parser.call(html)+parser.call(html)
	assert(not (await service.resolve(product,"imperatriz",duplicate)).ok)
	service.wrong=true;assert(not (await service.resolve(product,"imperatriz",parser)).ok)
	var window:=Records.period("17/09/2026 11:00","17/09/2026 12:00")
	var result:Dictionary=await service.history(context,window,"imperatriz");assert(result.ok and result.rows.size()==1)
	assert((await service.pdf(context,window,"imperatriz")).ok)
	service.invalid_pdf=true;assert(not (await service.pdf(context,window,"imperatriz")).ok)
	prior=service.calls;assert(not (await service.history(context,window,"maraba")).ok and service.calls==prior)
	assert(not Records.normalize({"eventos":[],"error":"Session expired"},context).ok)
	print("RECORDS_SERVICE_PASS: exact identity, homonyms, duplicates rejected, GET-only reads, branch scope, PDF vs login HTML, error vs empty")
	quit()
