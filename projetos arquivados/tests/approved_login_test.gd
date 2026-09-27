extends SceneTree
class Shell extends "res://tests/fixtures/offline_main_dashboard.gd":
	var attempts := 0
	func _remembered_login() -> String: return "operador.exemplo"
	func _attempt_login() -> void: attempts += 1
func _initialize() -> void: call_deferred("run")
func run() -> void:
	root.size = Vector2i(1920,1080)
	root.content_scale_size = root.size
	var shell := Shell.new()
	root.add_child(shell)
	shell._show_login_screen()
	await create_timer(0.3).timeout
	assert(shell.find_child("ApprovedLogin",true,false) != null)
	assert(shell.login_user_input.text == "operador.exemplo")
	assert(shell.login_password_input.secret)
	shell.find_child("LoginReveal",true,false).button_pressed = true
	assert(not shell.login_password_input.secret)
	shell.find_child("LoginReveal",true,false).button_pressed = false
	shell.find_child("LoginSubmit",true,false).pressed.emit()
	assert(shell.attempts == 1)
	shell.login_password_input.text_submitted.emit("exemplo")
	assert(shell.attempts == 2)
	RenderingServer.force_draw()
	root.get_texture().get_image().save_png(OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("login.png"))
	shell.queue_free()
	await process_frame
	print("LOGIN_OK: approved view, remembered user, reveal, button and Enter callbacks; no real authentication")
	quit()
