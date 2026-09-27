extends Control
## Native viewport tiles, no bulk download, no track persistence. Visible tiles only.
signal point_selected(index: int)
var points:Array=[]
var zoom:=13
var center:=Vector2(.5,.5)
var tiles:Dictionary={}
var layer:="streets"
var network_enabled:=true
var generation:=0
var selected_index:=-1
var marker_position:=Vector2.ZERO
var marker_tween:Tween
var dragging:=false
var dragged:=false
var status:="Busque um veículo para visualizar o percurso."
var debounce:Timer
var fetching:=false
var refresh_pending:=false

func _ready()->void:
	custom_minimum_size=Vector2(440,280);size_flags_vertical=SIZE_EXPAND_FILL;clip_contents=true
	mouse_default_cursor_shape=Control.CURSOR_DRAG
	debounce=Timer.new();debounce.one_shot=true;debounce.wait_time=.25;add_child(debounce);debounce.timeout.connect(load_visible)
	resized.connect(func():queue_redraw();schedule())

static func world(row:Dictionary)->Vector2:
	var lat:=clampf(float(row.lat),-85.0511,85.0511)
	return Vector2((float(row.lng)+180)/360,(1-asinh(tan(deg_to_rad(lat)))/PI)/2)

func pixel(pos:Vector2)->Vector2:return (pos-center)*256*pow(2,zoom)+size/2

func set_route(rows:Array)->void:
	generation+=1;points=rows;selected_index=-1;tiles.clear()
	if marker_tween:marker_tween.kill()
	status="Nenhuma posição válida neste período." if rows.is_empty() else "Carregando mapa…"
	if not rows.is_empty():fit_route()
	queue_redraw()

func fit_route()->void:
	if points.is_empty():return
	var low:=world(points[0]);var high:=low
	for row in points:
		var p:=world(row);low=low.min(p);high=high.max(p)
	center=(low+high)/2;zoom=16
	while zoom>2:
		var span:Vector2=(high-low)*256*pow(2,zoom)
		if span.x<=maxf(200,size.x-100) and span.y<=maxf(180,size.y-90):break
		zoom-=1
	schedule();queue_redraw()

func schedule()->void:
	if debounce and not points.is_empty():debounce.start()

func _exit_tree()->void:
	# Freeing the screen cancels its child HTTPRequest nodes and playback tween.
	generation+=1
	if marker_tween:marker_tween.kill()

func change_zoom(delta:int)->void:
	zoom=clampi(zoom+delta,2,18);generation+=1;schedule();queue_redraw()

func change_layer(value:String)->void:
	if value not in ["streets","satellite"]:return
	layer=value;generation+=1;tiles.clear();schedule();queue_redraw()

func select_point(index:int,animate:bool=true)->void:
	if index<0 or index>=points.size():return
	var next_position:=world(points[index]);var old:=selected_index;selected_index=index
	if marker_tween:marker_tween.kill()
	if animate and old>=0 and not points[index].gap_before and OS.get_environment("GRUPO_RS_REDUCED_MOTION")!="1":
		marker_tween=create_tween();marker_tween.tween_method(func(p):marker_position=p;queue_redraw(),marker_position,next_position,.25)
	else:marker_position=next_position;queue_redraw()

func _gui_input(event:InputEvent)->void:
	if points.is_empty():return
	if event is InputEventMouseButton:
		if event.button_index==MOUSE_BUTTON_WHEEL_UP and event.pressed:change_zoom(1);accept_event()
		elif event.button_index==MOUSE_BUTTON_WHEEL_DOWN and event.pressed:change_zoom(-1);accept_event()
		elif event.button_index==MOUSE_BUTTON_LEFT:
			if event.pressed:dragging=true;dragged=false
			else:
				dragging=false
				if dragged:generation+=1;schedule()
				else:
					var best:=-1;var distance:=20.0
					for i in range(points.size()):
						var d:=pixel(world(points[i])).distance_to(event.position)
						if d<distance:distance=d;best=i
					if best>=0:point_selected.emit(best)
	elif event is InputEventMouseMotion and dragging:
		center-=event.relative/(256*pow(2,zoom));center=center.clamp(Vector2.ZERO,Vector2.ONE);dragged=true;queue_redraw()

