extends SceneTree
class Shell extends "res://tests/fixtures/offline_main_dashboard.gd":
	var confirmation := Callable()
	var entered := ""
	var warned := false
	func _confirm_action(_title: String, _message: String, callback: Callable, _confirm_text: String = "", _note: String = "", _cancel: String = "Cancelar") -> void:
		confirmation = callback
	func _show_warning(_title: String, _message: String) -> void: warned = true
	func _enter_selected_branch(id: String) -> void: entered = id
func _initialize() -> void: call_deferred("run")
func run() -> void:
	var shell := Shell.new()
	root.add_child(shell)
	shell.overview_results={"imperatriz":{"ok":false,"message":"Offline fixture"}}
	shell._show_dashboard()
	await process_frame
	var picker := shell.find_child("OverviewBranch",true,false) as OptionButton
	assert(picker != null and picker.item_count == 4)
	picker.item_selected.emit(2)
	assert(shell.selected_branch_id == "imperatriz" and shell.entered == "")
	assert(shell.confirmation.is_valid())
	assert(shell.selected_branch_id == "imperatriz")
	shell.equipment_registration_running = true
	shell.confirmation.call()
	assert(shell.warned and shell.entered == "")
	shell.equipment_registration_running = false
	shell._request_sidebar_branch_switch("invalid")
	assert(shell.entered == "")
	shell._request_sidebar_branch_switch("acailandia")
	shell.confirmation.call()
	assert(shell.entered == "acailandia" and shell.store == null)
	shell.queue_free()
	await process_frame
	print("BRANCH_SWITCH_OK: four options, confirmation, old selection preserved, busy guarded, existing entry route")
	quit()
