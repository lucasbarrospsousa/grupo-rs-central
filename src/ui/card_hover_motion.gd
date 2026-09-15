extends Node
## Scale around the lower edge: no container positions or layout sizes change.
var target: Control
var tween: Tween
var hovered := false

static func attach(card: Control) -> void:
	if card.has_meta("card_hover_motion"): return
	card.set_meta("card_hover_motion", true)
	var motion := new()
	motion.target = card
	card.add_child(motion)
	if card is Button:
		card.mouse_entered.connect(motion.animate.bind(true))
		card.mouse_exited.connect(motion.animate.bind(false))
		motion.set_process(false)
	card.resized.connect(motion.reset)

func _process(_delta: float) -> void:
	# Test the whole card, including children, without intercepting their input.
	var inside := target.is_visible_in_tree() and target.get_global_rect().has_point(target.get_global_mouse_position())
	var ancestor := target.get_parent()
	while inside and ancestor is Control:
		if ancestor.clip_contents:
			inside = ancestor.get_global_rect().has_point(target.get_global_mouse_position())
		ancestor = ancestor.get_parent()
	if inside != hovered:
		hovered = inside
		animate(inside)

func reset() -> void:
	if tween: tween.kill()
	target.scale = Vector2.ONE
	target.pivot_offset = Vector2(target.size.x * 0.5, target.size.y)

func animate(enter: bool) -> void:
	if tween: tween.kill()
	if OS.get_environment("GRUPO_RS_REDUCED_MOTION") == "1":
		target.scale = Vector2.ONE
		return
	target.pivot_offset = Vector2(target.size.x * 0.5, target.size.y)
	tween = create_tween()
	tween.tween_property(target, "scale", Vector2(1.012, 1.035) if enter else Vector2.ONE, 0.32 if enter else 0.2).set_trans(Tween.TRANS_BACK if enter else Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
