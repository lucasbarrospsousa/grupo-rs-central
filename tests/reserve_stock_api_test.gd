extends SceneTree
class MemoryStore extends InventoryStore:
	var item:Dictionary={}
	var writes:=0
	func get_product(_sku:String)->Dictionary:return item.duplicate(true)
	func upsert_product_replacing_sku(_sku:String,data:Dictionary)->Dictionary:
		writes+=1;item=data.duplicate(true);return item.duplicate(true)
class View extends "res://src/inventory_dashboard.gd":
	var reply:Dictionary={"ok":true,"plate":"XRS - 046"}
	var change_branch:=false
	func _ready()->void:pass
	func _process(_delta:float)->void:pass
	func _lookup_reserve_stock_plate(_serial:String)->Dictionary:
		if change_branch:selected_branch_id="other"
		return reply
	func _ensure_local_database_modification_saved(_serial:String="",_product:Dictionary={})->Dictionary:return {"ok":true}
	func _show_error(_title:String,_message:String)->void:pass
	func _show_success(_title:String,_message:String)->void:pass
	func _refresh_table()->void:pass
	func _log_system_action(_action:String,_details:String="",_sku:String="")->void:pass
var failures:=0
class ApiView extends "res://src/inventory_dashboard.gd":
	var response:Dictionary={}
	func _ready()->void:pass
	func _process(_delta:float)->void:pass
	func _grupo_rs_supports_modern_api()->bool:return true
	func _grupo_rs_api_reads_enabled()->bool:return true
	func _grupo_rs_api_get(_path:String,_retry:bool=true,_refresh:bool=false)->Dictionary:return response
func check(value:bool,message:String)->void:
	if not value:failures+=1;push_error(message)
func _init()->void:call_deferred("run")
func run()->void:
	var api=ApiView.new();root.add_child(api)
	var row={"numeroSerie":"024999991","placa":"XRS - 046"}
	api.response={"ok":true,"body":JSON.stringify({"veiculos":[row]})}
	var lookup:Dictionary=await api._lookup_reserve_stock_plate("024999991")
	check(lookup.get("ok",false),"Exact API serial lookup")
	api.response={"ok":true,"body":JSON.stringify({"veiculos":[row,row]})}
	lookup=await api._lookup_reserve_stock_plate("024999991")
	check(not lookup.get("ok",false),"Ambiguous API association blocked")
	api.response={"ok":true,"body":JSON.stringify({"veiculos":[row]})}
	lookup=await api._lookup_reserve_stock_plate("024999992")
	check(not lookup.get("ok",false),"Do not use first unrelated API row")
	api.response={"ok":false}
	lookup=await api._lookup_reserve_stock_plate("024999991")
	check(not lookup.get("ok",false),"Network failure blocked")
	var v=View.new();var s=MemoryStore.new();v.store=s;root.add_child(v)
	var original={"sku":"024999991","imei":"024999991","tracker_status":"Reserva","status":"Reserva","model":"","stock":0,"plate":""}
	s.item=original.duplicate(true)
	var r:Dictionary=await v._send_to_stock_confirmed("024999991")
	check(r.get("ok",false) and s.item.plate=="XRS - 046" and s.item.model=="V7.3.5" and s.item.stock==1,"Fill plate/type/status together")
	s.item=original.duplicate(true);s.item.model="V7.2.2"
	r=await v._send_to_stock_confirmed("024999991")
	check(r.get("ok",false) and s.item.model=="V7.2.2","Preserve existing type")
	s.item=original.duplicate(true);v.reply={"ok":false,"message":"Network failure"};var writes:int=s.writes
	r=await v._send_to_stock_confirmed("024999991")
	check(not r.get("ok",false) and s.writes==writes and s.item==original,"Failure must preserve reserve")
	v.reply={"ok":true,"plate":"ABC - 1234"};s.item=original.duplicate(true)
	r=await v._send_to_stock_confirmed("024999991")
	check(not r.get("ok",false) and s.writes==writes,"Unknown type must not be invented")
	v.reply={"ok":true,"plate":"XRS - 046"};v.change_branch=true
	r=await v._send_to_stock_confirmed("024999991")
	check(r.get("stage")=="stale" and s.writes==writes,"Discard response after branch switch")
	v.change_branch=false;v.reserve_stock_lookup_busy=true
	r=await v._send_to_stock_confirmed("024999991")
	check(r.get("stage")=="busy" and s.writes==writes,"Prevent concurrent action")
	v.reserve_stock_lookup_busy=false
	for maintenance_status in ["Manutencao", "Manutenção"]:
		var maintenance=original.duplicate(true)
		maintenance.tracker_status=maintenance_status
		maintenance.status=maintenance_status
		maintenance.plate="ABC-1D23"
		maintenance.vehicle_plate="ABC-1D23"
		maintenance.model="V7.1.6"
		s.item=maintenance.duplicate(true)
		v.reply={"ok":false,"message":"API indisponivel"}
		writes=s.writes
		r=await v._send_to_stock_confirmed("024999991")
		check(not r.get("ok",false) and s.item==maintenance and s.writes==writes,"Maintenance failure preserves old vehicle and status")
		v.reply={"ok":true,"plate":"AAA - 099"}
		r=await v._send_to_stock_confirmed("024999991")
		check(r.get("ok",false) and s.item.identification_plate=="AAA - 099" and s.item.vehicle_plate=="" and s.item.tracker_status=="Estoque" and s.item.model=="V7.1.6","Maintenance uses current API identification and preserves exact firmware")
	var button=v._make_stock_return_button("024999991")
	v.add_child(button)
	button.position=Vector2(30,30)
	check(button.text=="Estoque" and button.icon!=null and button.pressed.get_connections().size()>0,"Stock button has label, icon and action")
	await process_frame
	if DisplayServer.get_name()!="headless":
		RenderingServer.force_draw()
		root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("maintenance-stock-button.png"))
	print("RESERVE_STOCK_API_TEST ",failures," failures; memory-only store, no real API")
	quit(0 if failures==0 else 1)
