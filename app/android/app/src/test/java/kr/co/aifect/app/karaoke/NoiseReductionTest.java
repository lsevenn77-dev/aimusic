package kr.co.aifect.app.karaoke;
import org.junit.Test;
import static org.junit.Assert.*;
public class NoiseReductionTest {
 private double rms(int level,float amplitude){VocalEffects fx=new VocalEffects(48000);VocalEffects.Settings settings=new VocalEffects.Settings(0,0,.5f,1,1,0,0,level);double sum=0;for(int i=0;i<96000;i++){float sample=(float)Math.sin(i*2*Math.PI*440/48000)*amplitude;float out=fx.process(sample,settings);if(i>=48000)sum+=out*out;}return Math.sqrt(sum/48000);}
 @Test public void fourLevelsReduceQuietNoiseAndPreserveSinging(){double previous=rms(0,.002f);for(int level=1;level<=4;level++){double next=rms(level,.002f);assertTrue("Each level reduces more quiet noise",next<previous);previous=next;assertEquals("Audible voice retains level",rms(0,.3f),rms(level,.3f),.002);}assertTrue(previous<rms(0,.002f)*.03);}
}
