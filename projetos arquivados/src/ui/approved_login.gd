extends RefCounted
const UI = preload("res://src/ui/approved_dashboard.gd")
const Design = preload("res://src/ui/app_design_system.gd")

static func surface(fill: Color, left: bool) -> StyleBoxFlat:
	var style := Design.surface(fill, Color("#e0e8f2"), 0, 28)
	style.corner_radius_top_right = 0 if left else 28
	style.corner_radius_bottom_right = 0 if left else 28
	style.corner_radius_top_left = 28 if left else 0
	style.corner_radius_bottom_left = 28 if left else 0
	style.content_margin_left = 52
	style.content_margin_right = 52
	style.content_margin_top = 48
	style.content_margin_bottom = 48
	return style

static func build(host: Control) -> void:
	var background := ColorRect.new()
	background.color = Color("#f2f6fb")
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	host.add_child(background)
	var scroll := ScrollContainer.new()
	scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	host.add_child(scroll)
	var center := CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	center.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.add_child(center)
	var columns := HBoxContainer.new()
	columns.name = "ApprovedLogin"
	columns.add_theme_constant_override("separation", 0)
	center.add_child(columns)
	var hero := PanelContainer.new()
	hero.custom_minimum_size = Vector2(560,716)
	hero.add_theme_stylebox_override("panel",surface(Color("#103a57"),true))
	columns.add_child(hero)
	var left := VBoxContainer.new()
	left.add_theme_constant_override("separation",24)
	hero.add_child(left)
	var logo := TextureRect.new()
	logo.texture = host.LOGO_TEXTURE
	logo.custom_minimum_size = Vector2(132,132)
	logo.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	logo.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	logo.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	left.add_child(logo)
	left.add_child(UI.text("CENTRAL DE OPERAÇÕES",11,Color("#8ac6ee")))
	left.add_child(UI.text("Sua operação.\nMais perto de você.",40,Color.WHITE))
	left.add_child(UI.text("Equipamentos, estoque e filiais em um só lugar.\nClareza para cada decisão do seu dia.",14,Color("#c0d4e4")))
	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left.add_child(spacer)
	left.add_child(UI.text("Uma central. Todas as suas bases.",13,Color("#d6e6f2")))
	left.add_child(UI.text("Acesso organizado por filial.",13,Color("#d6e6f2")))
	left.add_child(UI.text("DESENVOLVIDO POR  SideraCode",11,Color("#94b7d0")))
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(520,716)
	panel.add_theme_stylebox_override("panel",surface(Color.WHITE,false))
	columns.add_child(panel)
	var form := VBoxContainer.new()
	form.add_theme_constant_override("separation",16)
	panel.add_child(form)
	var base := PanelContainer.new()
	var base_style := Design.surface(Color("#f6f9fd"),Color("#dce7f2"),1,13)
	base_style.content_margin_left = 16
	base_style.content_margin_right = 16
	base_style.content_margin_top = 13
	base_style.content_margin_bottom = 13
	base.add_theme_stylebox_override("panel",base_style)
	form.add_child(base)
	var row := HBoxContainer.new()
	base.add_child(row)
	var captions := VBoxContainer.new()
	captions.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	captions.add_child(UI.text("BASE SELECIONADA",10,Design.MUTED))
	captions.add_child(UI.text("RS " + host._branch_display_name(host.selected_branch_id,host.selected_branch_name),14))
	row.add_child(captions)
	var change := Button.new()
	change.name = "LoginChangeBranch"
	change.text = "Trocar"
	change.flat = true
	change.add_theme_font_size_override("font_size",12)
	for state in ["font_color","font_hover_color","font_pressed_color","font_focus_color"]:
		change.add_theme_color_override(state,Color("#216eaa"))
	change.pressed.connect(host._show_branch_selector)
	change.queue_free()
	form.add_child(UI.text("Bem-vindo de volta",13,Design.MUTED))
	form.add_child(UI.text("Acesse sua central",29))
	form.add_child(UI.text("Informe seu usuário e senha para continuar.",14,Design.MUTED))
	form.add_child(UI.text("Usuário",13))
	host.login_user_input = host._make_login_input("Seu usuário")
	host.login_user_input.text = host._remembered_login()
	host.login_user_input.text_submitted.connect(func(_value): host._attempt_login())
	form.add_child(host.login_user_input)
	form.add_child(UI.text("Senha",13))
	var password := HBoxContainer.new()
	form.add_child(password)
	host.login_password_input = host._make_login_input("Sua senha",true)
	host.login_password_input.custom_minimum_size.x = 0
	host.login_password_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	host.login_password_input.text_submitted.connect(func(_value): host._attempt_login())
	password.add_child(host.login_password_input)
	var reveal := Button.new()
	reveal.name = "LoginReveal"
	reveal.text = "Mostrar"
	reveal.toggle_mode = true
	reveal.add_theme_font_size_override("font_size",12)
	for state in ["normal","hover","pressed","hover_pressed","focus"]:
		reveal.add_theme_stylebox_override(state,Design.surface(Color("#f6f9fd"),Color("#dce7f2"),1,9))
	for state in ["font_color","font_hover_color","font_pressed_color","font_hover_pressed_color","font_focus_color"]:
		reveal.add_theme_color_override(state,Color("#216eaa"))
	reveal.custom_minimum_size = Vector2(68,52)
	reveal.toggled.connect(func(shown):
		host.login_password_input.secret = not shown
		reveal.text = "Ocultar" if shown else "Mostrar"
	)
	password.add_child(reveal)
	host.remember_user_check = CheckBox.new()
	host.remember_user_check.text = "Manter conectado neste computador"
	host.remember_user_check.button_pressed = true
	host.remember_user_check.add_theme_font_size_override("font_size",13)
	for state in ["font_color","font_hover_color","font_pressed_color","font_hover_pressed_color","font_focus_color"]:
		host.remember_user_check.add_theme_color_override(state,Design.MUTED)
	form.add_child(host.remember_user_check)
	var enter: Button = host._make_login_button("Entrar no sistema  →",Color("#ff8a19"),Design.TEXT,host._attempt_login)
	enter.name = "LoginSubmit"
	form.add_child(enter)
	host.login_error_label = UI.text("",13,Color("#b52d3a"))
	host.login_error_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	form.add_child(host.login_error_label)
	form.add_child(UI.text("Acesso restrito a usuários autorizados.",12,Design.MUTED))

	host.login_user_input.grab_focus()
	preload("res://src/ui/button_motion.gd").install(host)
	for button in host.find_children("*","BaseButton",true,false):
		preload("res://src/ui/button_motion.gd").attach(button)
