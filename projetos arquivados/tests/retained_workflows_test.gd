## Regression coverage for reviewed pre-existing changes. No operational data.
extends SceneTree
const Dashboard := preload("res://src/inventory_dashboard.gd")
const Store := preload("res://src/inventory_store.gd")
var failures: Array[String] = []

class RetryHost extends Dashboard:
	var calls := 0
	var status := 503
	func _ready() -> void: pass
	func _http_get_text_with_headers(_url: String, _headers: PackedStringArray, _timeout_seconds: float = 15.0) -> Dictionary:
		calls += 1
		return {"ok": false, "response_code": status}

func _init() -> void:
	call_deferred("_run")

func _run() -> void:
	var host := Dashboard.new()
	_check(host._extract_grupo_rs_user_phone_from_html('<input name="CPF" value="00000000000">') == "", "CPF accepted as phone")
	_check(host._extract_grupo_rs_user_phone_from_html('<input name="Telefone" value="(99) 90000-0000">') == "(99) 90000-0000", "Phone field not parsed")
	var retry_host := RetryHost.new()
	root.add_child(retry_host)
	await retry_host._arya_inventory_get_with_retry("https://invalid.example/test")
	_check(retry_host.calls == 3, "Transient retry must be bounded to three attempts")
	retry_host.calls = 0
	retry_host.status = 401
	await retry_host._arya_inventory_get_with_retry("https://invalid.example/test")
	_check(retry_host.calls == 1, "Authentication failure must not be retried here")
	retry_host.free()
	var serials: Array[String] = []
	for i in range(21): serials.append("024000%03d" % i)
	var parsed: Dictionary = host._parse_bulk_registration_text("\n".join(serials))
	_check((parsed.get("rows", []) as Array).size() == 21, "Bulk parser count")
	_check((parsed.get("errors", []) as Array).is_empty(), "Bulk parser rejected optional plates")
	for row in parsed.get("rows", []):
		_check(str(row.get("plate", "")) == "", "Bulk parser invented a plate")
	var mixed: Dictionary = host._analyze_bulk_input("XRS - 999\t024000002\n024000001\n024000001")
	_check((mixed.get("clean_rows", []) as Array).size() == 2 and int(mixed.get("duplicate_count", 0)) == 1, "Bulk deduplication")
	for value in ["Claro", "CLARO", " claro ", "TIM", "Tim", "Vivo", "VIVO", "Sem operadora"]:
		_check(host._dashboard_operator_is_primary(value), "Operator chart duplicates")
	var payload := {
		"title": "Relatório fictício de teste", "branch": "Filial de teste", "status": "Estoque", "generated_at": "15/09/2026 10:00",
		"options": {"summary": true, "models": true, "operators": true, "list": true},
		"products": [{"serial": "099999001", "plate": "TST-001", "model": "Modelo teste", "operator": "Claro", "status": "Estoque", "updated": "15/09/2026"}, {"serial": "099999002", "plate": "TST-002", "model": "Modelo teste", "operator": "Vivo", "status": "Estoque", "updated": "15/09/2026"}]
	}
	for format_key in ["pdf", "xlsx"]:
		var output := OS.get_environment("GRUPO_RS_TEST_OUTPUT").path_join("synthetic-report." + format_key)
		var result: Dictionary = host._run_inventory_report_generator(payload, format_key, output)
		_check(bool(result.get("ok", false)) and FileAccess.file_exists(output), "Report export failed: " + format_key + " " + str(result))
	host.free()
	if failures.is_empty():
		print("RETAINED_WORKFLOWS_TEST: OK | bulk optional plates, deduplication, operator charts, PDF and XLSX exports")
		quit(0)
	else:
		for failure in failures: push_error(failure)
		quit(1)

func _check(condition: bool, message: String) -> void:
	if not condition: failures.append(message)
