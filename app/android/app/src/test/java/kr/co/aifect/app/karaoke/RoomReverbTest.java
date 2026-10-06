package kr.co.aifect.app.karaoke;

import org.junit.Test;
import static org.junit.Assert.*;

public class RoomReverbTest {
 @Test public void newMaximumIsHalfWetAndLegacySettingsMigrateOnlyOnce(){
  assertEquals(.5f,RoomReverb.gain(1),0);assertEquals(.05f,RoomReverb.gain(.1f),.000001f);
  assertEquals(32,RoomReverb.restorePercent(16,1));assertEquals(100,RoomReverb.restorePercent(50,1));
  assertEquals(100,RoomReverb.restorePercent(65,1));assertEquals(32,RoomReverb.restorePercent(32,2));
  assertEquals(.16f,RoomReverb.gain(VocalEffects.Settings.defaults().room),.000001f);
 }
 @Test public void everyPercentChangesOnlyWetLevelAndKeepsDryAttack(){
  double previous=-1;
  for(int percent:new int[]{0,1,2,5,10,11,25,50,100}){
   VocalEffects fx=new VocalEffects(48000);VocalEffects.Settings s=new VocalEffects.Settings(0,percent/100f,.5f,1,1,0,0);double energy=0;
   assertEquals(.5f,fx.process(.5f,s),0);
   for(int i=1;i<96000;i++){float v=fx.process(0,s);if(i<1900)assertEquals(0,v,0);energy+=v*v;}
   if(percent==0)assertEquals(0,energy,0);else assertTrue(energy>previous);previous=energy;
  }
 }
 @Test public void tenPercentHasOneTenthTheWetAmplitudeOfMaximum(){
  VocalEffects quiet=new VocalEffects(48000),full=new VocalEffects(48000);
  VocalEffects.Settings q=new VocalEffects.Settings(0,.1f,.5f,1,1,0,0),f=new VocalEffects.Settings(0,1,.5f,1,1,0,0);
  for(int i=0;i<96000;i++){float input=i==0?.5f:0,a=quiet.process(input,q),b=full.process(input,f);if(i>0)assertEquals(b*.1f,a,.000001f);}
 }
 @Test public void roomTailDecaysAndRejectsNonFiniteInput(){
  for(int rate:new int[]{32000,48000}){RoomReverb room=new RoomReverb(rate);double early=0,late=0;
   for(int i=0;i<rate*5;i++){float v=room.process(i==0?1:0,1);assertTrue(Float.isFinite(v));if(i<rate)early+=v*v;if(i>=rate*4)late+=v*v;}
   assertTrue(early>0);assertTrue(late<early*.00001);assertTrue(Float.isFinite(room.process(Float.NaN,.5f)));
  }
 }
}
