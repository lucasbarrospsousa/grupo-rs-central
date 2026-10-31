package br.com.sideracode.whatsappgateway

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.hardware.biometrics.BiometricPrompt
import android.hardware.fingerprint.FingerprintManager
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import android.content.res.ColorStateList
import android.text.InputType
import br.com.sideracode.smsgateway.CloudGateway
import br.com.sideracode.smsgateway.GatewayService
import br.com.sideracode.smsgateway.JobStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/** Single, authenticated dashboard shell for the WhatsApp and SMS gateway services. */
class DashboardActivity : Activity() {
    private val bg = Color.rgb(10, 14, 20)
    private val panel = Color.rgb(17, 23, 32)
    private val panelAlt = Color.rgb(22, 30, 41)
    private val text = Color.rgb(245, 247, 250)
    private val muted = Color.rgb(151, 166, 184)
    private val amber = Color.rgb(255, 157, 10)
    private val blue = Color.rgb(46, 139, 255)
    private val green = Color.rgb(37, 205, 119)
    private val prefs by lazy { getSharedPreferences("dashboard_security", MODE_PRIVATE) }
    private lateinit var root: LinearLayout
    private lateinit var body: LinearLayout
    private var selectedTab = 0
    private var locked = true
    private var lockDialog: AlertDialog? = null
    private var biometricInProgress = false
    private var leftDuringBiometric = false

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        window.statusBarColor = bg
        window.navigationBarColor = bg
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        showLockScreen()
        promptUnlock()
    }

    override fun onStart() {
        super.onStart()
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (prefs.getBoolean("keep_screen_on", false)) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (locked && lockDialog == null) window.decorView.post { promptUnlock() }
    }

    override fun onStop() {
        if (biometricInProgress && !leftDuringBiometric) {
            super.onStop()
            return
        }
        locked = true
        lockDialog?.dismiss()
        lockDialog = null
        if (!isFinishing) showLockScreen()
        super.onStop()
    }

    override fun onUserLeaveHint() {
        if (biometricInProgress) leftDuringBiometric = true
        super.onUserLeaveHint()
    }

    private fun renderShell() {
        root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(bg) }
        val top = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(22), dp(22), dp(22), dp(14))
            background = rounded(panel, 0xFF263445.toInt(), 0, 18)
        }
        top.addView(label("GRUPO RS  ·  CENTRAL", 12, amber, true))
        top.addView(label("Gateway Mobile", 24, text, true).apply { setPadding(0, dp(5), 0, 0) })
        top.addView(label("OPERAÇÃO DE COMUNICAÇÃO", 11, muted, true).apply { setPadding(0, dp(3), 0, 0) })
        root.addView(top, LinearLayout.LayoutParams(-1, -2).apply { setMargins(dp(16), dp(16), dp(16), dp(12)) })

        val scroll = ScrollView(this).apply { isFillViewport = true; clipToPadding = false }
        body = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), 0, dp(16), dp(20)) }
        scroll.addView(body)
        root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))

        val nav = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(dp(6), dp(7), dp(6), dp(8))
            setBackgroundColor(panel)
        }
        listOf("▦\nPainel", "◉\nWhatsApp", "▣\nSMS", "⚙\nGeral").forEachIndexed { index, title ->
            val button = TextView(this).apply {
                text = title
                gravity = Gravity.CENTER
                textSize = 11f
                typeface = Typeface.DEFAULT_BOLD
                setPadding(dp(4), dp(8), dp(4), dp(8))
                setOnClickListener { selectedTab = index; renderTab() }
            }
            nav.addView(button, LinearLayout.LayoutParams(0, -2, 1f))
        }
        root.addView(nav)
        setContentView(root)
        renderTab()
    }

    private fun showLockScreen() {
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(28), dp(28), dp(28))
            setBackgroundColor(bg)
        }
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(28), dp(24), dp(28))
            background = rounded(panel, 0xFF263445.toInt(), dp(1), 18)
        }
        card.addView(label("GRUPO RS  ·  CENTRAL", 13, amber, true).apply { gravity = Gravity.CENTER })
        card.addView(label("Gateway Mobile", 24, text, true).apply { gravity = Gravity.CENTER; setPadding(0, dp(8), 0, dp(8)) })
        card.addView(label("Faça login para abrir o painel.", 14, muted, false).apply { gravity = Gravity.CENTER })
        content.addView(card, LinearLayout.LayoutParams(-1, -2))
        setContentView(content)
    }

    private fun renderTab() {
        body.removeAllViews()
        when (selectedTab) {
            0 -> dashboard()
            1 -> whatsappTab()
            2 -> smsTab()
            else -> settingsTab()
        }
        val nav = root.getChildAt(2) as? LinearLayout ?: return
        for (i in 0 until nav.childCount) {
            val item = nav.getChildAt(i) as TextView
            item.setTextColor(if (i == selectedTab) amber else muted)
            item.background = if (i == selectedTab) rounded(0xFF252117.toInt(), 0, 0, 12) else null
        }
    }

    private fun dashboard() {
        heading("Visão geral", "Status dos gateways e atividade registrada neste aparelho.")
        val sms = smsCounts()
        metric("WhatsApp", if (WhatsAppGatewayService.serviceRunning) "ATIVO" else "PAUSADO", "Acessibilidade: ${if (WhatsAppAccessibilityService.isServiceRunning()) "habilitada" else "pendente"}", amber)
        metric("SMS", if (GatewayService.active) "ATIVO" else "PAUSADO", if (CloudGateway.lastOk > 0) "Central: ${CloudGateway.state}" else "${CloudGateway.state}", blue)
        metric("Disparos WhatsApp", "${waCount("wa_sent") + waCount("wa_failed")}", "${waCount("wa_sent")} confirmados · ${waCount("wa_failed")} falhas", green)
        metric("Disparos SMS", "${sms.values.sum()}", "${sms["sent"] ?: 0} enviados · ${sms["failed"] ?: 0} falhas · ${sms["delivered"] ?: 0} entregues", blue)
        section("Relatório recente")
        infoCard("WhatsApp", "${waCount("wa_sent")} confirmações e ${waCount("wa_failed")} falhas registradas desde a instalação desta versão. O histórico completo permanece na Central.", amber)
        infoCard("SMS", "${sms.values.sum()} pedidos locais registrados. Os dados são resumidos sem exibir telefone, mensagem ou credenciais.", blue)
        infoCard("Execução em segundo plano", "O bloqueio da interface não encerra os serviços. O Android mantém o estado nos avisos persistentes dos gateways.", green)
    }

    private fun whatsappTab() {
        heading("Disparos WhatsApp", "Conexão, acessibilidade e relatório local do gateway.")
        metric("Gateway", if (WhatsAppGatewayService.serviceRunning) "ATIVO" else "INATIVO", "Serviço de comunicação com a Central", amber)
        metric("Acessibilidade", if (WhatsAppAccessibilityService.isServiceRunning()) "CONECTADA" else "PENDENTE", "Necessária para confirmar o envio no WhatsApp Business", blue)
        metric("Resultado registrado", "${waCount("wa_sent")} enviados", "${waCount("wa_failed")} falhas desde a instalação desta versão", green)
        action("▶  Iniciar gateway WhatsApp", amber) { startForegroundService(Intent(this, WhatsAppGatewayService::class.java)); body.postDelayed({ renderTab() }, 400) }
        action("⌁  Configurar acessibilidade", blue) { startActivity(Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        infoCard("Privacidade do relatório", "Este painel mostra apenas totais. Destinatários e conteúdo não são guardados aqui; o histórico de campanhas está na Central.", amber)
    }

    private fun smsTab() {
        heading("Disparos SMS", "Estado do serviço, conexão e resultados locais.")
        val stats = smsCounts()
        metric("Gateway SMS", if (GatewayService.active) "ATIVO" else "PAUSADO", "Proteção de processamento: ${if (GatewayService.cpuProtected) "ativa" else "pausada"}", blue)
        metric("Central", CloudGateway.state, "Última confirmação: ${if (CloudGateway.lastOk > 0) android.text.format.DateFormat.format("dd/MM HH:mm", CloudGateway.lastOk) else "sem conexão registrada"}", amber)
        metric("Histórico local", "${stats.values.sum()} pedidos", "${stats["received"] ?: 0} pendentes · ${stats["sent"] ?: 0} enviados · ${stats["failed"] ?: 0} falhas", green)
        action(if (GatewayService.active) "Ⅱ  Pausar gateway SMS" else "▶  Ativar gateway SMS", blue) {
            if (GatewayService.active) stopService(Intent(this, GatewayService::class.java)) else startForegroundService(Intent(this, GatewayService::class.java))
            body.postDelayed({ renderTab() }, 450)
        }
        action("⚙  Configurar bases, chip e gateway", amber) { startActivity(Intent(this, br.com.sideracode.smsgateway.MainActivity::class.java)) }
        infoCard("Envio em segundo plano", "O gateway SMS é um serviço foreground com proteção de CPU. A tela de login não interrompe a fila. O envio real continua sujeito à permissão, ao chip e à autorização já configurada.", blue)
    }

    private fun settingsTab() {
        heading("Configurações gerais", "Segurança e comportamento da interface.")
        val keep = Switch(this).apply {
            text = "Manter a tela sempre acesa"
            textSize = 15f
            setTextColor(this@DashboardActivity.text)
            isChecked = prefs.getBoolean("keep_screen_on", false)
            thumbTintList = switchThumbTints()
            trackTintList = switchTrackTints()
            setOnCheckedChangeListener { _, checked ->
                prefs.edit().putBoolean("keep_screen_on", checked).apply()
                if (checked) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
        settingCard(keep)
        val bio = Switch(this).apply {
            text = "Entrar com impressão digital"
            textSize = 15f
            setTextColor(this@DashboardActivity.text)
            isEnabled = fingerprintAvailable()
            isChecked = prefs.getBoolean("biometric", false)
            thumbTintList = switchThumbTints()
            trackTintList = switchTrackTints()
            setOnCheckedChangeListener { _, checked ->
                if (!checked) prefs.edit().putBoolean("biometric", false).apply()
                else if (!deviceSecure()) { isChecked = false; Toast.makeText(this@DashboardActivity, "Configure biometria ou bloqueio seguro nas configurações do Android.", Toast.LENGTH_LONG).show() }
                else { isChecked = false; launchBiometric { prefs.edit().putBoolean("biometric", true).apply(); renderTab(); Toast.makeText(this@DashboardActivity, "Impressão digital habilitada.", Toast.LENGTH_SHORT).show() } }
            }
        }
        settingCard(bio)
        action("♙  Alterar PIN de acesso", amber) { changePin() }
        action("▣  Abrir configuração do gateway SMS", blue) { startActivity(Intent(this, br.com.sideracode.smsgateway.MainActivity::class.java)) }
        infoCard("Bloqueio do app", "Ao sair do aplicativo, a tela exige autenticação novamente. Os serviços de envio continuam independentes e podem operar com a tela apagada ou com o app bloqueado.", green)
        infoCard("Segurança", "O PIN fica protegido e a impressão digital é verificada pelo Android. O app não armazena sua biometria.", amber)
        if (!fingerprintAvailable()) infoCard("Impressão digital indisponível", "Cadastre uma impressão digital nas configurações do Android para habilitar essa forma de acesso.", muted)
    }

    private fun heading(title: String, subtitle: String) {
        body.addView(label(title, 22, text, true).apply { setPadding(dp(2), dp(4), dp(2), dp(4)) })
        body.addView(label(subtitle, 13, muted, false).apply { setPadding(dp(2), 0, dp(2), dp(14)) })
    }

    private fun section(title: String) = body.addView(label(title, 15, muted, true).apply { setPadding(dp(2), dp(12), dp(2), dp(8)) })

    private fun metric(title: String, value: String, detail: String, accent: Int) {
        val card = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(14), dp(16), dp(14)); background = rounded(panel, 0xFF263445.toInt(), dp(1), 16) }
        card.addView(label(title.uppercase(), 11, muted, true))
        card.addView(label(value, 20, accent, true).apply { setPadding(0, dp(5), 0, dp(2)) })
        card.addView(label(detail, 12, muted, false))
        body.addView(card, LinearLayout.LayoutParams(-1, -2).apply { setMargins(0, 0, 0, dp(10)) })
    }

    private fun infoCard(title: String, message: String, accent: Int) {
        val card = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(15), dp(13), dp(15), dp(13)); background = rounded(panelAlt, accent, dp(1), 14) }
        card.addView(label(title, 14, accent, true))
        card.addView(label(message, 13, text, false).apply { setPadding(0, dp(6), 0, 0) })
        body.addView(card, LinearLayout.LayoutParams(-1, -2).apply { setMargins(0, 0, 0, dp(10)) })
    }

    private fun settingCard(control: View) {
        val holder = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL; setPadding(dp(14), dp(6), dp(10), dp(6)); background = rounded(panel, 0xFF263445.toInt(), dp(1), 14); addView(control, LinearLayout.LayoutParams(-1, -2)) }
        body.addView(holder, LinearLayout.LayoutParams(-1, -2).apply { setMargins(0, 0, 0, dp(10)) })
    }

    private fun action(title: String, accent: Int, callback: () -> Unit) {
        val button = Button(this).apply {
            text = title; isAllCaps = false; textSize = 14f; setTextColor(this@DashboardActivity.text)
            background = rounded(panelAlt, accent, dp(1), 13)
            setOnClickListener { callback() }
        }
        body.addView(button, LinearLayout.LayoutParams(-1, dp(54)).apply { setMargins(0, 0, 0, dp(9)) })
    }

    private fun smsCounts(): Map<String, Int> = try {
        JobStore(this).use { store ->
            val counts = mutableMapOf<String, Int>()
            store.readableDatabase.rawQuery("SELECT state, COUNT(*) FROM jobs GROUP BY state", null).use { cursor ->
                while (cursor.moveToNext()) counts[cursor.getString(0)] = cursor.getInt(1)
            }
            counts
        }
    } catch (_: Exception) { emptyMap() }

    private fun waCount(key: String) = getSharedPreferences("wa_reports", MODE_PRIVATE).getInt(key, 0)

    private fun promptUnlock() {
        if (isFinishing || !locked || lockDialog != null) return
        if (!prefs.contains("pin_hash")) { setupPin(); return }
        val input = EditText(this).apply { hint = "PIN de acesso"; inputType = securePinInputType(); setTextColor(this@DashboardActivity.text); setHintTextColor(this@DashboardActivity.muted) }
        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(24), dp(8), dp(24), 0); addView(input) }
        val builder = AlertDialog.Builder(this).setTitle("Acesso protegido").setMessage("Informe seu PIN para abrir o painel.").setView(content)
            .setPositiveButton("Entrar", null).setNegativeButton("Sair") { _, _ -> finish() }
        if (prefs.getBoolean("biometric", false) && Build.VERSION.SDK_INT >= 28) builder.setNeutralButton("Impressão digital", null)
        lockDialog = builder.create().also { dialog ->
            dialog.setCancelable(false); dialog.setCanceledOnTouchOutside(false)
            dialog.setOnShowListener {
                styleDialog(dialog)
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                    if (verifyPin(input.text.toString())) { locked = false; lockDialog = null; dialog.dismiss(); renderShell() }
                    else { input.text?.clear(); input.error = "PIN incorreto" }
                }
                dialog.getButton(AlertDialog.BUTTON_NEUTRAL)?.setOnClickListener { launchBiometric { locked = false; lockDialog = null; dialog.dismiss(); renderShell() } }
            }
            dialog.show()
        }
    }

    private fun setupPin() {
        val pin = EditText(this).apply { hint = "Crie um PIN numérico (6 a 12 dígitos)"; inputType = securePinInputType(); setTextColor(this@DashboardActivity.text); setHintTextColor(this@DashboardActivity.muted) }
        val confirm = EditText(this).apply { hint = "Confirme o PIN"; inputType = securePinInputType(); setTextColor(this@DashboardActivity.text); setHintTextColor(this@DashboardActivity.muted) }
        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(24), 0, dp(24), 0); addView(pin); addView(confirm) }
        val dialog = AlertDialog.Builder(this).setTitle("Proteja o aplicativo").setMessage("Crie um PIN para acessar os dados do gateway.").setView(content)
            .setPositiveButton("Salvar", null).setCancelable(false).create()
        dialog.setOnShowListener { styleDialog(dialog); dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            val p = pin.text.toString(); if (!p.matches(Regex("[0-9]{6,12}")) || p != confirm.text.toString()) { confirm.error = "PIN inválido ou diferente"; return@setOnClickListener }
            savePin(p); locked = false; lockDialog = null; dialog.dismiss(); renderShell()
        } }
        lockDialog = dialog
        dialog.show()
    }

    private fun changePin() {
        val old = EditText(this).apply { hint = "PIN atual"; inputType = securePinInputType(); setTextColor(this@DashboardActivity.text) }
        val next = EditText(this).apply { hint = "Novo PIN (6 a 12 dígitos)"; inputType = securePinInputType(); setTextColor(this@DashboardActivity.text) }
        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(24), 0, dp(24), 0); addView(old); addView(next) }
        val dialog = AlertDialog.Builder(this).setTitle("Alterar PIN").setView(content).setPositiveButton("Salvar", null).setNegativeButton("Cancelar", null).create()
        dialog.setOnShowListener { styleDialog(dialog); dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            val p = next.text.toString(); if (!verifyPin(old.text.toString())) { old.error = "PIN incorreto"; return@setOnClickListener }
            if (!p.matches(Regex("[0-9]{6,12}"))) { next.error = "Use de 6 a 12 dígitos"; return@setOnClickListener }
            savePin(p); dialog.dismiss(); Toast.makeText(this, "PIN atualizado.", Toast.LENGTH_SHORT).show()
        } }
        dialog.show()
    }

    private fun savePin(pin: String) {
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val hash = pinHash(pin, salt)
        prefs.edit().putString("pin_salt", salt.joinToString("") { "%02x".format(it) }).putString("pin_hash", hash).apply()
    }

    private fun securePinInputType() = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD

    private fun styleDialog(dialog: AlertDialog) {
        dialog.window?.setBackgroundDrawable(rounded(panel, amber, dp(1), 18))
        dialog.getButton(AlertDialog.BUTTON_POSITIVE)?.setTextColor(amber)
        dialog.getButton(AlertDialog.BUTTON_NEUTRAL)?.setTextColor(amber)
        dialog.getButton(AlertDialog.BUTTON_NEGATIVE)?.setTextColor(muted)
    }

    private fun verifyPin(pin: String): Boolean = try {
        val salt = prefs.getString("pin_salt", "")!!.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        MessageDigest.isEqual(pinHash(pin, salt).toByteArray(), prefs.getString("pin_hash", "")!!.toByteArray())
    } catch (_: Exception) { false }

    private fun pinHash(pin: String, salt: ByteArray): String {
        val spec = PBEKeySpec(pin.toCharArray(), salt, 160_000, 256)
        val bytes = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        spec.clearPassword()
        return bytes.joinToString("") { "%02x".format(it) }
    }

    private fun deviceSecure() = (getSystemService(android.app.KeyguardManager::class.java)?.isDeviceSecure == true)

    private fun fingerprintAvailable(): Boolean = try {
        if (Build.VERSION.SDK_INT < 28 || !deviceSecure()) false
        else getSystemService(FingerprintManager::class.java)?.let { it.isHardwareDetected && it.hasEnrolledFingerprints() } == true
    } catch (_: SecurityException) { false }

    private fun switchThumbTints() = ColorStateList(
        arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()),
        intArrayOf(amber, muted)
    )

    private fun switchTrackTints() = ColorStateList(
        arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()),
        intArrayOf(0xFFFF9D0A.toInt(), 0xFF526071.toInt())
    )

    private fun launchBiometric(onSuccess: () -> Unit) {
        if (Build.VERSION.SDK_INT < 28 || !deviceSecure()) { Toast.makeText(this, "Cadastre uma biometria e um bloqueio seguro no Android.", Toast.LENGTH_LONG).show(); return }
        try {
            val prompt = BiometricPrompt.Builder(this).setTitle("Acesso ao Gateway Mobile")
                .setSubtitle("Confirme sua impressão digital")
                .setNegativeButton("Cancelar", mainExecutor) { _, _ -> }
                .build()
            biometricInProgress = true
            leftDuringBiometric = false
            prompt.authenticate(CancellationSignal(), mainExecutor, object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { runOnUiThread {
                    biometricInProgress = false
                    if (leftDuringBiometric) { locked = true; return@runOnUiThread }
                    onSuccess()
                } }
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) { runOnUiThread {
                    biometricInProgress = false
                    if (leftDuringBiometric) locked = true
                    else Toast.makeText(this@DashboardActivity, errString, Toast.LENGTH_SHORT).show()
                } }
            })
        } catch (_: Exception) { biometricInProgress = false; Toast.makeText(this, "Biometria indisponível; use o PIN.", Toast.LENGTH_LONG).show() }
    }

    private fun label(value: String, size: Int, color: Int, bold: Boolean): TextView = TextView(this).apply {
        text = value; textSize = size.toFloat(); setTextColor(color); if (bold) setTypeface(typeface, Typeface.BOLD)
    }

    private fun rounded(color: Int, stroke: Int, strokeWidth: Int, radius: Int) = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(radius).toFloat(); if (strokeWidth > 0) setStroke(dp(strokeWidth), stroke)
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
}
