extends SceneTree
const Motion = preload("res://src/ui/card_hover_motion.gd")
const Visuals = preload("res://src/ui/approved_visuals.gd")
func _initialize() -> void: call_deferred("run")
func run() -> void:
	var card := PanelContainer.new()
	card.position = Vector2(100,100)
	card.size = Vector2(400,200)
	root.add_child(card)
	var field := LineEdit.new()
	card.add_child(field)
	Visuals.apply(card)
	Visuals.apply(card)
	var controllers := card.get_children().filter(func(n): return n.get_script() == Motion)
	assert(controllers.size() == 1)
	var motion = controllers[0]
	await process_frame
	motion.set_process(false)
	motion.animate(true)
	await create_timer(0.4).timeout
	assert(card.scale.y > 1.0)
	assert(card.position == Vector2(100,100))
	field.text = "Preservado"
	motion.animate(false)
	await create_timer(0.3).timeout
	assert(card.scale.is_equal_approx(Vector2.ONE))
	assert(field.text == "Preservado")
	OS.set_environment("GRUPO_RS_REDUCED_MOTION","1")
	motion.animate(true)
	assert(card.scale == Vector2.ONE)
	OS.set_environment("GRUPO_RS_REDUCED_MOTION","")
	print("CARD_MOTION_OK: unique controller, panel bounce, stable layout, input preserved, reduced motion")
	card.queue_free()
	await process_frame
	quit()
