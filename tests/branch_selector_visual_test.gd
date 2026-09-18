extends SceneTree
func _initialize() -> void: call_deferred("run")
func run() -> void:
	root.size = Vector2i(360,380)
	root.content_scale_size = Vector2i(360,380)
	root.gui_embed_subwindows = true
	var background := ColorRect.new()
	background.color = Color("#102f4c")
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(background)
	var selector := OptionButton.new()
	selector.position = Vector2(50,60)
	selector.size = Vector2(240,40)
	preload("res://src/ui/branch_selector_style.gd").apply(selector)
	for label in ["Imperatriz","Araguaína","Açailândia","Marabá"]: selector.add_item(label)
	background.add_child(selector)
	await process_frame
	selector.show_popup()
	await create_timer(0.3).timeout
	RenderingServer.force_draw()
	assert(root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("branch-popup.png")) == OK)
	print("BRANCH_STYLE_OK")
	quit()
