package br.com.sideracode.whatsappgateway

import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.hardware.biometrics.BiometricPrompt
import android.hardware.fingerprint.FingerprintManager
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.net.Uri
import android.telephony.SubscriptionManager
import java.net.NetworkInterface
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
import br.com.sideracode.smsgateway.GatewayIdentity
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
    private lateinit var smsIdentity: GatewayIdentity
    private var smsStatus: TextView? = null
    private val statusHandler = Handler(Looper.getMainLooper())

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        smsIdentity = GatewayIdentity(this)
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
        statusHandler.removeCallbacks(refreshSmsStatus)
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
        listOf("Painel", "WhatsApp", "SMS", "Geral").forEachIndexed { index, title ->
            val item = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(dp(4), dp(7), dp(4), dp(7))
                isClickable = true
                isFocusable = true
                setOnClickListener { selectedTab = index; renderTab() }
            }
            if (index == 1 || index == 2) {
                val icon = android.widget.ImageView(this).apply {
                    setImageResource(if (index == 1) R.drawable.nav_whatsapp_app else R.drawable.nav_sms_app)
                    scaleType = android.widget.ImageView.ScaleType.FIT_CENTER
                    contentDescription = if (index == 1) "Ícone WhatsApp" else "Ícone SMS"
                }
                item.addView(icon, LinearLayout.LayoutParams(dp(25), dp(25)))
            } else {
                item.addView(NavGlyph(this, if (index == 0) "dashboard" else "settings", muted), LinearLayout.LayoutParams(dp(23), dp(23)))
            }
            item.addView(label(title, 11, muted, true).apply { gravity = Gravity.CENTER; setPadding(0, dp(3), 0, 0) })
            nav.addView(item, LinearLayout.LayoutParams(0, -2, 1f))
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
        statusHandler.removeCallbacks(refreshSmsStatus)
        when (selectedTab) {
            0 -> dashboard()
            1 -> whatsappTab()
            2 -> smsTab()
            else -> settingsTab()
        }
        val nav = root.getChildAt(2) as? LinearLayout ?: return
        for (i in 0 until nav.childCount) {
            val item = nav.getChildAt(i) as LinearLayout
            val appAccent = when (i) { 1 -> green; 2 -> blue; else -> amber }
            val selectedBg = when (i) { 1 -> 0xFF0D3022.toInt(); 2 -> 0xFF11243A.toInt(); else -> 0xFF252117.toInt() }
            item.background = if (i == selectedTab) rounded(selectedBg, appAccent, dp(1), 12) else null
            (item.getChildAt(0) as? NavGlyph)?.setTint(if (i == selectedTab) appAccent else muted)
            (item.getChildAt(1) as? TextView)?.setTextColor(if (i == selectedTab) text else muted)
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
        action("Iniciar gateway WhatsApp", amber) { startForegroundService(Intent(this, WhatsAppGatewayService::class.java)); body.postDelayed({ renderTab() }, 400) }
        action("Configurar acessibilidade", blue) { startActivity(Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        infoCard("Privacidade do relatório", "Este painel mostra apenas totais. Destinatários e conteúdo não são guardados aqui; o histórico de campanhas está na Central.", amber)
    }

    private fun smsTab() {
        heading("Disparos SMS", "Estado do serviço, conexão e resultados locais.")
        val stats = smsCounts()
        metric("Gateway SMS", if (GatewayService.active) "ATIVO" else "PAUSADO", "Proteção de processamento: ${if (GatewayService.cpuProtected) "ativa" else "pausada"}", blue)
        metric("Central", CloudGateway.state, "Última confirmação: ${if (CloudGateway.lastOk > 0) android.text.format.DateFormat.format("dd/MM HH:mm", CloudGateway.lastOk) else "sem conexão registrada"}", amber)
        metric("Histórico local", "${stats.values.sum()} pedidos", "${stats["received"] ?: 0} pendentes · ${stats["sent"] ?: 0} enviados · ${stats["failed"] ?: 0} falhas", green)
        action(if (GatewayService.active) "Pausar gateway SMS" else "Ativar gateway SMS", blue) {
            if (GatewayService.active) stopService(Intent(this, GatewayService::class.java)) else startForegroundService(Intent(this, GatewayService::class.java))
            body.postDelayed({ renderTab() }, 450)
        }
        infoCard("Envio em segundo plano", "O gateway SMS é um serviço foreground com proteção de CPU. A tela de login não interrompe a fila. O envio real continua sujeito à permissão, ao chip e à autorização já configurada.", blue)
    }

    private fun settingsTab() {
        heading("Configurações gerais", "Segurança, interface e configuração do gateway SMS.")
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
        action("Alterar PIN de acesso", amber) { changePin() }
        infoCard("Bloqueio do app", "Ao sair do aplicativo, a tela exige autenticação novamente. Os serviços de envio continuam independentes e podem operar com a tela apagada ou com o app bloqueado.", green)
        infoCard("Segurança", "O PIN fica protegido e a impressão digital é verificada pelo Android. O app não armazena sua biometria.", amber)
        if (!fingerprintAvailable()) infoCard("Impressão digital indisponível", "Cadastre uma impressão digital nas configurações do Android para habilitar essa forma de acesso.", muted)

        section("Gateway SMS")
        infoCard("Certificado do aparelho", "SHA-256 ${smsIdentity.fingerprint()}", blue)
        smsStatus = label("", 13, muted, false).apply { setPadding(dp(2), 0, dp(2), dp(12)) }
        body.addView(smsStatus)
        action("Autorizar permissões", blue) { authorizeSmsPermissions() }
        action("Configurar base da Central", blue) { configureSmsBase() }
        action("Selecionar chip", blue) { chooseSmsSim() }
        action(if (GatewayService.active) "Pausar gateway" else "Ativar gateway", amber) { toggleSmsGateway() }
        action("Permitir funcionamento com tela apagada", amber) { allowSmsInBackground() }
        action("Gerar código de pareamento", blue) { showSmsPairCode() }
        action("Revogar pareamento", 0xFFFF6B6B.toInt()) { revokeSmsPairing() }
        val realSms = Switch(this).apply {
            text = "Permitir envio real de SMS"
            textSize = 15f
            setTextColor(this@DashboardActivity.text)
            isChecked = smsIdentity.prefs.getBoolean("send_enabled", false)
            thumbTintList = switchThumbTints()
            trackTintList = switchTrackTints()
            setOnCheckedChangeListener { _, checked -> setRealSmsEnabled(this, checked) }
        }
        settingCard(realSms)
        statusHandler.removeCallbacks(refreshSmsStatus)
        statusHandler.post(refreshSmsStatus)
    }

    private fun authorizeSmsPermissions() {
        val requested = mutableListOf(android.Manifest.permission.SEND_SMS, android.Manifest.permission.READ_PHONE_STATE)
        if (Build.VERSION.SDK_INT >= 33) requested.add(android.Manifest.permission.POST_NOTIFICATIONS)
        requestPermissions(requested.toTypedArray(), SMS_PERMISSION_REQUEST)
    }

    private fun configureSmsBase() {
        AlertDialog.Builder(this).setTitle("Base da Central")
            .setItems(CloudGateway.branches.map { it.replaceFirstChar(Char::uppercase) }.toTypedArray()) { _, index ->
                val branch = CloudGateway.branches[index]
                val token = EditText(this).apply {
                    hint = "Token privado desta base"
                    inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                    setTextColor(this@DashboardActivity.text)
                    setHintTextColor(this@DashboardActivity.muted)
                }
                val content = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(dp(24), dp(8), dp(24), 0)
                    addView(token)
                }
                val dialog = AlertDialog.Builder(this).setTitle("Conectar ${branch.replaceFirstChar(Char::uppercase)}")
                    .setMessage("Na Central, selecione esta filial e prepare a conexão Galaxy. Cole o token privado. As outras bases permanecem configuradas.")
                    .setView(content).setPositiveButton("Salvar", null).setNegativeButton("Cancelar", null).create()
                dialog.setOnShowListener {
                    styleDialog(dialog)
                    dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                        try {
                            stopService(Intent(this, GatewayService::class.java))
                            CloudGateway.configure(smsIdentity, branch, token.text.toString().trim())
                            dialog.dismiss()
                            refreshSmsStatus.run()
                            Toast.makeText(this, "Base configurada. Confira o chip antes de habilitar envios.", Toast.LENGTH_LONG).show()
                        } catch (_: Exception) {
                            token.error = "Token inválido; confira se tem 64 caracteres hexadecimais."
                        }
                    }
                }
                dialog.show()
            }.show().also(::styleDialog)
    }

    private fun chooseSmsSim() {
        if (checkSelfPermission(android.Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "Autorize as permissões primeiro.", Toast.LENGTH_LONG).show()
            authorizeSmsPermissions()
            return
        }
        try {
            val sims = getSystemService(SubscriptionManager::class.java).activeSubscriptionInfoList ?: emptyList()
            if (sims.isEmpty()) {
                Toast.makeText(this, "Nenhum chip ativo foi encontrado.", Toast.LENGTH_LONG).show()
                return
            }
            val current = smsIdentity.prefs.getInt("sim", -1)
            AlertDialog.Builder(this).setTitle("Chip para envio")
                .setItems(sims.map { "Slot ${it.simSlotIndex + 1} • ${it.carrierName}" }.toTypedArray()) { _, index ->
                    smsIdentity.prefs.edit().putInt("sim", sims[index].subscriptionId).apply()
                    refreshSmsStatus.run()
                }.show().also(::styleDialog)
        } catch (_: SecurityException) {
            Toast.makeText(this, "O Android não liberou o acesso aos chips.", Toast.LENGTH_LONG).show()
        }
    }

    private fun toggleSmsGateway() {
        if (GatewayService.active) stopService(Intent(this, GatewayService::class.java))
        else startForegroundService(Intent(this, GatewayService::class.java))
        body.postDelayed({ if (selectedTab == 3) renderTab() }, 500)
    }

    private fun allowSmsInBackground() {
        val power = getSystemService(PowerManager::class.java)
        if (power.isIgnoringBatteryOptimizations(packageName)) {
            Toast.makeText(this, "Proteção de bateria já autorizada.", Toast.LENGTH_LONG).show()
            return
        }
        val dialog = AlertDialog.Builder(this).setTitle("Gateway em segundo plano")
            .setMessage("Para receber pedidos com a tela bloqueada, autorize o Android a não suspender este aplicativo. Isso pode aumentar o consumo de bateria. Pausar o gateway libera a proteção de processamento.")
            .setPositiveButton("Continuar") { _, _ ->
                try {
                    startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
                } catch (_: ActivityNotFoundException) {
                    startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                }
            }.setNegativeButton("Agora não", null).show()
        styleDialog(dialog)
    }

    private fun showSmsPairCode() {
        val dialog = AlertDialog.Builder(this).setTitle("Parear por 2 minutos")
            .setMessage(smsIdentity.pairingCode() + "\nConfira o certificado no computador.")
            .setPositiveButton("OK", null).show()
        styleDialog(dialog)
    }

    private fun revokeSmsPairing() {
        val dialog = AlertDialog.Builder(this).setTitle("Revogar pareamento")
            .setMessage("Desconectar o computador e bloquear novos envios?")
            .setPositiveButton("Revogar") { _, _ -> smsIdentity.revoke(); refreshSmsStatus.run() }
            .setNegativeButton("Voltar", null).show()
        styleDialog(dialog)
    }

    private fun setRealSmsEnabled(control: Switch, checked: Boolean) {
        if (!checked) {
            smsIdentity.prefs.edit().putBoolean("send_enabled", false).apply()
            refreshSmsStatus.run()
            return
        }
        control.isEnabled = false
        val dialog = AlertDialog.Builder(this).setTitle("Enviar pelo chip")
            .setMessage("Pedidos confirmados na Central poderão enviar SMS e gerar custos. O modo diagnóstico será desativado.")
            .setPositiveButton("Habilitar") { _, _ ->
                smsIdentity.prefs.edit().putBoolean("send_enabled", true).apply()
                control.isEnabled = true
                refreshSmsStatus.run()
            }.setNegativeButton("Cancelar") { _, _ -> control.isChecked = false; control.isEnabled = true }
            .setOnCancelListener { control.isChecked = false; control.isEnabled = true }.show()
        styleDialog(dialog)
    }

    private val refreshSmsStatus = object : Runnable {
        override fun run() {
            val target = smsStatus ?: return
            if (selectedTab != 3 || isFinishing) return
            val configured = CloudGateway.branches.filter { smsIdentity.prefs.contains("cloud_token_$it") }
                .joinToString(", ") { it.replaceFirstChar(Char::uppercase) }.ifBlank { "nenhuma" }
            val sim = smsIdentity.prefs.getInt("sim", -1)
            val screenOff = getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)
            val localEndpoints = if (smsIdentity.prefs.getBoolean("cloud_enabled", false)) "" else localGatewayEndpoints()
            val lastError = smsIdentity.prefs.getString("last_error", "").orEmpty()
            target.text = "Gateway ${if (GatewayService.active) "ativo" else "pausado"}  •  Chip ${if (sim < 0) "não selecionado" else "selecionado"}\n" +
                "Bases: $configured  •  ${CloudGateway.state}\n" +
                (if (localEndpoints.isNotBlank()) "Endereço local: $localEndpoints\n" else "") +
                "Tela apagada: ${if (screenOff) "autorizada" else "não autorizada"}  •  Envio real: ${if (smsIdentity.prefs.getBoolean("send_enabled", false)) "habilitado" else "desabilitado"}" +
                (if (lastError.isNotBlank()) "\nÚltimo erro: $lastError" else "")
            statusHandler.postDelayed(this, 2000)
        }
    }

    private fun localGatewayEndpoints(): String = try {
        NetworkInterface.getNetworkInterfaces().toList()
            .filter { it.isUp && !it.isLoopback && (it.name.startsWith("wlan") || it.name.startsWith("ap")) }
            .flatMap { it.inetAddresses.toList() }
            .filterIsInstance<java.net.Inet4Address>()
            .mapNotNull { it.hostAddress?.let { address -> "https://$address:8743" } }
            .distinct().joinToString(" · ")
    } catch (_: Exception) { "" }

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
        val kind = when {
            title.contains("permiss", true) -> "shield"
            title.contains("base", true) -> "cloud"
            title.contains("chip", true) -> "chip"
            title.contains("gateway", true) || title.contains("ativar", true) || title.contains("pausar", true) -> if (title.contains("Pausar", true)) "pause" else "play"
            title.contains("apagada", true) -> "battery"
            title.contains("pareamento", true) -> "link"
            title.contains("revogar", true) -> "revoke"
            title.contains("PIN", true) -> "lock"
            title.contains("acessibilidade", true) -> "message"
            else -> "settings"
        }
        val button = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(15), dp(10), dp(15), dp(10))
            background = rounded(panelAlt, accent, dp(1), 13)
            isClickable = true
            isFocusable = true
            contentDescription = title
            setOnClickListener { callback() }
            addView(NavGlyph(this@DashboardActivity, kind, accent), LinearLayout.LayoutParams(dp(22), dp(22)))
            addView(label(title, 14, text, true).apply { setPadding(dp(12), 0, 0, 0) },
                LinearLayout.LayoutParams(0, -2, 1f))
        }
        body.addView(button, LinearLayout.LayoutParams(-1, dp(54)).apply { setMargins(0, 0, 0, dp(9)) })
    }

    private class NavGlyph(context: android.content.Context, private val kind: String, tint: Int) : View(context) {
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = tint
            style = Paint.Style.STROKE
            strokeWidth = 1.9f
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
        }
        fun setTint(color: Int) { paint.color = color; invalidate() }
        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val save = canvas.save()
            canvas.scale(width / 24f, height / 24f)
            when (kind) {
                "dashboard" -> {
                    canvas.drawRoundRect(3f, 3f, 10f, 10f, 1.5f, 1.5f, paint)
                    canvas.drawRoundRect(14f, 3f, 21f, 10f, 1.5f, 1.5f, paint)
                    canvas.drawRoundRect(3f, 14f, 10f, 21f, 1.5f, 1.5f, paint)
                    canvas.drawRoundRect(14f, 14f, 21f, 21f, 1.5f, 1.5f, paint)
                }
                "settings" -> {
                    canvas.drawCircle(12f, 12f, 4f, paint)
                    for (i in 0..7) {
                        val angle = i * Math.PI / 4
                        val x = kotlin.math.cos(angle).toFloat(); val y = kotlin.math.sin(angle).toFloat()
                        canvas.drawLine(12 + x * 6.5f, 12 + y * 6.5f, 12 + x * 9f, 12 + y * 9f, paint)
                    }
                    canvas.drawCircle(12f, 12f, 9f, paint)
                }
                "play" -> canvas.drawPath(Path().apply { moveTo(7f, 4f); lineTo(19f, 12f); lineTo(7f, 20f); close() }, paint)
                "pause" -> { canvas.drawRoundRect(6f, 4f, 10f, 20f, 1f, 1f, paint); canvas.drawRoundRect(14f, 4f, 18f, 20f, 1f, 1f, paint) }
                "chip" -> {
                    canvas.drawRoundRect(7f, 7f, 17f, 17f, 1f, 1f, paint)
                    for (i in 0..3) { val p = 8f + i * 2.7f; canvas.drawLine(p, 3f, p, 7f, paint); canvas.drawLine(p, 17f, p, 21f, paint); canvas.drawLine(3f, p, 7f, p, paint); canvas.drawLine(17f, p, 21f, p, paint) }
                }
                "cloud" -> { canvas.drawCircle(8f, 13f, 4f, paint); canvas.drawCircle(13f, 10f, 5f, paint); canvas.drawCircle(17f, 13f, 3.5f, paint); canvas.drawLine(5f, 16f, 20f, 16f, paint) }
                "shield" -> canvas.drawPath(Path().apply { moveTo(12f, 3f); lineTo(20f, 6f); lineTo(19f, 14f); lineTo(12f, 21f); lineTo(5f, 14f); lineTo(4f, 6f); close() }, paint)
                "battery" -> { canvas.drawRoundRect(3f, 7f, 20f, 17f, 2f, 2f, paint); canvas.drawRect(20f, 10f, 22f, 14f, paint); canvas.drawLine(7f, 12f, 16f, 12f, paint) }
                "link" -> { canvas.drawRoundRect(3f, 6f, 13f, 14f, 4f, 4f, paint); canvas.drawRoundRect(11f, 10f, 21f, 18f, 4f, 4f, paint); canvas.drawLine(8f, 15f, 16f, 9f, paint) }
                "revoke" -> { canvas.drawRoundRect(4f, 4f, 20f, 20f, 3f, 3f, paint); canvas.drawLine(8f, 8f, 16f, 16f, paint); canvas.drawLine(16f, 8f, 8f, 16f, paint) }
                "lock" -> { canvas.drawRoundRect(5f, 10f, 19f, 21f, 2f, 2f, paint); canvas.drawArc(8f, 3f, 16f, 15f, 180f, 180f, false, paint) }
                "message" -> { canvas.drawRoundRect(3f, 4f, 21f, 17f, 3f, 3f, paint); canvas.drawPath(Path().apply { moveTo(7f, 17f); lineTo(6f, 21f); lineTo(12f, 17f) }, paint); canvas.drawLine(7f, 9f, 17f, 9f, paint); canvas.drawLine(7f, 13f, 14f, 13f, paint) }
            }
            canvas.restoreToCount(save)
        }
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

    companion object { private const val SMS_PERMISSION_REQUEST = 41 }
}
