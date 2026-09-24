package kr.co.aifect.app;
import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Session and pending login verifier are encrypted by a non-exportable Android Keystore key. */
public final class NativeSession {
 private static SecretKey key() throws Exception {
  KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
  if(store.containsAlias("aifect.session"))return (SecretKey)store.getKey("aifect.session",null);
  KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
  generator.init(new KeyGenParameterSpec.Builder("aifect.session",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
   .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
  return generator.generateKey();
 }
 private static JSONObject read(Context c) {
  try {
   String raw=c.getSharedPreferences("native_session",0).getString("vault","");
   if(raw.isEmpty())return new JSONObject();
   String[] parts=raw.split(":");Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
   cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));
   return new JSONObject(new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),java.nio.charset.StandardCharsets.UTF_8));
  }catch(Exception e){return new JSONObject();}
 }
 public static synchronized String get(Context c,String name){return read(c).optString(name,"");}
 public static synchronized String cookie(Context c){return get(c,"cookie");}
 public static synchronized void put(Context c,String name,String value){
  try {
   JSONObject data=read(c);data.put(name,value);
   Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
   String raw=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(data.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)),Base64.NO_WRAP);
   if(!c.getSharedPreferences("native_session",0).edit().putString("vault",raw).commit())throw new IllegalStateException("저장 실패");
  }catch(Exception e){throw new IllegalStateException("로그인 정보를 안전하게 저장하지 못했어요.",e);}
 }
}
