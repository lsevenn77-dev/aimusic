package kr.co.aifect.app.karaoke;

import android.content.SharedPreferences;

/** The singer's effect choice outlives one take: the next recording opens with the same effect,
 * and 사용자 설정 keeps its own values even after trying 홀 or 노래방 in between. Stored per device. */
final class EffectMemory {
 static final String FILE="karaoke_effects";
 static final String DEFAULT_PRESET="studio";
 private EffectMemory(){}
 static String preset(SharedPreferences p){return validPreset(p.getString("preset",DEFAULT_PRESET));}
 static String validPreset(String id){return "custom".equals(id)||VocalPreset.index(id)>=0?id:DEFAULT_PRESET;}
 static int strength(SharedPreferences p){return clamp(p.getInt("strength",VocalPreset.DEFAULT_STRENGTH),0,100);}
 /** The singer's own 사용자 설정 slider positions, or null until they have made one. */
 static int[] custom(SharedPreferences p){
  if(!p.contains("customEcho"))return null;
  return sanitize(new int[]{p.getInt("customEcho",0),p.getInt("customRoom",0),p.getInt("customSize",50),p.getInt("customTone",100)});
 }
 /** echo 0–65, reverb 0–100, room 0–100, tone slider 0–300 (100 is 0%). */
 static int[] sanitize(int[] v){return new int[]{clamp(v[0],0,65),clamp(v[1],0,100),clamp(v[2],0,100),clamp(v[3],0,300)};}
 static void save(SharedPreferences p,String preset,int strength,int[] custom){
  SharedPreferences.Editor e=p.edit().putString("preset",validPreset(preset)).putInt("strength",clamp(strength,0,100));
  if(custom!=null){int[] c=sanitize(custom);e.putInt("customEcho",c[0]).putInt("customRoom",c[1]).putInt("customSize",c[2]).putInt("customTone",c[3]);}
  e.apply();
 }
 private static int clamp(int v,int lo,int hi){return Math.max(lo,Math.min(hi,v));}
}
