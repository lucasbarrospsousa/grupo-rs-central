extends SceneTree

const Dashboard := preload("res://src/inventory_dashboard.gd")


class FakeStore extends InventoryStore:
	var reloads := 0

	func reload_db_from_disk() -> Dictionary:
		reloads += 1
		return {"products": [{"sku": "024000001"}]}


class TestDashboard extends Dashboard:
	var test_payload := ""

	func _external_database_change_payload() -> String:
		return test_payload


func _init() -> void:
	var dashboard := TestDashboard.new()
	var fake_store := FakeStore.new()
	dashboard.store = fake_store
	dashboard.selected_branch_id = "imperatriz"
	dashboard.current_section = "test"
	dashboard.external_database_change_revision = "revision-1"
	dashboard.test_payload = "revision-1"
	dashboard._poll_external_database_change()
	assert(fake_store.reloads == 0, "Recarregou o SQLite sem mudança de revisão.")
	dashboard.test_payload = "revision-2"
	dashboard._poll_external_database_change()
	assert(fake_store.reloads == 1, "Não recarregou o SQLite após evento externo.")
	dashboard._poll_external_database_change()
	assert(fake_store.reloads == 1, "Repetiu a recarga para a mesma revisão.")
	print("EXTERNAL_DATABASE_CHANGE_MONITOR_OK")
	dashboard.free()
	quit(0)
