extends "res://src/services/tracking_records.gd"
## Exact vehicle resolution is inherited. Only a bounded, read-only portal GET.
const GAP_SECONDS := 600

func history(context: Dictionary, window: Dictionary, branch: String) -> Dictionary:
	if branch != "imperatriz" or not context.get("ok",false) or not window.get("ok",false):
		return {"ok":false,"message":"Confirme veículo, base e período antes de consultar o trajeto."}
	if int(window.last)-int(window.first)>MAX_RANGE:
		return {"ok":false,"message":"Consulte até 7 dias por vez."}
	var http:=HTTPRequest.new();http.timeout=40;http.max_redirects=0;http.body_size_limit=16*1024*1024;add_child(http)
	var pairs:=PackedStringArray()
	for key in cookies:pairs.append(str(key)+"="+str(cookies[key]))
	var error:=http.request(ROOT+"/get_trajeto.php?"+query(context,window),PackedStringArray(["User-Agent: GrupoRSCentral/Trajeto","Cookie: "+"; ".join(pairs)]))
	if error!=OK:http.queue_free();return {"ok":false,"message":"Não foi possível iniciar a consulta."}
	var response:Array=await http.request_completed;http.queue_free()
	if response[0]!=HTTPRequest.RESULT_SUCCESS or response[1]!=200:
		return {"ok":false,"message":"Trajeto indisponível ou tempo esgotado. Reduza o período e tente novamente."}
	var body:String=decode_body.call(response[3]) if decode_body.is_valid() else response[3].get_string_from_utf8()
	return normalize_route(JSON.parse_string(body),window)

static func distance_km(a: Dictionary,b: Dictionary) -> float:
	var lat1:=deg_to_rad(float(a.lat));var lat2:=deg_to_rad(float(b.lat))
	var h:=pow(sin((lat2-lat1)/2),2)+cos(lat1)*cos(lat2)*pow(sin(deg_to_rad(float(b.lng)-float(a.lng))/2),2)
	return 6371.0088*2*asin(sqrt(clampf(h,0,1)))

static func normalize_route(payload: Variant, window: Dictionary) -> Dictionary:
	if not payload is Array:return {"ok":false,"message":"Resposta inválida ou sessão expirada; isso não significa ausência de posições."}
	if payload.size()>MAX_ROWS:return {"ok":false,"message":"Mais de 20 mil posições. Reduza o período."}
	var rows:Array=[];var discarded:=0;var seen:={};var maximum:Variant=null
	for source_index in range(payload.size()):
		var raw:Variant=payload[source_index]
		if not raw is Dictionary:return {"ok":false,"message":"Formato de posição inválido."}
		var coords:=coordinates(raw)
		var stamp:=event_time(raw.get("data_gps",raw.get("data", "")))
		if coords.is_empty() or stamp<=0 or stamp<int(window.first) or stamp>int(window.last):discarded+=1;continue
		var row:Dictionary=raw.duplicate(true);row.merge(coords,true)
		row.gps_time=stamp;row.server_time=event_time(raw.get("data_srv",""))
		row.speed=number(raw.get("vel",raw.get("velocidade")))
		row.ignicao=number(raw.get("ign",raw.get("ignicao")))
		row.is_memory=str(raw.get("mem",0)) in ["1","1.0","true"]
		row.gap_before=false;row.source_index=source_index;row.hodometer=number(raw.get("hodometro"))
		var key:="%s|%s|%s|%s|%s|%s" % [stamp,row.lat,row.lng,row.speed,row.ignicao,row.is_memory]
		if seen.has(key):continue
		seen[key]=true;rows.append(row)
		if row.speed!=null and row.speed>=0:maximum=row.speed if maximum==null else maxf(maximum,row.speed)
	rows.sort_custom(func(a,b):return a.gps_time<b.gps_time)
	var distance:=0.0;var gaps:=0;var memory:=0;var odometer_ok:=rows.size()>1
	for i in range(rows.size()):
		var row:Dictionary=rows[i]
		if row.is_memory:memory+=1
		if row.hodometer==null or row.hodometer<0:odometer_ok=false
		if i==0:continue
		var prior:Dictionary=rows[i-1]
		var elapsed:int=row.gps_time-prior.gps_time
		var segment:=distance_km(prior,row)
		# A long silence or physically implausible jump is never drawn as a known road.
		row.gap_before=elapsed>GAP_SECONDS or (discarded>0 and absi(row.source_index-prior.source_index)>1) or (segment>.05 and (elapsed<=0 or segment/maxf(elapsed,1)*3600>250))
		if row.gap_before:gaps+=1
		else:distance+=segment
		if row.hodometer!=null and prior.hodometer!=null and row.hodometer<prior.hodometer:odometer_ok=false
	var source:="GPS • estimativa"
	if odometer_ok and gaps==0:
		var delta:float=rows[-1].hodometer-rows[0].hodometer
		if delta>0 and delta<10000:distance=delta;source="Hodômetro"
	return {"ok":true,"rows":rows,"distance":distance if rows.size()>1 else null,"distance_source":source,"maximum":maximum,"gaps":gaps,"discarded":discarded,"memory_count":memory,"partial":discarded>0,"source":"Plataforma web • Imperatriz"}

static func kml(result: Dictionary,title: String) -> String:
	var xml:="<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<kml xmlns=\"http://www.opengis.net/kml/2.2\"><Document><name>"+title.xml_escape()+"</name>"
	var segment:=PackedStringArray()
	for row in result.get("rows",[]):
		if row.gap_before:
			if segment.size()>1:xml+="<Placemark><LineString><coordinates>"+" ".join(segment)+"</coordinates></LineString></Placemark>"
			segment.clear()
		var coord:="%.8f,%.8f,0" % [row.lng,row.lat];segment.append(coord)
		xml+="<Placemark><name>"+Time.get_datetime_string_from_unix_time(row.gps_time).xml_escape()+"</name><description>"+("Memória" if row.is_memory else "Posição GPS")+"</description><Point><coordinates>"+coord+"</coordinates></Point></Placemark>"
	if segment.size()>1:xml+="<Placemark><LineString><coordinates>"+" ".join(segment)+"</coordinates></LineString></Placemark>"
	return xml+"</Document></kml>"
