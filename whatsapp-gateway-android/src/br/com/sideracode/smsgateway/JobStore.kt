package br.com.sideracode.smsgateway

import android.content.Context
import android.database.sqlite.SQLiteOpenHelper
import android.database.sqlite.SQLiteDatabase
import android.content.ContentValues
import org.json.JSONObject
import java.util.UUID

class JobStore(ctx: Context, name:String="gateway.sqlite"): SQLiteOpenHelper(ctx, name, null, 3) {
 override fun onCreate(db: SQLiteDatabase) {
  db.execSQL("CREATE TABLE jobs(id TEXT PRIMARY KEY,payload TEXT NOT NULL,state TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '',updated INTEGER NOT NULL,cloud_ack INTEGER NOT NULL DEFAULT 0,batch_id TEXT NOT NULL DEFAULT '',delay_seconds INTEGER NOT NULL DEFAULT 0)")
 }
 override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) { if(old<2)db.execSQL("ALTER TABLE jobs ADD COLUMN cloud_ack INTEGER NOT NULL DEFAULT 0");if(old<3){db.execSQL("ALTER TABLE jobs ADD COLUMN batch_id TEXT NOT NULL DEFAULT ''");db.execSQL("ALTER TABLE jobs ADD COLUMN delay_seconds INTEGER NOT NULL DEFAULT 0")} }
 @Synchronized fun get(id: String): JSONObject? {
  readableDatabase.rawQuery("SELECT payload,state,detail,updated FROM jobs WHERE id=?", arrayOf(id)).use {
   if (!it.moveToFirst()) return null
   return JSONObject(it.getString(0)).put("state",it.getString(1)).put("detail",it.getString(2)).put("updated_at",it.getLong(3))
  }
 }
 fun normalized(p: JSONObject): JSONObject {
  val version=p.getInt("version")
  require(version in 1..3 && p.getString("branch") in listOf("imperatriz","araguaina","acailandia","maraba")) { "Versão/base inválida" }
  val id=p.getString("id"); require(UUID.fromString(id).toString()==id) { "UUID inválido" }
  val targetType=if(version==3)p.getString("target_type") else "device"
  val serial=p.getString("serial"); require(if(targetType=="contact")serial.isEmpty()||Regex("024[0-9]{6}").matches(serial) else Regex("024[0-9]{6}").matches(serial)) { "Série não autorizada" }
  require(targetType in listOf("device","contact")) { "Destino inválido" }
  require(Regex("\\+55[1-9][0-9]{9,10}").matches(p.getString("phone"))) { "Telefone inválido" }
  val cmd=p.getString("command")
  require(cmd.isNotBlank() && cmd.length <= 160 && cmd.all { it.code in 32..126 }) { "Comando não autorizado" }
  if(version==1) require(cmd.startsWith("ST300NTW;$serial;")) { "Formato antigo inválido" }
  require(p.getLong("expires_at")-p.getLong("created_at")==7200L) { "Validade deve ser 2 horas" }
  require(p.getLong("created_at") <= System.currentTimeMillis()/1000+60) { "Relógios divergentes" }
  val value=JSONObject().put("version",version).put("id",id).put("branch",p.getString("branch")).put("serial",serial)
   .put("phone",p.getString("phone")).put("command",cmd).put("created_at",p.getLong("created_at"))
   .put("expires_at",p.getLong("expires_at")).put("status_snapshot",p.getString("status_snapshot"))
  if(version>=2) {
   val mode=p.getString("command_mode");require(mode in listOf("custom","standard"))
   val source=p.getString("source_phone_snapshot");require(Regex("\\+55[1-9][0-9]{9,10}").matches(source))
   val standard=p.getString("standard_command_snapshot")
   if(mode=="standard")require(cmd==standard && cmd.startsWith("ST300NTW;$serial;") && p.getString("phone")==source)
   value.put("command_mode",mode).put("source_phone_snapshot",source).put("apn_snapshot",p.getString("apn_snapshot")).put("standard_command_snapshot",standard)
  }
  if(version==3){
   val delay=p.getInt("delay_seconds");require(delay in listOf(3,10,20))
   val batch=p.getString("batch_id");require(batch.isNotBlank()&&batch.length<=80)
   val contact=p.optString("contact_name","");require(targetType!="contact"||contact.isNotBlank()&&contact.length<=80)
   value.put("target_type",targetType).put("contact_name",contact).put("batch_id",batch).put("delay_seconds",delay)
  }
  return value
 }
 @Synchronized fun accept(p: JSONObject): JSONObject {
  val value=normalized(p); val old=get(value.getString("id"))
  if(old!=null) { require(normalized(old).toString()==value.toString()) { "UUID já usado com outro conteúdo" }; return old }
  val state=if(value.getLong("expires_at")<=System.currentTimeMillis()/1000) "expired" else "received"
  writableDatabase.insertOrThrow("jobs",null,ContentValues().apply {
   put("id",value.getString("id"));put("payload",value.toString());put("state",state);put("updated",System.currentTimeMillis()/1000);put("batch_id",value.optString("batch_id"));put("delay_seconds",value.optInt("delay_seconds",0))
  })
  return get(value.getString("id"))!!
 }
 @Synchronized fun transition(id: String, from: List<String>, to: String, detail: String=""): Boolean {
  val old=get(id)?:return false
  if(old.getString("state") !in from) return false
  return writableDatabase.update("jobs",ContentValues().apply { put("state",to);put("detail",detail);put("updated",System.currentTimeMillis()/1000) },
   "id=? AND state=?",arrayOf(id,old.getString("state")))==1
 }
 @Synchronized fun recover() { val batches=mutableSetOf<String>();readableDatabase.rawQuery("SELECT DISTINCT batch_id FROM jobs WHERE state='sending' AND batch_id<>''",null).use{while(it.moveToNext())batches.add(it.getString(0))};writableDatabase.execSQL("UPDATE jobs SET state='indeterminate',detail='Processo interrompido durante envio' WHERE state='sending'");batches.forEach{stopBatch(it,"Lote interrompido após resultado incerto")} }
 @Synchronized fun authorizeCloud(id:String) { writableDatabase.execSQL("UPDATE jobs SET cloud_ack=1 WHERE id=? AND state='received'",arrayOf(id)) }
 @Synchronized fun stopBatch(batch:String,detail:String) { writableDatabase.execSQL("UPDATE jobs SET state='failed',detail=?,updated=? WHERE state='received' AND batch_id=?",arrayOf(detail,System.currentTimeMillis()/1000,batch)) }
 @Synchronized fun waitForBatchGap(id:String,now:Long,lastSentAt:Long,lastBatch:String):Boolean { val job=get(id)?:return false;val batch=job.optString("batch_id");if(batch.isBlank()||batch!=lastBatch||lastSentAt<=0)return false;readableDatabase.rawQuery("SELECT delay_seconds FROM jobs WHERE batch_id=? AND state IN ('sent','delivered') ORDER BY updated DESC LIMIT 1",arrayOf(batch)).use{if(!it.moveToFirst())return false;return now-lastSentAt<it.getInt(0)*1000L} }
 @Synchronized fun next(cloud:Boolean=false): JSONObject? {
  val stale=mutableSetOf<String>();readableDatabase.rawQuery("SELECT DISTINCT batch_id FROM jobs WHERE state='sending' AND updated<=? AND batch_id<>''",arrayOf((System.currentTimeMillis()/1000-300).toString())).use{while(it.moveToNext())stale.add(it.getString(0))};writableDatabase.execSQL("UPDATE jobs SET state='indeterminate',detail='Sem retorno Android em 5 minutos; não reenviado' WHERE state='sending' AND updated<=?",arrayOf(System.currentTimeMillis()/1000-300));stale.forEach{stopBatch(it,"Lote interrompido após resultado incerto")}
  readableDatabase.rawQuery("SELECT id FROM jobs WHERE state='sending' LIMIT 1",null).use { if(it.moveToFirst())return null }
  readableDatabase.rawQuery("SELECT id FROM jobs WHERE state='received'"+(if(cloud)" AND cloud_ack=1" else "")+" ORDER BY updated,id LIMIT 1",null).use { return if(it.moveToFirst()) get(it.getString(0)) else null }
 }
 @Synchronized fun history(): String {
  val lines= mutableListOf<String>()
  readableDatabase.rawQuery("SELECT payload,state,detail FROM jobs ORDER BY updated DESC LIMIT 30",null).use {
   while(it.moveToNext()) { val p=JSONObject(it.getString(0));lines.add(p.getString("serial")+" · "+it.getString(1)+"\n"+it.getString(2)) }
  };return lines.joinToString("\n\n").ifEmpty { "Nenhum pedido recebido." }
 }
}
