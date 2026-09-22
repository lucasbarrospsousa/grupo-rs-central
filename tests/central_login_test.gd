extends SceneTree
class Vault extends Node:
	var saved:Dictionary={}
	func get_secret(_namespace:String,_key:String,fallback:Variant="")->Variant:return saved if not saved.is_empty() else fallback
	func set_secret(_namespace:String,_key:String,value:Variant)->bool:saved=value.duplicate();return true
	func remove_secret(_namespace:String,_key:String)->bool:saved.clear();return true
class Shell extends "res://src/inventory_dashboard.gd":
	var test_vault:=Vault.new()
	var opened:=0
	var accepts:=true
	func _ready()->void:pass
	func _process(_dt:float)->void:pass
	func _secret_vault()->Node:return test_vault
	func _local_database_operator_auth_required()->bool:return false
	func _validate_login(login:String,password:String)->bool:return accepts and login=="demo" and password=="test"
	func _open_selected_branch()->void:opened+=1
	func _update_remembered_login(_login:String)->void:pass
	func _read_json_dictionary(_path:String)->Dictionary:return {}
	func _select_branch(id:String,_preview:bool=false)->void:selected_branch_id=id;selected_branch_name="Imperatriz"
	func _show_login_screen()->void:
		login_user_input=LineEdit.new();login_password_input=LineEdit.new();remember_user_check=CheckBox.new();remember_user_check.button_pressed=true;login_error_label=Label.new()
		for node in [login_user_input,login_password_input,remember_user_check,login_error_label]:add_child(node)
func _initialize():run.call_deferred()
func run():
	var shell:=Shell.new();root.add_child(shell);shell._start_direct_login();assert(shell.selected_branch_id=="imperatriz" and shell.opened==0)
	shell.login_user_input.text="demo";shell.login_password_input.text="wrong";await shell._attempt_login();assert(shell.opened==0 and shell.test_vault.saved.is_empty())
	shell.login_password_input.text="test";await shell._attempt_login();assert(shell.opened==1 and shell.test_vault.saved.user=="demo")
	shell.login_user_input.clear();shell.login_password_input.clear();await shell._resume_central_login();assert(shell.opened==2)
	shell.accepts=false;await shell._resume_central_login();assert(shell.opened==2 and shell.login_password_input.text=="")
	shell.accepts=true;shell.remember_user_check.button_pressed=false;shell._save_central_login("demo","test");assert(shell.test_vault.saved.is_empty())
	shell.test_vault.free();shell.free();print("CENTRAL_LOGIN_OK");quit()
