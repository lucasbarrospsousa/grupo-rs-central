package br.com.sideracode.whatsappgateway

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Holds one platform login in Android Keystore-backed storage. Passwords are never retained. */
class PlatformSession(context: Context) {
    enum class Platform(val label: String, val baseUrl: String, val loginPath: String) {
        CENTRAL("GRUPO RS CENTRAL", "https://central-paralela.sinderacodofc.workers.dev", "/api/login"),
        VENDAS("VENDAS SOS", "https://sos-vendas.sinderacodofc.workers.dev", "/api/auth/login")
    }

    data class LoginResult(val username: String, val permissions: JSONObject, val branches: org.json.JSONArray)

    private val app = context.applicationContext
    private val prefs = app.getSharedPreferences("platform_session", Context.MODE_PRIVATE)
    private val alias = "rs-platform-session-v1"

    val platform: Platform?
        get() = runCatching { Platform.valueOf(prefs.getString("platform", "") ?: "") }.getOrNull()
    val username: String get() = prefs.getString("username", "") ?: ""
    val connected: Boolean get() = platform != null && prefs.contains("session_blob")
    val branchIds: List<String>
        get() = runCatching {
            val session = decrypt(prefs.getString("session_blob", "") ?: "")
            val branches = session.optJSONArray("branches") ?: org.json.JSONArray()
            (0 until branches.length()).mapNotNull { branches.optJSONObject(it)?.optString("id")?.takeIf(String::isNotBlank) }
        }.getOrDefault(emptyList())

    @Synchronized
    fun login(target: Platform, username: String, password: String): LoginResult {
        require(username.isNotBlank() && password.isNotEmpty()) { "Informe o usuário e a senha da plataforma." }
        val login = request(target, target.loginPath, JSONObject().put("username", username.trim()).put("password", password), null, null)
        val cookie = login.first ?: throw IllegalStateException("A plataforma não confirmou a sessão segura.")
        val loginBody = login.second
        val csrf = loginBody.optString("csrf", "")
        var canonical = loginBody.optString("username", username.trim())
        var permissions = loginBody.optJSONObject("permissions") ?: JSONObject()
        var branches = loginBody.optJSONArray("branches") ?: org.json.JSONArray()

        // SOS login returns its secure cookie; fetch the canonical session profile after login.
        if (target == Platform.VENDAS) {
            val profile = request(target, "/api/auth/me", null, cookie, null)
            val user = profile.second.optJSONObject("user") ?: throw IllegalStateException("A plataforma não retornou o perfil autenticado.")
            canonical = user.optString("username", canonical)
            permissions = JSONObject()
                .put("owner", user.optBoolean("owner"))
                .put("writes", user.optJSONArray("writes") ?: org.json.JSONArray())
            branches = user.optJSONArray("branches") ?: org.json.JSONArray()
        }

        val writes = permissions.optJSONArray("writes")
        val owner = permissions.optBoolean("owner")
        val smsScopes = if (target == Platform.VENDAS) setOf("disparos") else setOf("sms")
        val whatsappScopes = if (target == Platform.VENDAS) setOf("disparos") else setOf("bulk", "link")
        val hasSmsAccess = owner || writes?.let { values -> (0 until values.length()).any { values.optString(it) in smsScopes } } == true
        val hasWhatsAppAccess = owner || writes?.let { values -> (0 until values.length()).any { values.optString(it) in whatsappScopes } } == true
        if (!hasSmsAccess || !hasWhatsAppAccess) throw IllegalStateException("A conta precisa de permissão para SMS e WhatsApp.")

        val session = JSONObject()
            .put("cookie", cookie)
            .put("csrf", csrf)
            .put("username", canonical)
            .put("branches", branches)
            .put("permissions", permissions)
        prefs.edit()
            .putString("platform", target.name)
            .putString("username", canonical)
            .putString("session_blob", encrypt(session.toString()))
            .commit()
        return LoginResult(canonical, permissions, branches)
    }

