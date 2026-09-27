extends RefCounted

static func parse(text:String) -> Dictionary:
	if text.length()>100000:return {"ok":false,"error":"Lista muito grande (limite de 1000 aparelhos)."}
	var rows:Array=[];var seen:Dictionary={};var line_no:=0
	var separator:=RegEx.new();separator.compile("^[\\s|:\\-]+$")
	var group_regex:=RegEx.new();group_regex.compile("^(?:grupo\\s*)?([1-4])$")
	var serial_regex:=RegEx.new();serial_regex.compile("^024[0-9]{6}$")
	var phone_regex:=RegEx.new();phone_regex.compile("^[+0-9() .-]+$")
	for raw in text.replace("\r","").split("\n"):
		line_no+=1;var line:=raw.strip_edges()
		if line=="" or separator.search(line):continue
		var cells:PackedStringArray
		if line.contains("|"):
			cells=line.trim_prefix("|").trim_suffix("|").split("|",true)
		elif line.contains("\t"):cells=line.split("\t",true)
		elif line.contains(";"):cells=line.split(";",true)
		else:return {"ok":false,"error":"Linha %d: copie as três colunas da tabela ou planilha." % line_no}
		if cells.size()!=3:return {"ok":false,"error":"Linha %d: são necessárias três colunas." % line_no}
		var serial:=cells[0].strip_edges();var phone:=cells[1].strip_edges();var group:=cells[2].strip_edges().to_lower()
		if serial.to_lower() in ["série","serie","aparelho","número de série","numero de serie"] and group.contains("grupo"):continue
		var matched:=group_regex.search(group)
		if not serial_regex.search(serial) or not phone_regex.search(phone) or matched==null:
			return {"ok":false,"error":"Linha %d: confira série 024, telefone e grupo de 1 a 4." % line_no}
		var digits:=""
		for c in phone:if c>="0" and c<="9":digits+=c
		if digits.begins_with("55") and digits.length() in [12,13]:digits=digits.substr(2)
		if digits.length() not in [10,11] or digits.begins_with("0"):
			return {"ok":false,"error":"Linha %d: telefone deve conter DDD e 10 ou 11 dígitos." % line_no}
		if seen.has("s:"+serial) or seen.has("p:"+digits):return {"ok":false,"error":"Linha %d: série ou telefone repetido na lista." % line_no}
		seen["s:"+serial]=true;seen["p:"+digits]=true
		var formatted:="(%s) %s-%s" % [digits.substr(0,2),digits.substr(2,digits.length()-6),digits.right(4)]
		rows.append({"serial":serial,"phone":formatted,"group":int(matched.get_string(1))})
		if rows.size()>1000:return {"ok":false,"error":"Limite de 1000 aparelhos por lista."}
	if rows.is_empty():return {"ok":false,"error":"Nenhuma linha de aparelho encontrada."}
	return {"ok":true,"rows":rows}
