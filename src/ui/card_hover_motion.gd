extends Node
## Scale around the lower edge: no container positions or layout sizes change.
var target: Control
var tween: Tween

static func attach(card: Control) -> void:
	var motion := new()
	motion.target = card
	card.add_child(motion)
	card.mouse_entered.connect(motion.animate.bind(true))
	card.mouse_exited.connect(motion.animate.bind(false))
	card.resized.connect(motion.reset)

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
