package kr.co.aifect.app.karaoke;
import org.junit.Test;import static org.junit.Assert.*;
public class VocalPresetTest {
 @Test public void presetsAreDistinctAndStrengthZeroPreservesDry(){
  java.util.Set<String> values=new java.util.HashSet<>();for(String id:VocalPreset.IDS){float[] p=VocalPreset.values(id,.5f);values.add(java.util.Arrays.toString(p));float[] z=VocalPreset.values(id,0);assertEquals(0,z[0]+z[1]+z[3],0);}
  assertEquals(4,values.size());VocalEffects fx=new VocalEffects(48000);VocalEffects.Settings off=new VocalEffects.Settings(0,0,.5f,1,1,0,0,0,0);for(int i=0;i<48000;i++){float x=(float)Math.sin(i*.01)*.3f;assertEquals(x,fx.process(x,off),0);}
 }
 private double component(float[] samples,int hz){double a=0,b=0;for(int i=48000;i<samples.length;i++){a+=samples[i]*Math.cos(i*2*Math.PI*hz/48000);b+=samples[i]*Math.sin(i*2*Math.PI*hz/48000);}return 2*Math.hypot(a,b)/48000;}
 @Test public void loudRumbleIsReducedDuringVoiceWithoutErasingItsHarmonics(){
  NoiseCleaner f=new NoiseCleaner(48000);float[] input=new float[96000],out=new float[96000];for(int i=0;i<input.length;i++){input[i]=(float)(.3*Math.sin(i*2*Math.PI*35/48000)+.15*Math.sin(i*2*Math.PI*220/48000)+.07*Math.sin(i*2*Math.PI*440/48000));out[i]=f.process(input[i],4);}
  assertTrue(component(out,35)<component(input,35)*.08);assertTrue(component(out,220)>component(input,220)*.85);assertTrue(component(out,440)>component(input,440)*.95);
 }
 @Test public void presetChangesAreFiniteAndToneReducesLoudSoftDifference(){
  VocalTone tone=new VocalTone(48000);double quiet=0,loud=0;for(int i=0;i<192000;i++){float x=(float)Math.sin(i*2*Math.PI*440/48000)*(i<96000?.05f:.5f);float y=tone.process(x,1);assertTrue(Float.isFinite(y));if(i>=48000&&i<96000)quiet+=y*y;if(i>=144000)loud+=y*y;}assertTrue(Math.sqrt(loud/quiet)<7);
  VocalEffects fx=new VocalEffects(48000);for(int n=0;n<12;n++){float[] p=VocalPreset.values(VocalPreset.IDS[n%4],1);VocalEffects.Settings settings=new VocalEffects.Settings(p[0],p[1],p[2],1,1,0,0,n%5,p[3]);for(int i=0;i<12000;i++)assertTrue(Float.isFinite(fx.process((float)Math.sin(i*.1)*.5f,settings)));}
 }
}
