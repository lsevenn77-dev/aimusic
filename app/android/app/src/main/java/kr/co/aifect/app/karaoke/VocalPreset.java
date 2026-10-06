package kr.co.aifect.app.karaoke;
public final class VocalPreset {
 public static final String[] IDS={"original","karaoke","studio","hall"};
 public static final String[] NAMES={"원음","노래방","스튜디오","홀"};
 public static final String[] DESCRIPTIONS={"울림과 음색 보정 없이 담백하게","익숙한 에코와 풍성한 울림","또렷한 목소리와 짧고 부드러운 울림","넓은 공간에서 부르는 듯한 긴 울림"};
 private static final float[][] VALUES={{0,0,.5f,0},{.24f,.65f,.55f,.65f},{.025f,.3f,.15f,1},{.07f,.9f,.95f,.7f}};
 private VocalPreset(){}
 public static int index(String id){for(int i=0;i<IDS.length;i++)if(IDS[i].equals(id))return i;return -1;}
 public static float[] values(String id,float strength){int i=index(id);if(i<0)i=0;float a=VocalEffects.clamp(strength,0,1),p[]=VALUES[i];return new float[]{p[0]*a,p[1]*a,p[2],p[3]*a};}
}
