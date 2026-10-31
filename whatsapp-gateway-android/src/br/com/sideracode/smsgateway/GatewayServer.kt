package br.com.sideracode.smsgateway
import fi.iki.elonen.NanoHTTPD
import org.json.JSONObject
import android.content.Context

class GatewayServer(private val ctx: Context, private val db:JobStore,private val identity:GatewayIdentity):NanoHTTPD(8743) {
 init { makeSecure(identity.socketFactory(),null) }
 private var attempts=0
 private var window=System.currentTimeMillis()
 private fun reply(code:Response.Status,p:JSONObject)=newFixedLengthResponse(code,"application/json",p.toString())
 override fun serve(s:IHTTPSession):Response {
  return try {
   if(s.method !in listOf(Method.GET,Method.PUT,Method.POST)) return reply(Response.Status.METHOD_NOT_ALLOWED,JSONObject())
   if(s.uri=="/pair" && s.method==Method.POST) {
    synchronized(this) { if(System.currentTimeMillis()-window>120000){attempts=0;window=System.currentTimeMillis()};require(++attempts<=5) { "Muitas tentativas; aguarde 2 minutos" } }
    return reply(Response.Status.OK,JSONObject().put("token",identity.pair(body(s).getString("code"))).put("fingerprint",identity.fingerprint()))
   }
   if(!identity.authorized(s.headers["authorization"]?:"")) return reply(Response.Status.UNAUTHORIZED,JSONObject().put("error","Não autorizado"))
   if(s.uri=="/health" && s.method==Method.GET) {
    val power=ctx.getSystemService(android.os.PowerManager::class.java)
    return reply(Response.Status.OK,JSONObject().put("version",1).put("app_version",CloudGateway.VERSION)
     .put("send_enabled",identity.prefs.getBoolean("send_enabled",false)).put("time",System.currentTimeMillis()/1000)
     .put("background_exempt",power.isIgnoringBatteryOptimizations(ctx.packageName)).put("screen_interactive",power.isInteractive)
     .put("cpu_protected",GatewayService.cpuProtected))
   }
   val parts=s.uri.trim('/').split('/')
   require(parts.size in 2..3 && parts[0]=="jobs") { "Rota inválida" }
   val id=parts[1]
   when {
    s.method==Method.PUT && parts.size==2 -> { val p=body(s);require(p.getString("id")==id);reply(Response.Status.OK,db.accept(p)) }
    s.method==Method.GET && parts.size==2 -> db.get(id)?.let {reply(Response.Status.OK,it)} ?: reply(Response.Status.NOT_FOUND,JSONObject())
    s.method==Method.POST && parts.size==3 && parts[2]=="cancel" -> {
     db.transition(id,listOf("received"),"cancelled")
     db.get(id)?.let {reply(Response.Status.OK,it)} ?: reply(Response.Status.NOT_FOUND,JSONObject())
    }
    else -> reply(Response.Status.NOT_FOUND,JSONObject())
   }
  } catch(e:Exception) { reply(if(e.message?.startsWith("UUID já")==true) Response.Status.CONFLICT else Response.Status.BAD_REQUEST,JSONObject().put("error",e.message?:"Requisição inválida")) }
 }
 private fun body(s:IHTTPSession):JSONObject {
  val length=s.headers["content-length"]?.toLongOrNull()?:0
  require(length in 1..8192 && !s.headers.containsKey("transfer-encoding")) { "Tamanho inválido" }
  val files=HashMap<String,String>();s.parseBody(files)
  val raw=files["postData"] ?: files["content"]?.let { path ->
   val file=java.io.File(path)
   require(file.length()<=8192) { "Tamanho inválido" }
   file.readText(Charsets.UTF_8)
  } ?: error("JSON ausente")
  return JSONObject(raw)
 }
}
