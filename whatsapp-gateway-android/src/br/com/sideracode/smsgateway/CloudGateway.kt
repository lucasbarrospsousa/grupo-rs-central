package br.com.sideracode.smsgateway

import android.content.Context
import br.com.sideracode.whatsappgateway.PlatformSession
import org.json.JSONObject

/** Session-authenticated SMS adapter for the single platform selected in the app. */
class CloudGateway(ctx: Context, private val db: JobStore, private val identity: GatewayIdentity) {
    companion object {
        const val VERSION = "1.5.0"
        @Volatile var state = "Conecte-se à plataforma"
        @Volatile var lastOk = 0L
        val branches = listOf("imperatriz", "araguaina", "acailandia", "maraba")
    }

    private val session = PlatformSession(ctx)
    private var branchIndex = 0
    private var currentBranch = ""

    fun tick(ready: Boolean) {
        val platform = session.platform
        if (!session.connected || platform == null) {
            state = "Conecte-se à plataforma"
            return
        }
        try {
            flushReports()
            if (platform == PlatformSession.Platform.CENTRAL) tickCentral(ready) else tickSales(ready)
            lastOk = System.currentTimeMillis()
            state = (if (platform == PlatformSession.Platform.CENTRAL) "Central" else "Vendas SOS") +
                " conectada • " + if (ready) "chip pronto" else "diagnóstico"
        } catch (error: Exception) {
            state = (if (platform == PlatformSession.Platform.CENTRAL) "Central" else "Vendas SOS") +
                " • " + (error.message?.take(90) ?: error.javaClass.simpleName)
        }
    }

    private fun tickCentral(ready: Boolean) {
        val allowed = session.branchIds.filter { it in branches }
        if (allowed.isEmpty()) throw IllegalStateException("A conta não possui filial autorizada.")
        currentBranch = allowed[Math.floorMod(branchIndex++, allowed.size)]
        val action = if (ready) "poll" else "heartbeat"
        val response = session.request(
            "/api/galaxy?branch=$currentBranch",
            JSONObject().put("action", action).put("branch", currentBranch).put("ready", ready).put("app_version", VERSION)
        )
        if (!ready) return
        processCentralJobs(response)
    }

    private fun processCentralJobs(response: JSONObject) {
        val jobs = response.optJSONArray("jobs") ?: return
        for (i in 0 until jobs.length()) {
            val item = jobs.optJSONObject(i) ?: continue
            val id = item.optString("id")
            if (id.isBlank()) continue
            val local = db.get(id)
            if (local == null && item.has("payload")) {
                try {
                    val payload = item.getJSONObject("payload")
                    require(payload.optString("branch") == currentBranch)
                    val accepted = db.accept(payload)
                    if (accepted.optString("state") == "received") db.authorizeCloud(id)
                } catch (_: Exception) {
                    session.request("/api/galaxy?branch=$currentBranch", JSONObject()
                        .put("action", "report").put("branch", currentBranch).put("id", id)
                        .put("state", "failed").put("detail", "Pedido rejeitado pelo Gateway Android"))
                    continue
                }
            } else if (local != null) {
                require(local.optString("branch") == currentBranch) { "Base do pedido divergente" }
                val stateValue = local.optString("state")
                val report = session.request("/api/galaxy?branch=$currentBranch", JSONObject()
                    .put("action", "report").put("branch", currentBranch).put("id", id)
                    .put("state", stateValue).put("detail", local.optString("detail")))
                if (stateValue == "received" && report.optString("state") == "received") db.authorizeCloud(id)
            } else if (item.optString("state") != "pending") {
                session.request("/api/galaxy?branch=$currentBranch", JSONObject()
                    .put("action", "report").put("branch", currentBranch).put("id", id)
                    .put("state", "indeterminate").put("detail", "Registro local ausente; não reenviado"))
            }
        }
    }

    private fun tickSales(ready: Boolean) {
        val response = session.request("/api/mobile-gateway", JSONObject()
            .put("action", if (ready) "gateway-poll" else "gateway-heartbeat").put("ready", ready))
        if (!ready) return
        processSalesReceipts(response.optJSONArray("receipts"))
        if (!ready) return
        val job = response.optJSONObject("job") ?: return
        val id = job.optString("id")
        if (id.isBlank()) return
        if (db.get(id) != null) {
            session.reportSms(id, "imperatriz", "received")
            return
        }
        val now = System.currentTimeMillis() / 1000
        val phoneDigits = job.optString("phone").filter(Char::isDigit)
        val phone = if (phoneDigits.startsWith("55")) "+$phoneDigits" else "+55$phoneDigits"
        val created = job.optLong("created_at", now).coerceAtMost(now + 60)
        val batch = job.optString("batch_id", id).ifBlank { id }
        val payload = JSONObject()
            .put("version", 3).put("id", id).put("branch", "imperatriz").put("serial", "")
            .put("phone", phone).put("command", job.optString("command"))
            .put("created_at", created).put("expires_at", created + 7200)
            .put("status_snapshot", "Confirmado pela plataforma SOS")
            .put("command_mode", "custom").put("source_phone_snapshot", phone)
            .put("apn_snapshot", "").put("standard_command_snapshot", "")
            .put("target_type", "contact").put("contact_name", job.optString("name", "Contato"))
            .put("batch_id", batch).put("delay_seconds", job.optInt("delay_seconds", 10))
        try {
            val accepted = db.accept(payload)
            if (accepted.optString("state") == "received") {
                session.reportSms(id, "imperatriz", "received", "Aceito pelo aparelho")
                db.authorizeCloud(id)
            }
        } catch (_: Exception) {
            session.reportSms(id, "imperatriz", "failed", "Pedido incompatível com o chip selecionado")
        }
    }

    private fun processSalesReceipts(receipts: org.json.JSONArray?) {
        if (receipts == null) return
        for (i in 0 until receipts.length()) {
            val item = receipts.optJSONObject(i) ?: continue
            val id = item.optString("id")
            if (id.isBlank()) continue
            val local = db.get(id)
            if (local == null) {
                if (item.optString("state") == "dispatched") session.reportSms(id, "imperatriz", "indeterminate", "Registro local ausente; não reenviado")
            } else if (local.optString("state") == "received") {
                session.reportSms(id, "imperatriz", "received", "Aceito pelo aparelho")
                db.authorizeCloud(id)
            }
        }
    }

    private fun flushReports() {
        val reports = db.pendingCloudReports()
        for (i in 0 until reports.length()) {
            val item = reports.optJSONObject(i) ?: continue
            val id = item.optString("id")
            val reportState = item.optString("state")
            try {
                session.reportSms(id, item.optString("branch").ifBlank { "imperatriz" }, reportState, item.optString("detail"))
                db.clearCloudReport(id, reportState)
            } catch (_: Exception) {
                // Retain the outcome locally and retry on the next connection cycle.
            }
        }
    }
}
