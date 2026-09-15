extends RefCounted
const Design = preload("res://src/ui/app_design_system.gd")
const SelectorFont = preload("res://assets/fonts/Noto_Sans/static/NotoSans-SemiBold.ttf")

static func apply(selector: OptionButton) -> void:
	selector.custom_minimum_size.y = 40
	selector.add_theme_font_override("font", SelectorFont)
	selector.add_theme_font_size_override("font_size", 14)
	selector.add_theme_color_override("font_color", Color.WHITE)
	selector.add_theme_color_override("font_hover_color", Color.WHITE)
	selector.add_theme_color_override("font_pressed_color", Color.WHITE)
	selector.add_theme_color_override("font_focus_color", Color.WHITE)
	selector.add_theme_constant_override("arrow_margin", 12)
	for state in ["normal", "hover", "pressed", "focus"]:
		var box := Design.surface(Color("#194668") if state == "normal" else Color("#245d85"), Color("#3c6b8b") if state == "normal" else Color("#ff9427"), 1, 9)
		box.content_margin_left = 12
		box.content_margin_right = 30
		selector.add_theme_stylebox_override(state, box)
	var popup := selector.get_popup()
	var panel := Design.surface(Color("#123750"), Color("#3c6b8b"), 1, 12, true)
	panel.content_margin_left = 8
	panel.content_margin_right = 8
	panel.content_margin_top = 8
	panel.content_margin_bottom = 8
	popup.add_theme_stylebox_override("panel", panel)
	popup.add_theme_stylebox_override("hover", Design.surface(Color("#246ba1"), Color.TRANSPARENT, 0, 7))
	popup.add_theme_font_override("font", SelectorFont)
	popup.add_theme_font_size_override("font_size", 14)
	popup.add_theme_color_override("font_color", Color("#e2edf6"))
	popup.add_theme_color_override("font_hover_color", Color.WHITE)
	popup.add_theme_color_override("font_disabled_color", Color("#8098ab"))
	popup.add_theme_constant_override("v_separation", 16)
	popup.add_theme_constant_override("h_separation", 10)
	popup.add_theme_constant_override("item_start_padding", 8)
	popup.add_theme_constant_override("item_end_padding", 10)
