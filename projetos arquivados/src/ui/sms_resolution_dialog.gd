extends RefCounted
const V=preload("res://src/ui/bulk_sms_view.gd")
const UI=preload("res://src/ui/approved_dashboard.gd")

static func build(prompt:ConfirmationDialog,serial:String,phone:String) -> OptionButton:
 prompt.borderless=true;prompt.transparent=true;prompt.transparent_bg=true
 prompt.dialog_text="";prompt.get_ok_button().hide();prompt.get_cancel_button().hide()
 prompt.add_theme_stylebox_override("panel",StyleBoxEmpty.new())
 var root:=VBoxContainer.new();root.custom_minimum_size=Vector2(680,500);root.add_theme_constant_override("separation",0);prompt.add_child(root)
 var header:=V.Header.new();var hs:=V.surface(Color.TRANSPARENT,20,22);hs.set_border_width_all(0);header.add_theme_stylebox_override("panel",hs);root.add_child(header)
 var top:=HBoxContainer.new();top.add_theme_constant_override("separation",18);header.add_child(top);top.add_child(V.icon("refresh",30,Color.WHITE))
 var titles:=VBoxContainer.new();titles.size_flags_horizontal=Control.SIZE_EXPAND_FILL;top.add_child(titles)
 titles.add_child(UI.text("Resolver falha do lote",23,Color.WHITE))
 titles.add_child(UI.text("Decida como continuar, sem reenviar este pedido.",13,Color("#d9ecff")))
 var close:=V.button("","close",func():prompt.canceled.emit(),Color("#1675bd"),Color.WHITE);close.custom_minimum_size=Vector2(36,36);top.add_child(close)
 var outer:=PanelContainer.new();var style:=V.surface(Color("#f5f9ff"),20,22);style.corner_radius_top_left=0;style.corner_radius_top_right=0;outer.add_theme_stylebox_override("panel",style);root.add_child(outer)
 var body:=VBoxContainer.new();body.add_theme_constant_override("separation",16);outer.add_child(body)
 var identity:=HBoxContainer.new();identity.add_theme_constant_override("separation",12);body.add_child(identity)
 for item in [["Aparelho",serial,"phone"],["Telefone do chip",phone,"mail"]]:
  var card:=V.card(identity,Color.WHITE,14);var row:=HBoxContainer.new();row.add_theme_constant_override("separation",12);card.add_child(row);row.add_child(V.icon(item[2],24))
  var values:=VBoxContainer.new();row.add_child(values);values.add_child(UI.text(item[0],12,V.MUTED));values.add_child(UI.text(item[1],17,V.INK))
 body.add_child(UI.text("Como você resolveu este aparelho?",16,V.INK))
 var reason:=OptionButton.new();reason.name="ResolutionReason";reason.add_item("Já enviei este comando manualmente",0);reason.add_item("Pular este aparelho sem reenviar",1);reason.custom_minimum_size=Vector2(0,46)
 for state in ["normal","hover","pressed","focus"]:reason.add_theme_stylebox_override(state,V.surface(Color.WHITE,10,12))
 for state in ["font_color","font_hover_color","font_pressed_color"]:reason.add_theme_color_override(state,V.INK)
 var popup:=reason.get_popup();popup.add_theme_stylebox_override("panel",V.surface(Color.WHITE,10,10));popup.add_theme_color_override("font_color",V.INK);popup.add_theme_color_override("font_hover_color",V.BLUE)
 V.Buttons.attach(reason);body.add_child(reason)
 var notice:=V.card(body,Color("#fff3e6"),14)
 notice.add_child(UI.text("Este pedido não será reenviado.",16,Color("#995211")))
 notice.add_child(UI.text("O histórico mantém a falha e registra sua decisão.\nIsso não substitui a confirmação de envio do Android.",13,V.INK))
 var timing:=HBoxContainer.new();timing.add_theme_constant_override("separation",12);body.add_child(timing)
 for item in [["clock","Aguardar 60 segundos"],["calendar","Prazo original mantido"]]:
  var row:=HBoxContainer.new();row.size_flags_horizontal=Control.SIZE_EXPAND_FILL;row.add_theme_constant_override("separation",10);timing.add_child(row);row.add_child(V.icon(item[0],20));row.add_child(UI.text(item[1],13,V.MUTED))
 var actions:=HBoxContainer.new();actions.add_theme_constant_override("separation",12);body.add_child(actions)
 var back:=V.button("Voltar","close",func():prompt.canceled.emit());actions.add_child(back)
 var space:=Control.new();space.size_flags_horizontal=Control.SIZE_EXPAND_FILL;actions.add_child(space)
 var confirm:=V.button("Confirmar e continuar","refresh",func():prompt.confirmed.emit(),V.BLUE,Color.WHITE);confirm.name="ConfirmResolution";confirm.custom_minimum_size=Vector2(255,46);actions.add_child(confirm)
 root.size=Vector2(680,530)
 return reason

static func show_animated(prompt:ConfirmationDialog) -> void:
 await prompt.get_tree().process_frame
 prompt.reset_size();prompt.popup_centered(Vector2i(680,530))
 if OS.get_environment("GRUPO_RS_REDUCED_MOTION")!="1":
  var box:Control=prompt.get_child(prompt.get_child_count()-1)
  box.modulate.a=0
  prompt.create_tween().tween_property(box,"modulate:a",1.0,0.22)
