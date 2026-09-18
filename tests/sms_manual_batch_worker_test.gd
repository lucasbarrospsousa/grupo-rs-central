extends SceneTree
class Shell extends Node:
	var selected_branch_id="imperatriz"
	var store=null
class Gateway extends "res://src/sms_gateway.gd":
	var manual=1
	var calls:Array=[]
	func call_service(op:String,request:Dictionary={}) -> Dictionary:
		calls.append({"op":op,"request":request})
		if op=="pending":return {"job":{"id":"synthetic","batch":{"manual":manual},"payload":{"serial":"024000001"}}}
		if op=="reconcile":return {"needs_validation":not request.get("validated",false)}
		assert(false,"Unexpected operation");return {}
func _initialize() -> void:call_deferred("run")
func run() -> void:
	var shell:=Shell.new();root.add_child(shell)
	var gateway:=Gateway.new();root.add_child(gateway);gateway.host=shell
	await gateway._sync_one()
	assert(gateway.calls.size()==3 and gateway.calls[2].request.validated)
	gateway.calls.clear();gateway.manual=0
	await gateway._sync_one()
	assert(gateway.calls.size()==2,"Legacy batches cannot bypass stock validation")
	gateway.calls.clear();gateway.manual=1;shell.selected_branch_id="maraba"
	await gateway._sync_one()
	assert(gateway.calls.is_empty(),"Branch guard retained")
	gateway.queue_free();shell.queue_free();await process_frame
	print("SMS_MANUAL_BATCH_WORKER_OK: manual without stock; legacy guard retained; no transport")
	quit()