func load_visible()->void:
	if not network_enabled or points.is_empty() or not is_visible_in_tree():return
	if fetching:refresh_pending=true;return
	fetching=true;refresh_pending=false
	var ticket:=generation;var z:=zoom;var provider:=layer;var n:=int(pow(2,z));var origin:=center*n-size/512
	var right:=center*n+size/512;var failed:=0
	for y in range(maxi(0,int(floor(origin.y))),mini(n,int(ceil(right.y)))):
		for x in range(maxi(0,int(floor(origin.x))),mini(n,int(ceil(right.x)))):
			if ticket!=generation:break
			var key:="%s/%d/%d/%d" % [provider,z,x,y]
			if tiles.has(key):continue
			var cache:="user://route_map_tiles/"+key.replace("/","-")+".png"
			var bitmap:=Image.new()
			if FileAccess.file_exists(cache) and Time.get_unix_time_from_system()-FileAccess.get_modified_time(cache)<7*86400 and bitmap.load(cache)==OK:
				tiles[key]=ImageTexture.create_from_image(bitmap);queue_redraw();continue
			var url:="https://tile.openstreetmap.org/%d/%d/%d.png" % [z,x,y]
			if provider=="satellite":url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/%d/%d/%d" % [z,y,x]
			var http:=HTTPRequest.new();http.timeout=10;http.max_redirects=0;http.body_size_limit=2*1024*1024;add_child(http)
			var err:=http.request(url,PackedStringArray(["User-Agent: GrupoRSCentral/4.3 (desktop route viewer; https://github.com/lucasbarrospsousa/grupo-rs-central)"]))
			if err!=OK:http.queue_free();failed+=1;continue
			var response:Array=await http.request_completed;http.queue_free()
			if ticket!=generation:break
			if response[0]==HTTPRequest.RESULT_SUCCESS and response[1]==200 and (bitmap.load_png_from_buffer(response[3])==OK if provider=="streets" else bitmap.load_jpg_from_buffer(response[3])==OK):
				tiles[key]=ImageTexture.create_from_image(bitmap)
				DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://route_map_tiles"));bitmap.save_png(cache)
			else:failed+=1
			queue_redraw()
	fetching=false
	if ticket==generation:status="" if failed==0 else "Fundo do mapa indisponível em parte. O percurso permanece visível."
	queue_redraw()
	if refresh_pending or ticket!=generation:schedule()

static func color(row:Dictionary)->Color:
	if row.is_memory:return Color("#ed990c")
	return Color("#14a169") if row.ignicao==1 else (Color("#da4a60") if row.ignicao==0 else Color("#8295a9"))

func _draw()->void:
	draw_rect(Rect2(Vector2.ZERO,size),Color("#edf3f7"))
	var n:=pow(2,zoom);var origin:=center*n-size/512;var right:=center*n+size/512
	for y in range(int(floor(origin.y)),int(ceil(right.y))):
		for x in range(int(floor(origin.x)),int(ceil(right.x))):
			var rect:=Rect2((Vector2(x,y)-origin)*256,Vector2(256,256));var key:="%s/%d/%d/%d" % [layer,zoom,x,y]
			if tiles.has(key):draw_texture_rect(tiles[key],rect,false)
			else:draw_rect(rect,Color("#dae4ed"),false,1)
	for i in range(1,points.size()):
		var a:=pixel(world(points[i-1]));var b:=pixel(world(points[i]))
		if points[i].gap_before:draw_dashed_line(a,b,Color("#8b96a3"),2,8)
		else:draw_line(a,b,Color.WHITE,7,true);draw_line(a,b,color(points[i]),4,true)
	if not points.is_empty():
		for pair in [[0,"A",Color("#14a169")],[points.size()-1,"B",Color("#da4a60")]]:
			var p:=pixel(world(points[pair[0]]));draw_circle(p,15,Color.WHITE);draw_circle(p,12,pair[2]);draw_string(ThemeDB.fallback_font,p+Vector2(-5,5),pair[1],HORIZONTAL_ALIGNMENT_LEFT,-1,15,Color.WHITE)
	if selected_index>=0:
		var p:=pixel(marker_position);draw_circle(p,23,Color(0,.5,1,.17));draw_circle(p,18,Color.WHITE);draw_circle(p,15,Color("#087df1"));draw_texture_rect(preload("res://assets/icons/route/car.svg"),Rect2(p-Vector2(11,11),Vector2(22,22)),false)
	if status!="":
		draw_rect(Rect2(8,8,maxf(100,size.x-16),27),Color(1,1,1,.93));draw_string(ThemeDB.fallback_font,Vector2(16,27),status,HORIZONTAL_ALIGNMENT_LEFT,size.x-32,12,Color("#476682"))
