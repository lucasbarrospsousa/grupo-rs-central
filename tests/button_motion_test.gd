extends SceneTree
const Motion = preload("res://src/ui/button_motion.gd")
func _initialize() -> void: call_deferred("run")
func run() -> void:
	var host := Control.new()
	root.add_child(host)
	Motion.install(host)
	var transient:=Button.new();host.add_child(transient);transient.free()
	var button := Button.new()
	button.size = Vector2(180,48)
	host.add_child(button)
	await process_frame
	await process_frame
	assert(button.has_meta("button_motion"))
	button.mouse_entered.emit()
	await create_timer(0.3).timeout
	assert(button.scale.y > 1.0)
	button.button_down.emit()
	await create_timer(0.15).timeout
	assert(button.scale.y < 1.0)
	button.button_up.emit()
	button.mouse_exited.emit()
	await create_timer(0.3).timeout
	assert(button.scale.is_equal_approx(Vector2.ONE))
	button.disabled = true
	button.mouse_entered.emit()
	await process_frame
	assert(button.scale == Vector2.ONE)
	host.queue_free()
	await process_frame
	var extra := Button.new()
	root.add_child(extra)
	await process_frame
	extra.queue_free()
	print("BUTTON_MOTION_OK: dynamic attachment, hover, press, return, disabled, cleanup")
	quit()