    fun request(path: String, body: JSONObject? = null): JSONObject {
        val target = platform ?: throw IllegalStateException("Selecione uma plataforma antes de conectar.")
        val session = decrypt(prefs.getString("session_blob", "") ?: "")
        val pair = request(target, path, body, session.optString("cookie"), session.optString("csrf"))
        return pair.second
    }

    fun reportSms(id: String, branch: String, state: String, detail: String = "") {
        val target = platform ?: throw IllegalStateException("Plataforma não conectada.")
        val body = if (target == Platform.CENTRAL) {
            JSONObject().put("action", "report").put("branch", branch).put("id", id).put("state", state).put("detail", detail.take(240))
        } else {
            JSONObject().put("action", "gateway-report").put("id", id).put("status", state).put("confirmed", state == "sent" || state == "delivered").put("detail", detail.take(240))
        }
        val path = if (target == Platform.CENTRAL) "/api/galaxy?branch=$branch" else "/api/mobile-gateway"
        request(path, body)
    }

    @Synchronized
    fun clear() {
        prefs.edit().clear().commit()
    }

    @Synchronized
    fun disconnect() {
        val target = platform
        val oldSession = runCatching { decrypt(prefs.getString("session_blob", "") ?: "") }.getOrNull()
        clear()
        if (target != null && oldSession != null) Thread {
            runCatching {
                val logoutPath = if (target == Platform.VENDAS) "/api/auth/logout" else "/api/logout"
                request(target, logoutPath, JSONObject(), oldSession.optString("cookie"), oldSession.optString("csrf"))
            }
        }.start()
    }

    private fun request(
        target: Platform,
        path: String,
        body: JSONObject?,
        cookie: String?,
        csrf: String?
    ): Pair<String?, JSONObject> {
        val connection = URL(target.baseUrl + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = if (body == null) "GET" else "POST"
            connection.connectTimeout = 10_000
            connection.readTimeout = 15_000
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Origin", target.baseUrl)
            if (!cookie.isNullOrBlank()) connection.setRequestProperty("Cookie", cookie)
            if (!csrf.isNullOrBlank()) connection.setRequestProperty("x-csrf-token", csrf)
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val responseText = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: "{}"
            val response = runCatching { JSONObject(responseText) }.getOrElse { JSONObject() }
            if (status !in 200..299 || (response.has("ok") && !response.optBoolean("ok")) ||
                (response.has("authenticated") && !response.optBoolean("authenticated"))) {
                val message = if (status == 401) "Usuário ou senha inválidos." else "A plataforma recusou a conexão (HTTP $status)."
                throw IllegalStateException(message)
            }
            val setCookies = connection.headerFields.entries
                .filter { it.key.equals("Set-Cookie", ignoreCase = true) }
                .flatMap { it.value.orEmpty() }
                .mapNotNull { value -> value.substringBefore(';').trim().takeIf { it.contains('=') } }
            val mergedCookies = linkedMapOf<String, String>()
            cookie.orEmpty().split(';').map(String::trim).filter { it.contains('=') }.forEach { pair ->
                mergedCookies[pair.substringBefore('=').trim()] = pair
            }
            setCookies.forEach { pair -> mergedCookies[pair.substringBefore('=').trim()] = pair }
            return mergedCookies.values.takeIf { it.isNotEmpty() }?.joinToString("; ") to response
        } finally {
            connection.disconnect()
        }
    }

    private fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP)
    }

    private fun decrypt(encoded: String): JSONObject {
        require(encoded.isNotBlank()) { "Conecte novamente à plataforma." }
        val packed = Base64.decode(encoded, Base64.NO_WRAP)
        require(packed.size > 12) { "Sessão inválida; conecte novamente." }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, packed.copyOfRange(0, 12)))
        return JSONObject(String(cipher.doFinal(packed.copyOfRange(12, packed.size)), Charsets.UTF_8))
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (!store.containsAlias(alias)) {
            val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            generator.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build())
            generator.generateKey()
        }
        return store.getKey(alias, null) as SecretKey
    }
}
