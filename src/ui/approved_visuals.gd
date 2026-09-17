extends RefCounted
## Presentation only: never changes callbacks, input values or operational state.

static func apply(root: Control, inside_card: bool = false) -> void:
	var is_card := root is PanelContainer
	if is_card and not inside_card and not root.get_meta("static_card", false):
		preload("res://src/ui/card_hover_motion.gd").attach(root)
	if root is Button and root.icon != null:
		root.expand_icon = true
		root.add_theme_constant_override("icon_max_width", 22)
	# Only explicitly tagged outer cards get the large radius and shadow.
	# Table rows, input groups and nested surfaces must retain their own geometry.
	if root is PanelContainer and root.has_meta("approved_card"):
		var original := root.get_theme_stylebox("panel")
		if original is StyleBoxFlat and original.bg_color.r > 0.92 and original.bg_color.g > 0.92 and original.bg_color.b > 0.92:
			var box := original.duplicate() as StyleBoxFlat
			box.set_corner_radius_all(18)
			box.border_color = Color("#e0e8f0")
			box.shadow_color = Color(0.07, 0.19, 0.31, 0.06)
			box.shadow_size = 8
			box.shadow_offset = Vector2(0, 4)
			root.add_theme_stylebox_override("panel", box)
	for child in root.get_children():
		if child is Control:
			apply(child, inside_card or is_card)

static func metric_ink(root: Control, ink: Color) -> void:
	if root is Label:
		root.add_theme_color_override("font_color", ink)
	for child in root.get_children():
		if child is Control:
			metric_ink(child, ink)
