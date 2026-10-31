package br.com.sideracode.smsgateway
import android.app.*
import android.os.*
import android.content.*
import android.content.pm.PackageManager
import android.graphics.Color
import android.widget.*
import android.telephony.SubscriptionManager
import android.provider.Settings
import android.net.Uri
import java.net.NetworkInterface

class MainActivity:Activity() {
 private lateinit var identity:GatewayIdentity
 private lateinit var info:TextView
 private lateinit var history:TextView
 private val timer=Handler(Looper.getMainLooper())
 override fun onCreate(state:Bundle?) {
  super.onCreate(state);identity=GatewayIdentity(this)

  val scroll=ScrollView(this);val column=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(28,44,28,24);setBackgroundColor(Color.rgb(239,245,251)) }
  scroll.addView(column);setContentView(scroll)
  fun label(text:String,size:Float=18f):TextView { val v=TextView(this);v.text=text;v.textSize=size;v.setTextColor(Color.rgb(13,47,77));v.setPadding(0,14,0,14);column.addView(v);return v }
  fun button(text:String,action:()->Unit){column.addView(Button(this).apply{textSize=16f;setText(text);setOnClickListener{action()}})}
  label("RS SMS Gateway",28f);label("Quatro bases • Central online • validade de 2 horas")
  info=label("")
  label("Certificado SHA256\n"+identity.fingerprint(),12f).setTextIsSelectable(true)
  button("Autorizar permissões"){
   val p=mutableListOf(android.Manifest.permission.SEND_SMS,android.Manifest.permission.READ_PHONE_STATE)
   if(Build.VERSION.SDK_INT>=33)p.add(android.Manifest.permission.POST_NOTIFICATIONS)
   requestPermissions(p.toTypedArray(),1)
  }
  button("Configurar bases da Central"){
   val bases=CloudGateway.branches
   AlertDialog.Builder(this).setTitle("Escolha a base").setItems(bases.toTypedArray()){_,index->
    val input=EditText(this).apply { hint="Token privado desta base";inputType=129 }
    AlertDialog.Builder(this).setTitle("Conectar "+bases[index]).setMessage("Na Central, selecione esta filial e prepare a conexão Galaxy. Cole o token privado. As outras bases permanecem configuradas.")
     .setView(input).setPositiveButton("Salvar"){_,_->
      try {stopService(Intent(this,GatewayService::class.java));CloudGateway.configure(identity,bases[index],input.text.toString().trim());recreate()}
      catch(e:Exception){Toast.makeText(this,"Credencial inválida; confira o token completo",Toast.LENGTH_LONG).show()}
     }.setNegativeButton("Cancelar",null).show()
   }.show()
  }
  button("Escolher chip"){
   if(checkSelfPermission(android.Manifest.permission.READ_PHONE_STATE)!=PackageManager.PERMISSION_GRANTED){Toast.makeText(this,"Autorize as permissões primeiro",Toast.LENGTH_LONG).show();return@button}
   val sims=getSystemService(SubscriptionManager::class.java).activeSubscriptionInfoList?:emptyList()
   AlertDialog.Builder(this).setTitle("Chip para envio").setItems(sims.map{"Slot ${it.simSlotIndex+1} • ${it.carrierName}"}.toTypedArray()){_,i->
    identity.prefs.edit().putInt("sim",sims[i].subscriptionId).apply()
   }.show()
  }
  button("Ativar gateway"){startForegroundService(Intent(this,GatewayService::class.java))}
  button("Pausar gateway"){stopService(Intent(this,GatewayService::class.java))}
  button("Permitir funcionar com a tela apagada"){
   val power=getSystemService(PowerManager::class.java)
   if(power.isIgnoringBatteryOptimizations(packageName))Toast.makeText(this,"Proteção de bateria já autorizada",Toast.LENGTH_LONG).show()
   else AlertDialog.Builder(this).setTitle("Gateway em segundo plano")
    .setMessage("Para receber pedidos pela internet com a tela bloqueada, autorize o Android a não suspender este aplicativo. Isso pode aumentar o consumo de bateria. A tela continuará apagada; pausar o gateway libera a proteção de processamento.")
    .setPositiveButton("Continuar"){_,_->
     try {startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,Uri.parse("package:$packageName")))}
     catch(e:ActivityNotFoundException){startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))}
    }.setNegativeButton("Agora não",null).show()
  }
  button("Gerar código de pareamento"){
   AlertDialog.Builder(this).setTitle("Parear por 2 minutos").setMessage(identity.pairingCode()+"\nConfira o certificado no computador.").setPositiveButton("OK",null).show()
  }
  button("Revogar pareamento"){AlertDialog.Builder(this).setMessage("Desconectar o computador e bloquear novos envios?").setPositiveButton("Revogar"){_,_->identity.revoke()}.setNegativeButton("Voltar",null).show()}
  val send=Switch(this).apply { text="Permitir envio real de SMS";isChecked=identity.prefs.getBoolean("send_enabled",false) }
  column.addView(send)
  send.setOnCheckedChangeListener {_,checked->
   if(checked) {
    send.isEnabled=false
    AlertDialog.Builder(this).setTitle("Enviar pelo chip").setMessage("Pedidos confirmados no Central poderão enviar SMS e gerar custos. O modo diagnóstico será desativado.")
     .setPositiveButton("Habilitar"){_,_->identity.prefs.edit().putBoolean("send_enabled",true).apply();send.isEnabled=true}
     .setNegativeButton("Cancelar"){_,_->send.isChecked=false;send.isEnabled=true}
     .setOnCancelListener {send.isChecked=false;send.isEnabled=true}.show()
   } else identity.prefs.edit().putBoolean("send_enabled",false).apply()
  }
  label("Histórico",22f);history=label("",14f)

 }
 override fun onResume(){super.onResume();timer.post(update)}
 override fun onPause(){timer.removeCallbacks(update);super.onPause()}
 private val update=object:Runnable {
  override fun run(){
   val ips=try { NetworkInterface.getNetworkInterfaces().toList().filter{it.name.startsWith("wlan")}.flatMap{it.inetAddresses.toList()}.filter{it is java.net.Inet4Address}.map{it.hostAddress} }catch(e:Exception){emptyList()}
   info.text=(if(GatewayService.active)"ATIVO" else "PAUSADO")+"\n"+ips.joinToString("\n"){"https://$it:8743"}+
    "\nChip selecionado: "+identity.prefs.getInt("sim",-1)+"\n"+identity.prefs.getString("last_error","")
   val power=getSystemService(PowerManager::class.java)
   info.append("\nTela apagada: "+if(power.isIgnoringBatteryOptimizations(packageName))"autorizado" else "autorize a proteção de bateria abaixo")
   info.append("\nBases configuradas: "+CloudGateway.branches.filter{identity.prefs.contains("cloud_token_"+it)}.joinToString(", "))
   info.append("\n"+CloudGateway.state)
   info.append("\nPC: dispensável no modo Central online")
   info.append("\nProteção de processamento: "+if(GatewayService.cpuProtected)"ativa" else "pausada")
   val db=JobStore(this@MainActivity);history.text=db.history();db.close();timer.postDelayed(this,2000)
  }
 }
}
