extends Control
## Read-only distribution, matching the three segments of the approved HTML.
var available := 0
var installed := 0
var total := 0

func _ready() -> void:
	custom_minimum_size = Vector2(165, 165)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func _draw() -> void:
	var center := size * 0.5
	var radius := minf(size.x, size.y) * 0.5 - 10.0
	draw_arc(center, radius, 0, TAU, 128, Color("#dbe8f5"), 19, true)
	if total <= 0: return
	var start := -PI * 0.5
	for segment in [[available, Color("#2180d5")], [installed, Color("#ff9028")]]:
		var angle := TAU * clampf(float(segment[0]) / total, 0, 1)
		if angle > 0: draw_arc(center, radius, start, start + angle, 96, segment[1], 19, true)
		start += angle
