extends RefCounted
## Serial identifiers remain strings: never strip leading zeroes or use fuzzy matching.
static func parse(query: String) -> Dictionary:
	var active := query.contains(";") or query.contains("\n") or query.contains("\r")
	var serials: Dictionary = {}
	if active:
		for part in query.replace("\r\n", ";").replace("\n", ";").replace("\r", ";").split(";", false):
			var serial := part.strip_edges()
			if not serial.is_empty(): serials[serial] = true
	return {"active": active, "serials": serials}

static func matches(product: Dictionary, serials: Dictionary) -> Array[String]:
	var result: Array[String] = []
	for field in ["imei", "sku"]:
		var serial := str(product.get(field, "")).strip_edges()
		if serials.has(serial) and not result.has(serial): result.append(serial)
	return result
