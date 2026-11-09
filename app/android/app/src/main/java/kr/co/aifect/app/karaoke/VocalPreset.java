package kr.co.aifect.app.karaoke;
public final class VocalPreset {
 public static final String[] IDS={"original","karaoke","studio","hall"};
 public static final String[] NAMES={"원음","노래방","스튜디오","홀"};
 public static final String[] DESCRIPTIONS={"울림과 음색 보정 없이 담백하게","또렷하게 따라오는 에코와 중간 크기의 울림","짧고 깨끗한 울림에 밝고 또렷한 목소리","에코는 적고 넓은 공간에 길게 퍼지는 울림"};
 /** Values at 100% strength: echo, reverb amount, room size, tone. Each preset differs in a
  * way you can hear: karaoke is a small, warm room led by a clear echo; studio is short and
  * bright; hall has little echo and a long, wide tail. A reference "between karaoke and hall"
  * setting (echo 30%, reverb 100%, room 30%, tone -25%) sits between karaoke and hall. */
 private static final float[][] VALUES={{0,0,.5f,0},{.45f,.85f,.25f,-.15f},{.04f,.40f,.15f,.85f},{.10f,1f,1f,.10f}};
 /** A newly picked preset starts at its full designed strength. */
 public static final int DEFAULT_STRENGTH=100;
 private VocalPreset(){}
 public static int index(String id){for(int i=0;i<IDS.length;i++)if(IDS[i].equals(id))return i;return -1;}
 public static float[] values(String id,float strength){int i=index(id);if(i<0)i=0;float a=VocalEffects.clamp(strength,0,1),p[]=VALUES[i];return new float[]{p[0]*a,p[1]*a,p[2],p[3]*a};}
}
