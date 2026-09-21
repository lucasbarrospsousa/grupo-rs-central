extends SceneTree
const Lookup=preload("res://src/services/warehouse_chip_lookup.gd")
class FakeClient extends Node:
	const ARYA_API_INVENTARY_URL="https://invalid.example/inventary/%s"
	var auth_ok:=true
	var calls:=0
	var response:Dictionary={}
	func _ensure_arya_token(_force:bool)->Dictionary:return {"ok":auth_ok}
	func _arya_token()->String:return "fixture" if auth_ok else ""
	func _arya_inventory_get_with_retry(url:String)->Dictionary:
		assert(url.ends_with("89553000000000000123"));calls+=1;return response
func _initialize():run.call_deferred()
func run():
	var lookup:=Lookup.new();var iccid:="89553000000000000123"
	assert(lookup.valid_iccid(iccid));assert(not lookup.valid_iccid("024000123"));assert(not lookup.valid_iccid("89 55300000000000123"))
	var item:={"iccid":iccid,"msisdn":"5599000000000","provider":"Exemplo","apn":"exemplo","conn_status":false}
	var result:=lookup.parse_response(JSON.stringify({"data":item}),iccid)
	assert(result.state=="found");assert(result.connection=="Offline");assert(result.phone=="5599000000000")
	assert(lookup.parse_response(JSON.stringify({"data":[item,item]}),iccid).state=="unavailable")
	assert(lookup.parse_response(JSON.stringify({"data":{"iccid":"89554000000000000123"}}),iccid).state=="not_found")
	assert(lookup.parse_response('{"data":[]}',iccid).state=="not_found")
	assert(lookup.parse_response('<html>Login</html>',iccid).state=="unavailable")
	assert(lookup.parse_response('{"status":false}',iccid).state=="unavailable")
	var fake:=FakeClient.new();fake.auth_ok=false
	assert((await lookup.lookup(fake,iccid)).state=="unavailable");assert(fake.calls==0)
	fake.auth_ok=true;fake.response={"ok":false,"response_code":500}
	assert((await lookup.lookup(fake,iccid)).state=="unavailable")
	fake.response={"ok":false,"response_code":404}
	assert((await lookup.lookup(fake,iccid)).state=="not_found")
	fake.response={"ok":true,"body":JSON.stringify({"data":item})}
	assert((await lookup.lookup(fake,iccid)).state=="found")
	fake.free();print("WAREHOUSE_CHIP_LOOKUP_OK");quit()
