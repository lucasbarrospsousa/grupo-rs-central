extends Node
var target: BaseButton
var tween: Tween
var hover := false
var down := false

static func install(host: Node) -> void:
	if host.has_meta("button_motion_installed"): return
	host.set_meta("button_motion_installed", true)
	var watch := Node.new()
	host.add_child(watch)
	var tree := host.get_tree()
	var on_added := func(node: Node):
		if node is BaseButton and host.is_ancestor_of(node):
			attach.call_deferred(node)
	tree.node_added.connect(on_added)
	watch.tree_exiting.connect(func():
		if tree.node_added.is_connected(on_added): tree.node_added.disconnect(on_added)
	)

static func attach(button: BaseButton) -> void:
	if not is_instance_valid(button) or button.has_meta("button_motion") or button.has_meta("card_hover_motion"): return
	button.set_meta("button_motion", true)
	var motion := new()
	motion.target = button
	button.add_child(motion)
	button.mouse_entered.connect(func(): motion.hover = true; motion.animate())
	button.mouse_exited.connect(func(): motion.hover = false; motion.down = false; motion.animate())
	button.button_down.connect(func(): motion.down = true; motion.animate())
	button.button_up.connect(func(): motion.down = false; motion.animate())
	button.resized.connect(motion.reset)
	button.visibility_changed.connect(motion.reset)

func _process(_delta: float) -> void:
	if target.disabled and (tween != null or target.scale != Vector2.ONE): reset()

func reset() -> void:
	if tween: tween.kill()
	tween = null
	target.scale = Vector2.ONE
	down = false

func animate() -> void:
	if tween: tween.kill()
	if target.disabled or not target.is_visible_in_tree() or OS.get_environment("GRUPO_RS_REDUCED_MOTION") == "1":
		reset()
		return
	target.pivot_offset = target.size * 0.5
	var destination := Vector2(0.98, 0.96) if down else (Vector2(1.012, 1.035) if hover else Vector2.ONE)
	tween = create_tween()
	tween.tween_property(target,"scale",destination,0.10 if down else 0.22).set_trans(Tween.TRANS_SINE if down or not hover else Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
