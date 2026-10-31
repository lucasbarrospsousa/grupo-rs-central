package br.com.sideracode.smsgateway
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.os.*
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import java.util.concurrent.Executors

class GatewayService:Service() {
 companion object { @Volatile var active=false; @Volatile var cpuProtected=false; const val PAUSE="br.com.sideracode.smsgateway.PAUSE" }
 private var cpuLock:PowerManager.WakeLock?=null
 private val powerHandler=Handler(Looper.getMainLooper())
 private val renewPower=object:Runnable {
  override fun run(){
   if(!active)return
   // Bounded lease: a stalled service cannot leave an unlimited lock behind.
   cpuLock?.acquire(10*60*1000L)
   cpuProtected=cpuLock?.isHeld==true
   powerHandler.postDelayed(this,5*60*1000L)
  }
 }
 private lateinit var db:JobStore
 private lateinit var identity:GatewayIdentity
 private var server:GatewayServer?=null
 private var cloud:CloudGateway?=null
 private var nextCloud=0L
 private val worker=Executors.newSingleThreadScheduledExecutor()
 override fun onBind(intent:Intent?)=null
 override fun onCreate() {
  super.onCreate()
  val nm=getSystemService(NotificationManager::class.java)
  nm.createNotificationChannel(NotificationChannel("gateway","Gateway SMS ativo",NotificationManager.IMPORTANCE_LOW))
  val open=PendingIntent.getActivity(this,0,Intent(this,br.com.sideracode.whatsappgateway.DashboardActivity::class.java),PendingIntent.FLAG_IMMUTABLE)
  val pause=PendingIntent.getService(this,1,Intent(this,GatewayService::class.java).setAction(PAUSE),PendingIntent.FLAG_IMMUTABLE)
  startForeground(1,Notification.Builder(this,"gateway").setContentTitle("RS SMS Gateway")
   .setContentText("Ativo com a tela apagada • Central online").setSmallIcon(android.R.drawable.ic_dialog_email).setContentIntent(open)
   .setOngoing(true).setOnlyAlertOnce(true).addAction(Notification.Action.Builder(null,"Pausar gateway",pause).build()).build())
  db=JobStore(this);db.recover();identity=GatewayIdentity(this)
  try { if(identity.prefs.getBoolean("cloud_enabled",false))cloud=CloudGateway(this,db,identity) else server=GatewayServer(this,db,identity).also { it.start(5000,false) };active=true }
  catch(e:Exception){ identity.prefs.edit().putString("last_error","Falha HTTPS: "+e.javaClass.simpleName).apply();stopSelf();return }
  cpuLock=getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"RSMSGateway:LocalServer").apply { setReferenceCounted(false) }
  powerHandler.post(renewPower)
  worker.scheduleWithFixedDelay({dispatch()},1,2,java.util.concurrent.TimeUnit.SECONDS)
 }
 override fun onStartCommand(i:Intent?,f:Int,id:Int):Int {
  if(i?.action==PAUSE)stopSelf()
  return START_NOT_STICKY
 }
 private fun dispatch() {
  if(!active)return
  try {
   val cloudMode=identity.prefs.getBoolean("cloud_enabled",false)
   if(cloudMode&&System.currentTimeMillis()>=nextCloud){
    val permissions=checkSelfPermission(android.Manifest.permission.SEND_SMS)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(android.Manifest.permission.READ_PHONE_STATE)==PackageManager.PERMISSION_GRANTED
    val sim=if(permissions)getSystemService(SubscriptionManager::class.java).activeSubscriptionInfoList?.any{it.subscriptionId==identity.prefs.getInt("sim",-1)}==true else false
    cloud?.tick(identity.prefs.getBoolean("send_enabled",false)&&permissions&&sim);nextCloud=System.currentTimeMillis()+15000
   }
   if(!active)return
   val p=db.next(cloudMode)?:return;val id=p.getString("id")
   val prefs=getSharedPreferences("gateway",MODE_PRIVATE)
   val lastSent=prefs.getLong("last_sms_sent_at",0L)
   val lastBatch=prefs.getString("last_sms_batch","")?:""
   if(db.waitForBatchGap(id,System.currentTimeMillis(),lastSent,lastBatch))return
   if(p.getLong("expires_at")<=System.currentTimeMillis()/1000){db.transition(id,listOf("received"),"expired");return}
   if(!identity.prefs.getBoolean("send_enabled",false))return
   val sub=identity.prefs.getInt("sim",-1)
   if(checkSelfPermission(android.Manifest.permission.SEND_SMS)!=PackageManager.PERMISSION_GRANTED ||
     checkSelfPermission(android.Manifest.permission.READ_PHONE_STATE)!=PackageManager.PERMISSION_GRANTED)return
   if(getSystemService(SubscriptionManager::class.java).activeSubscriptionInfoList?.none {it.subscriptionId==sub}!=false)return
   val sms=if(Build.VERSION.SDK_INT>=31)getSystemService(SmsManager::class.java).createForSubscriptionId(sub) else SmsManager.getSmsManagerForSubscriptionId(sub)
   if(sms.divideMessage(p.getString("command")).size!=1){db.transition(id,listOf("received"),"failed","Comando exige múltiplos SMS");p.optString("batch_id").takeIf{it.isNotBlank()}?.let{db.stopBatch(it,"Lote interrompido: comando dividido")};return}
   if(!active)return
   if(!db.transition(id,listOf("received"),"sending"))return
   fun callback(kind:String)=PendingIntent.getBroadcast(this,0,
    Intent(this,SmsResultReceiver::class.java).setAction("br.com.sideracode.smsgateway."+kind).setData(android.net.Uri.parse("rsgateway://$kind/$id")).putExtra("job_id",id),
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
   try { sms.sendTextMessage(p.getString("phone"),null,p.getString("command"),callback("sent"),callback("delivered")) }
   catch(e:Exception){db.transition(id,listOf("sending"),"indeterminate","Android não confirmou: "+e.javaClass.simpleName);p.optString("batch_id").takeIf{it.isNotBlank()}?.let{db.stopBatch(it,"Lote interrompido após resultado incerto")}}
  } catch(e:Exception){ identity.prefs.edit().putString("last_error",e.javaClass.simpleName).apply() }
 }
 override fun onDestroy(){
  active=false;powerHandler.removeCallbacks(renewPower)
  cpuLock?.let {if(it.isHeld)it.release()};cpuProtected=false
  server?.stop();worker.shutdownNow();super.onDestroy()
 }
}
class SmsResultReceiver:BroadcastReceiver() {
 override fun onReceive(ctx:Context,intent:Intent) {
  val id=intent.getStringExtra("job_id")?:return
  val db=JobStore(ctx)
  if(intent.action?.endsWith(".sent")==true) {
   val job=db.get(id)
   if(resultCode==Activity.RESULT_OK){
    db.transition(id,listOf("sending","indeterminate"),"sent","Resultado Android: $resultCode")
    ctx.getSharedPreferences("gateway",Context.MODE_PRIVATE).edit().putLong("last_sms_sent_at",System.currentTimeMillis()).putString("last_sms_batch",job?.optString("batch_id","")?:"").apply()
   }else{db.transition(id,listOf("sending","indeterminate"),"failed","Resultado Android: $resultCode");job?.optString("batch_id")?.takeIf{it.isNotBlank()}?.let{db.stopBatch(it,"Lote interrompido após falha de envio")}}
  }
  else if(intent.action?.endsWith(".delivered")==true && resultCode==Activity.RESULT_OK)
   db.transition(id,listOf("sending","sent","indeterminate"),"delivered","Confirmação da rede; não comprova configuração")
  db.close()
 }
}
