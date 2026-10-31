package br.com.sideracode.smsgateway

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject

import java.net.URL
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.net.ssl.HttpsURLConnection

/** Dedicated outbound HTTPS credential. No database or platform passwords on the phone. */
class CloudGateway(private val ctx:Context,private val db:JobStore,private val identity:GatewayIdentity) {
 companion object {
  const val ENDPOINT="https://central-paralela.sinderacodofc.workers.dev/api/galaxy"
  const val VERSION="1.2.0"
  private const val ALIAS="rs-gateway-cloud-v1"
  @Volatile var state="Não conectado à Central"
  @Volatile var lastOk=0L
  val branches=listOf("imperatriz","araguaina","acailandia","maraba")
  fun configure(identity:GatewayIdentity,branch:String,token:String) {
   require(branch in branches && Regex("[a-f0-9]{64}").matches(token))
   val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
   if(!store.containsAlias(ALIAS))KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply{
    init(KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generateKey()
   }
   val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,store.getKey(ALIAS,null) as SecretKey)
   check(identity.prefs.edit().putString("cloud_token_"+branch,Base64.encodeToString(cipher.doFinal(token.toByteArray()),Base64.NO_WRAP)).putString("cloud_iv_"+branch,Base64.encodeToString(cipher.iv,Base64.NO_WRAP)).putBoolean("cloud_enabled",true).putBoolean("send_enabled",false).commit())
   state="Base configurada; confira o chip antes de habilitar envios"
  }

 }
 private var branchIndex=0
 private var currentBranch=""

 private fun token():String {
  val keyStore=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
  val cipher=Cipher.getInstance("AES/GCM/NoPadding")
  cipher.init(Cipher.DECRYPT_MODE,keyStore.getKey(ALIAS,null) as SecretKey,GCMParameterSpec(128,Base64.decode(identity.prefs.getString("cloud_iv_"+currentBranch,"")!!,Base64.NO_WRAP)))
  return String(cipher.doFinal(Base64.decode(identity.prefs.getString("cloud_token_"+currentBranch,"")!!,Base64.NO_WRAP)))
 }
 private fun request(body:JSONObject):JSONObject {

  val connection=URL(ENDPOINT+"?branch="+currentBranch).openConnection() as HttpsURLConnection
  try {
   connection.requestMethod="POST";connection.connectTimeout=10000;connection.readTimeout=15000;connection.instanceFollowRedirects=false;connection.doOutput=true
   connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("x-rs-gateway",token())
   connection.outputStream.use{it.write(body.toString().toByteArray())}
   check(connection.responseCode==200){"Central HTTP ${connection.responseCode}"}
   val bytes=connection.inputStream.use{input-> val output=java.io.ByteArrayOutputStream();val buffer=ByteArray(4096);var n=input.read(buffer);while(n!=-1){check(output.size()+n<=65536){"Resposta excedeu o limite"};output.write(buffer,0,n);n=input.read(buffer)};output.toByteArray()}
   val result=JSONObject(String(bytes));check(result.optBoolean("ok")){"Central não confirmou"};return result
  }finally{connection.disconnect()}
 }
 fun tick(ready:Boolean) {
  if(!identity.prefs.getBoolean("cloud_enabled",false))return
  val configured=branches.filter{identity.prefs.contains("cloud_token_"+it)}
  if(configured.isEmpty()){state="Configure as bases no aplicativo";return}
  currentBranch=configured[Math.floorMod(branchIndex++,configured.size)]
  try {
   val response=request(JSONObject().put("action","poll").put("ready",ready).put("app_version",VERSION))
   val jobs=response.getJSONArray("jobs")
   for(i in 0 until jobs.length()){
    val item=jobs.getJSONObject(i);val id=item.getString("id")
    var job=db.get(id)
    if(job==null&&item.has("payload")){
     try {val payload=item.getJSONObject("payload");require(payload.getString("branch")==currentBranch);job=db.accept(payload)}
     catch(e:Exception){request(JSONObject().put("action","report").put("id",id).put("state","failed").put("detail","Pedido rejeitado pela validação do Gateway"));continue}
    }
    if(job==null){
     if(item.getString("state")!="pending")request(JSONObject().put("action","report").put("id",id).put("state","indeterminate").put("detail","Registro local ausente; não reenviado"))
     continue
    }
    require(job.getString("branch")==currentBranch) { "Base do pedido divergente" }
    val reported=request(JSONObject().put("action","report").put("id",id).put("state",job.getString("state")).put("detail",job.optString("detail")).put("updated_at",job.getLong("updated_at")))
    // An accepted cloud acknowledgement is required before the physical send.
    if(job.getString("state")=="received"&&reported.optString("state")=="received")db.authorizeCloud(id)
   }
   lastOk=System.currentTimeMillis();state=currentBranch+" • "+if(ready)"Central conectada • envio habilitado" else "Central conectada • diagnóstico"
  }catch(e:Exception){state=currentBranch+" • "+(e.message?.takeIf{it.startsWith("Central HTTP")}?:e.javaClass.simpleName)}
 }
}
