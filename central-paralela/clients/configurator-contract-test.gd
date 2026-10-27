extends SceneTree
class Fake extends "res://src/services/central_online_service.gd":
	var calls:Array=[]
	func request_online(payload:Dictionary)->Dictionary:
		calls.append(payload.duplicate(true))
		return {"ok":true,"version":4,"confirmed":payload.action=="save"}
func _init():
	run.call_deferred()
func run():
	for branch in ["imperatriz","araguaina","acailandia","maraba"]:
		var f:=Fake.new();root.add_child(f)
		var settings={"central_branch":branch}
		var data={"series":"024000001","iccid":"89123456789012345678","phone":"99999999999","operator":"TIM","apn":"hinova.br","tracker_version":"V7.3.5"}
		assert((await f.prepare_equipment(data,settings)).ok)
		assert((await f.sync_equipment(data,settings)).confirmed)
		assert(f.calls.size()==3)
		assert(f.calls[0].action=="preflight")
		assert(f.calls[1].key==f.calls[2].key)
		assert(f.calls[2].version==4 and f.calls[2].branch==branch)
		assert((await f.sync_equipment(data,settings)).confirmed)
		assert(f.calls[3].key==f.calls[2].key)
		f.free()
	print("DRIVE_CLIENT_CONTRACT_OK: four branches, preflight, prepare/save and stable retry; HTTP simulated")
	quit(0)
