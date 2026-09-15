extends SceneTree
func _initialize() -> void: call_deferred("run")
func run() -> void:
	var host = preload("res://tests/fixtures/offline_main_dashboard.gd").new()
	var data: Array[Dictionary] = []
	for i in range(3268):
		data.append({"sku":"099%06d" % i,"installed_at":"%02d/09/2026 12:30:00" % (1+i%28) if i%5 else "", "discharged_at":""})
	for query in ["", "099000"]:
		var expected := data.duplicate(true)
		var actual := data.duplicate(true)
		var start := Time.get_ticks_usec()
		expected.sort_custom(func(a,b):
			if query != "":
				var sa: int = host._search_relevance(a,query)
				var sb: int = host._search_relevance(b,query)
				if sa != sb: return sa > sb
			return host._inventory_installation_is_newer(a,b)
		)
		var old_ms := (Time.get_ticks_usec()-start)/1000.0
		start = Time.get_ticks_usec()
		host._sort_inventory_products(actual,query)
		var new_ms := (Time.get_ticks_usec()-start)/1000.0
		assert(actual == expected, "Sort order changed")
		print("SORT_PARITY_OK query=",query," old_ms=",old_ms," new_ms=",new_ms)
	host.free()
	quit()
