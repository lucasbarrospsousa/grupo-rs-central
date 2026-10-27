extends SceneTree
# Only reads authorized existing profiles. No HTTP, database or serial commands.
func _init()->void:
	var args:=OS.get_cmdline_user_args()
	if args.size()!=2: quit(2); return
	var service=load("res://src/services/provisioning_service.gd").new()
	var stored:Dictionary=service._read_settings()
	var profiles:Dictionary={}
	for branch in ["imperatriz","araguaina","acailandia","maraba"]:
		var profile:Dictionary=service.load_profile(branch,stored)
		if not profile.get("enabled",false): quit(3); return
		profile["central_db_path"]=""
		profile["central_backend"]="online"
		profiles[branch]=profile
	var token:=FileAccess.get_file_as_string(args[1]).strip_edges()
	if token.length()!=64 or not token.is_valid_hex_number(false): quit(4); return
	var dest:=args[0]
	DirAccess.make_dir_recursive_absolute(dest)
	var key:=Crypto.new().generate_random_bytes(32).hex_encode()
	var file:=FileAccess.open_encrypted_with_pass(dest.path_join("profile.vault"),FileAccess.WRITE,key)
	if file==null: quit(5); return
	file.store_string(JSON.stringify({"format":1,"central_target":"drive","integrations":{"active_branch":stored.get("active_branch","imperatriz"),"profiles":profiles},"central_drive_token":token}))
	file.close()
	file=FileAccess.open(dest.path_join("profile.key"),FileAccess.WRITE)
	if file==null: quit(6); return
	file.store_string(key);file.close();service.free()
	print("DRIVE_PROFILE_OK")
	quit(0)
