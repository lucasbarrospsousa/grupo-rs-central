extends "res://src/ui/route_map.gd"
## Individual position using the route viewer's viewport/cache/input lifecycle.
const PIN = preload("res://assets/icons/location/marker.png")
var plate := ""

func load_visible() -> void:
	await super.load_visible()
	# Keep memory bounded during long pan/zoom sessions; disk cache stays reusable.
	if tiles.size() > 96:
		var n := pow(2, zoom)
		var origin := center * n - size / 512
		var right := center * n + size / 512
		var visible: Dictionary = {}
		for y in range(int(floor(origin.y)), int(ceil(right.y))):
			for x in range(int(floor(origin.x)), int(ceil(right.x))):
				visible["streets/%d/%d/%d" % [zoom, x, y]] = true
		for key in tiles.keys():
			if tiles.size() <= 96: break
			if not visible.has(key): tiles.erase(key)

func set_location(location: Dictionary) -> void:
	plate = str(location.get("plate", ""))
	set_route([{"lat": location.lat, "lng": location.lng}])

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color("#edf3f7"))
	var n := pow(2, zoom)
	var origin := center * n - size / 512
	var right := center * n + size / 512
	for y in range(int(floor(origin.y)), int(ceil(right.y))):
		for x in range(int(floor(origin.x)), int(ceil(right.x))):
			var rect := Rect2((Vector2(x, y) - origin) * 256, Vector2(256, 256))
			var key := "streets/%d/%d/%d" % [zoom, x, y]
			if tiles.has(key): draw_texture_rect(tiles[key], rect, false)
			else: draw_rect(rect, Color("#d9e4ed"), false, 1)
	if not points.is_empty():
		var p := pixel(world(points[0]))
		draw_circle(p + Vector2(0, 2), 8, Color(0.06, 0.19, 0.28, 0.15))
		draw_texture_rect(PIN, Rect2(p - Vector2(16, 52), Vector2(32, 52)), false)
		if plate != "":
			var font := ThemeDB.fallback_font
			var width := font.get_string_size(plate, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x + 20
			var box := StyleBoxFlat.new()
			box.bg_color = Color.WHITE
			box.set_corner_radius_all(6)
			draw_style_box(box, Rect2(p + Vector2(-width / 2, -82), Vector2(width, 25)))
			draw_string(font, p + Vector2(-width / 2 + 10, -65), plate, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("#123555"))
	if status != "":
		var message := status.replace("O percurso permanece visível.", "A posição permanece visível.")
		draw_rect(Rect2(8, size.y - 32, maxf(100, size.x - 16), 26), Color(1, 1, 1, 0.95))
		draw_string(ThemeDB.fallback_font, Vector2(16, size.y - 14), message, HORIZONTAL_ALIGNMENT_LEFT, size.x - 32, 12, Color("#476682"))
