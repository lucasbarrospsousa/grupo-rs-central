extends RefCounted
# Prefix labels are classifications, not a measured firmware version.
const OPTIONS: Array[String] = ["Selecione", "V7.3.2", "V7.2.2/7.1.6", "V7.3.5"]

static func from_plate(plate: String) -> String:
	var key := plate.strip_edges().to_upper().replace(" ", "").replace("-", "")
	for prefix in {"GRS": "V7.3.2", "AAA": "V7.2.2/7.1.6", "XRS": "V7.3.5"}:
		if key.begins_with(prefix):
			return {"GRS": "V7.3.2", "AAA": "V7.2.2/7.1.6", "XRS": "V7.3.5"}[prefix]
	return ""

static func normalize(value: String) -> String:
	var key := value.strip_edges().to_lower().replace(" ", "").replace(".", "").replace("-", "").replace("/", "")
	match key:
		"grs", "rsnovo", "rsnovos", "v732", "732": return "V7.3.2"
		"aaa", "reutilizado", "reutilizada", "usado", "usada", "v722716", "v722v716": return "V7.2.2/7.1.6"
		"xrs", "v735", "v7350", "v735versao", "v735version", "735": return "V7.3.5"
		"v722", "722": return "V7.2.2"
		"v716", "716": return "V7.1.6"
	return value.strip_edges()
