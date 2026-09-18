extends RefCounted
## Composition only: parsing, cleanup, confirmation and persistence stay in host.
const UI = preload("res://src/ui/approved_dashboard.gd")
const Design = preload("res://src/ui/app_design_system.gd")

static func button(host: Control, caption: String, icon_name: String, callback: Callable, primary: bool = false) -> Button:
	var b := UI.action(host, caption, callback, primary)
	b.icon = load("res://assets/icons/approved/%s.svg" % icon_name)
	b.custom_minimum_size = Vector2(220, 48)
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	b.icon_alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.add_theme_constant_override("h_separation", 12)
	for state in ["normal", "hover", "pressed", "focus"]:
		var style := b.get_theme_stylebox(state).duplicate() as StyleBox
		style.content_margin_left = 18
		style.content_margin_right = 18
		b.add_theme_stylebox_override(state, style)
	b.add_theme_font_override("font", UI.Regular)
	b.add_theme_font_size_override("font_size", 14)
	b.add_theme_stylebox_override("disabled", Design.surface(Color("#f1f5f9"), Color("#e0e8f0"), 1, 12))
	b.add_theme_color_override("font_disabled_color", Color("#728397"))
	return b

static func build(host: Control) -> Control:
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var root := VBoxContainer.new()
	root.name = "ApprovedBulkWorkspace"
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.add_theme_constant_override("separation", 22)
	scroll.add_child(root)
	var header := HBoxContainer.new()
	var titles := VBoxContainer.new()
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_theme_constant_override("separation", 8)
	titles.add_child(UI.text("GRUPO RS CENTRAL / " + host.selected_branch_name.to_upper(), 11, Design.MUTED))
	titles.add_child(UI.text("Cadastro em massa", 36))
	titles.add_child(UI.text("Da lista ao estoque: prepare, revise e confirme com segurança.", 14, Design.MUTED))
	header.add_child(titles)
	header.add_child(button(host, "Voltar ao estoque", "arrow", host._show_list))
	header.add_child(button(host,"SMS em massa","mail",func():
		var dialog:=preload("res://src/ui/bulk_sms_dialog.gd").new()
		host.add_child(dialog);dialog.setup(host)
	))
	root.add_child(header)
	var metrics := HBoxContainer.new()
	metrics.name = "BulkMetricCards"
	metrics.add_theme_constant_override("separation", 18)
	root.add_child(metrics)
	for spec in [["read", "Registros recebidos", "Total identificado na lista", "#236fba", "file"], ["valid", "Prontos para revisão", "Registros válidos na análise", "#153e60", "check"], ["duplicate", "Duplicados", "Repetições identificadas", "#ff851b", "refresh"], ["invalid", "Precisam de atenção", "Erros e conflitos encontrados", "#ffffff", "signal"]]:
		var body := UI.panel(str(spec[1]))
		var card := body.get_parent() as PanelContainer
		card.custom_minimum_size.y = 150
		metrics.add_child(card)
		var fill := Color(str(spec[3]))
		var style := Design.surface(fill, fill if fill != Color.WHITE else Design.BORDER, 1, 19)
		style.content_margin_left = 24
		style.content_margin_right = 24
		style.content_margin_top = 20
		style.content_margin_bottom = 20
		card.add_theme_stylebox_override("panel", style)
		var ink := Design.TEXT if spec[0] in ["duplicate", "invalid"] else Color.WHITE
		(body.get_child(0) as Label).add_theme_color_override("font_color", ink)
		(body.get_child(0) as Label).add_theme_font_size_override("font_size", 15)
		var top := HBoxContainer.new()
		var caption := body.get_child(0)
		body.remove_child(caption)
		top.add_child(caption)
		caption.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var icon := TextureRect.new()
		icon.texture = load("res://assets/icons/approved/%s.svg" % spec[4])
		icon.custom_minimum_size = Vector2(24, 24)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		if ink == Color.WHITE:
			var shader := Shader.new()
			shader.code = "shader_type canvas_item; void fragment(){ vec4 c=texture(TEXTURE,UV); COLOR=vec4(1.0,1.0,1.0,c.a); }"
			var material := ShaderMaterial.new()
			material.shader = shader
			icon.material = material
		top.add_child(icon)
		body.add_child(top)
		var value := UI.text("0", 36, ink)
		body.add_child(value)
		body.add_child(UI.text(str(spec[2]), 12, ink))
		host.bulk_summary_value_labels[str(spec[0])] = value
	var columns := HBoxContainer.new()
	columns.add_theme_constant_override("separation", 22)
	root.add_child(columns)
	var input := UI.panel("01 · Adicionar equipamentos", "Cole os dados originais ou importe uma planilha.")
	input.get_parent().size_flags_stretch_ratio = 1.0
	columns.add_child(input.get_parent())
	input.add_child(host._make_bulk_operator_picker())
	var import_actions := HBoxContainer.new()
	import_actions.add_theme_constant_override("separation", 10)
	import_actions.add_child(button(host, "Importar planilha", "file", host._open_bulk_xlsx_dialog))
	import_actions.add_child(button(host, "Limpar lista", "refresh", host._request_clear_bulk_registration))
	input.add_child(import_actions)
	host.bulk_text_edit = TextEdit.new()
	host.bulk_text_edit.custom_minimum_size = Vector2(0, 170)
	host.bulk_text_edit.placeholder_text = "Uma série por linha. A placa é opcional.\n\n024000001\n024000002"
	host._style_text_edit(host.bulk_text_edit)
	host.bulk_text_edit.add_theme_font_override("font", UI.Regular)
	host.bulk_text_edit.add_theme_font_size_override("font_size", 16)
	host.bulk_text_edit.text_changed.connect(host._on_bulk_text_changed)
	host.bulk_text_edit.gui_input.connect(host._on_bulk_text_gui_input)
	input.add_child(host.bulk_text_edit)
	host.bulk_input_note_label = UI.text("O texto original fica disponível para desfazer a organização.", 13, Design.MUTED)
	host.bulk_input_note_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	input.add_child(host.bulk_input_note_label)
	if not host._is_regional_branch():
		input.add_child(button(host, "Consultar clientes", "signal", host._request_bulk_client_tracker_lookup))
	var review := UI.panel("02 · Quadro inteligente", "Identifique duplicados, organize e confira antes de cadastrar.")
	review.get_parent().size_flags_stretch_ratio = 1.15
	columns.add_child(review.get_parent())
	host.bulk_summary_status_panel = PanelContainer.new()
	var status_margin := MarginContainer.new()
	for edge in ["left", "right", "top", "bottom"]:
		status_margin.add_theme_constant_override("margin_" + edge, 14)
	host.bulk_summary_status_panel.add_child(status_margin)
	host.bulk_summary_status_label = UI.text("Aguardando a lista para análise.", 14)
	host.bulk_summary_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status_margin.add_child(host.bulk_summary_status_label)
	review.add_child(host.bulk_summary_status_panel)
	var actions := GridContainer.new()
	actions.columns = 2
	actions.add_theme_constant_override("h_separation", 10)
	actions.add_theme_constant_override("v_separation", 10)
	host.bulk_analysis_button = button(host, "Analisar lista", "signal", host._request_bulk_analysis)
	host.bulk_clean_button = button(host, "Organizar dados", "check", host._request_bulk_cleanup)
	host.bulk_undo_button = button(host, "Desfazer organização", "arrow", host._undo_bulk_cleanup)
	host.bulk_copy_button = button(host, "Copiar resultado", "file", host._copy_bulk_clean_result)
	for action in [host.bulk_analysis_button, host.bulk_clean_button, host.bulk_undo_button, host.bulk_copy_button]:
		action.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		actions.add_child(action)
	review.add_child(actions)
	host.bulk_preview_status_label = UI.text("Prévia dos registros", 14, Design.MUTED)
	review.add_child(host.bulk_preview_status_label)
	host.bulk_preview_count_label = UI.text("0", 14)
	host.bulk_preview_count_label.visible = false
	review.add_child(host.bulk_preview_count_label)
	var preview_scroll := ScrollContainer.new()
	preview_scroll.custom_minimum_size.y = 135
	preview_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	host.bulk_preview_body = VBoxContainer.new()
	host.bulk_preview_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	preview_scroll.add_child(host.bulk_preview_body)
	review.add_child(preview_scroll)
	var confirm := button(host, "Revisar e cadastrar", "check", host._request_register_bulk_items, true)
	review.add_child(confirm)
	var note := UI.text("O cadastro só ocorre após a confirmação. A análise não grava no estoque.", 12, Design.MUTED)
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	review.add_child(note)
	host.bulk_result_label = UI.text("")
	host.bulk_result_label.visible = false
	root.add_child(host.bulk_result_label)
	host._render_bulk_preview([], [], [])
	host._update_bulk_analysis_summary({})
	return scroll
