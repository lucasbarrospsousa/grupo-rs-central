extends Control
## One OSM tile on explicit request, seven-day local cache, no polling/prefetch.
var texture: Texture2D
var point := Vector2.ZERO
var location: Dictionary = {}
var status := "Selecione um registro e carregue a posição."
var generation := 0
var loading := false

func _ready() -> void:
	custom_minimum_size = Vector2(210,120)
	resized.connect(queue_redraw)

func reset(coords: Dictionary) -> void:
	generation += 1; location = coords; texture = null;loading=false
	status = "Mapa sob demanda" if not coords.is_empty() else "Coordenadas indisponíveis"
	queue_redraw()

func load_position() -> void:
	if location.is_empty() or loading or texture!=null: return
	loading=true
	generation += 1
	var ticket := generation
	status = "Carregando mapa…"; queue_redraw()
	var zoom := 14
	var tiles := pow(2.0,zoom)
	var x: float = (float(location.lng)+180.0)/360.0*tiles
	var radians := deg_to_rad(float(location.lat))
	var y: float = (1.0-asinh(tan(radians))/PI)/2.0*tiles
	point = Vector2(x-floor(x),y-floor(y))
	# Public map tiles only, cached for seven days. No track or credential cache.
	var cache_dir:="user://records_map_tiles"
	var cache_path:="%s/%d-%d-%d.png" % [cache_dir,zoom,int(x),int(y)]
	var bitmap:=Image.new()
	if FileAccess.file_exists(cache_path) and Time.get_unix_time_from_system()-FileAccess.get_modified_time(cache_path)<7*86400 and bitmap.load(cache_path)==OK:
		texture=ImageTexture.create_from_image(bitmap);status="";loading=false;queue_redraw();return
	var http := HTTPRequest.new(); http.timeout=12;http.max_redirects=0;http.body_size_limit=1024*1024;add_child(http)
	var error := http.request("https://tile.openstreetmap.org/%d/%d/%d.png" % [zoom,int(x),int(y)],PackedStringArray(["User-Agent: GrupoRSCentral/4.3 (desktop records; on-demand map)"]))
	if error != OK: http.queue_free();status="Mapa indisponível";loading=false;queue_redraw();return
	var response: Array = await http.request_completed
	http.queue_free()
	if ticket != generation: return
	loading=false
	if response[0]==HTTPRequest.RESULT_SUCCESS and response[1]==200 and bitmap.load_png_from_buffer(response[3])==OK:
		texture = ImageTexture.create_from_image(bitmap); status=""
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(cache_dir))
		bitmap.save_png(cache_path)
	else: status="Mapa indisponível. Use Ver posição."
	queue_redraw()

func _draw() -> void:
	var background:=StyleBoxFlat.new();background.bg_color=Color("#edf4fb");background.set_corner_radius_all(10)
	draw_style_box(background,Rect2(Vector2.ZERO,size))
	if texture:
		var source_size:=texture.get_size()
		var scale_value:=maxf(size.x/source_size.x,size.y/source_size.y)
		var visible:=size/scale_value
		var origin:=point*source_size-visible*.5
		origin.x=clampf(origin.x,0,source_size.x-visible.x);origin.y=clampf(origin.y,0,source_size.y-visible.y)
		draw_texture_rect_region(texture,Rect2(Vector2.ZERO,size),Rect2(origin,visible))
		var pixel := (point*source_size-origin)*scale_value
		draw_circle(pixel,10,Color.WHITE);draw_circle(pixel,7,Color("#1684df"))
	else:
		draw_string(ThemeDB.fallback_font,Vector2(10,size.y/2),status,HORIZONTAL_ALIGNMENT_LEFT,maxf(1,size.x-20),13,Color("#65819e"))
