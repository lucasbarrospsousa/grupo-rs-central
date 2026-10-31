package br.com.sideracode.smsgateway
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.math.BigInteger
import java.security.*
import java.security.cert.X509Certificate
import java.util.Date
import javax.net.ssl.*
import javax.security.auth.x500.X500Principal
import java.net.Socket

class GatewayIdentity(ctx: Context) {
 val prefs=ctx.getSharedPreferences("identity",Context.MODE_PRIVATE)
 private val store=KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
 private val alias="rs-gateway-tls-ec-v1"
 init {
  if(!store.containsAlias(alias)) {
   val generator=KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC,"AndroidKeyStore")
   generator.initialize(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
    .setAlgorithmParameterSpec(java.security.spec.ECGenParameterSpec("secp256r1"))
    .setDigests(KeyProperties.DIGEST_NONE,KeyProperties.DIGEST_SHA256,KeyProperties.DIGEST_SHA512)
    .setCertificateSubject(X500Principal("CN=RS SMS Gateway")).setCertificateSerialNumber(BigInteger.ONE)
    .setCertificateNotBefore(Date(System.currentTimeMillis()-86400000)).setCertificateNotAfter(Date(System.currentTimeMillis()+315360000000L)).build())
   generator.generateKeyPair()
  }
 }
 val certificate get()=store.getCertificate(alias) as X509Certificate
 fun fingerprint()=MessageDigest.getInstance("SHA-256").digest(certificate.encoded).joinToString("") { "%02x".format(it) }
 fun socketFactory(): SSLServerSocketFactory {
  val manager=object:X509ExtendedKeyManager() {
   override fun getPrivateKey(a:String?)=store.getKey(alias,null) as PrivateKey
   override fun getCertificateChain(a:String?)=arrayOf(certificate)
   override fun getServerAliases(k:String?,i:Array<java.security.Principal>?)=arrayOf(alias)
   override fun chooseServerAlias(k:String?,i:Array<java.security.Principal>?,s:Socket?)=if(k=="EC") alias else null
   override fun chooseEngineServerAlias(k:String?,i:Array<java.security.Principal>?,e:SSLEngine?)=if(k=="EC") alias else null
   override fun getClientAliases(k:String?,i:Array<java.security.Principal>?)=null
   override fun chooseClientAlias(k:Array<String>?,i:Array<java.security.Principal>?,s:Socket?)=null
  }
  return SSLContext.getInstance("TLS").apply { init(arrayOf(manager),null,SecureRandom()) }.serverSocketFactory
 }
 fun pairingCode(): String {
  val bytes=ByteArray(8);SecureRandom().nextBytes(bytes)
  val code=bytes.joinToString("") { "%02x".format(it) }
  prefs.edit().putString("pair_code",code).putLong("pair_until",System.currentTimeMillis()+120000).apply()
  return code
 }
 @Synchronized fun pair(code:String): String {
  require(System.currentTimeMillis()<prefs.getLong("pair_until",0)) { "Pareamento expirado" }
  require(MessageDigest.isEqual(code.toByteArray(),prefs.getString("pair_code","")!!.toByteArray())) { "Código inválido" }
  val bytes=ByteArray(32);SecureRandom().nextBytes(bytes);val token=bytes.joinToString("") { "%02x".format(it) }
  prefs.edit().putString("token",token).remove("pair_code").remove("pair_until").commit()
  return token
 }
 fun authorized(header:String):Boolean {
  val token=prefs.getString("token","")!!
  return token.isNotEmpty() && MessageDigest.isEqual(header.toByteArray(),("Bearer "+token).toByteArray())
 }
 fun revoke() { prefs.edit().remove("token").remove("pair_code").remove("pair_until").putBoolean("send_enabled",false).commit() }
}
