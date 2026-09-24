package kr.co.aifect.app.karaoke;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.nio.*;
import java.nio.file.Files;

public class VocalEffectsTest {
    private VocalEffects.Settings settings(float echo,float room){return new VocalEffects.Settings(echo,room,.5f,1,1,.3f,0);}
    @Test public void bypassPreservesDryAndSilence(){
        VocalEffects fx=new VocalEffects(48000);
        for(int i=0;i<50000;i++){float dry=i<400?((i%17)-8)/10f:0;assertEquals(dry,fx.process(dry,settings(0,0)),0);}
    }
    @Test public void echoRepeatsAt235msAndDecays(){
        VocalEffects fx=new VocalEffects(48000);float[] result=new float[48000];
        for(int i=0;i<result.length;i++)result[i]=fx.process(i==0?.5f:0,settings(.5f,0));
        assertEquals(.25f,result[11280],.001f);assertEquals(.08f,result[22560],.001f);
        assertEquals(0,result[11000],0);assertTrue(result[33840]<result[22560]);
    }
    @Test public void roomHasDiffuseTailAndEventuallyDecays(){
        VocalEffects fx=new VocalEffects(48000);double early=0,late=0;int nonzero=0;
        for(int i=0;i<48000*5;i++){float v=fx.process(i==0?.5f:0,settings(0,.5f));if(i>1000&&i<48000){early+=v*v;if(Math.abs(v)>1e-6)nonzero++;}if(i>48000*4)late+=v*v;}
        assertTrue(nonzero>1000);assertTrue(early>.001);assertTrue(late<early*.0001);
    }
    @Test public void extremeSettingsAndBadSamplesStayFiniteAndBounded(){
        VocalEffects fx=new VocalEffects(48000);VocalEffects.Settings s=new VocalEffects.Settings(99,99,99,99,99,99,9999);
        assertEquals(.65f,s.echo,0);assertEquals(.8f,s.monitor,0);assertEquals(800,s.offsetMs);
        for(int i=0;i<100000;i++){float out=VocalEffects.limit(fx.process(i%99==0?Float.NaN:1,s)*2+1.5f);assertTrue(Float.isFinite(out));assertTrue(Math.abs(out)<=.991f);}
        assertEquals(0,VocalEffects.limit(Float.POSITIVE_INFINITY),0);
    }
    @Test public void syncOffsetsMoveVoiceWithoutChangingDryFile()throws Exception{
        File dir=Files.createTempDirectory("aifect-sync").toFile(),dry=new File(dir,"dry");byte[] raw=new byte[4800*2];raw[480*2+1]=32;Files.write(dry.toPath(),raw);
        try{
            float[] data=new float[1024];try(PcmFiles.VoiceReader reader=new PcmFiles.VoiceReader(dry,10)){reader.read(0,data,1024);assertEquals(.25f,data[0],0);}
            try(PcmFiles.VoiceReader reader=new PcmFiles.VoiceReader(dry,-10)){reader.read(0,data,1024);assertEquals(.25f,data[960],0);assertEquals(0,data[480],0);}
            assertArrayEquals(raw,Files.readAllBytes(dry.toPath()));
        }finally{dry.delete();dir.delete();}
    }
    @Test public void exportUsesEffectsKeepsOriginalAndFitsUploadLimit()throws Exception{
        File dir=Files.createTempDirectory("aifect-wav").toFile(),mr=new File(dir,"mr"),dry=new File(dir,"dry"),wav=new File(dir,"out.wav");
        byte[] original=new byte[48000*2];original[1]=32;Files.write(mr.toPath(),new byte[48000*4]);Files.write(dry.toPath(),original);
        try{
            PcmFiles.export(mr,dry,wav,settings(.5f,.2f));byte[] result=Files.readAllBytes(wav.toPath());ByteBuffer header=ByteBuffer.wrap(result).order(ByteOrder.LITTLE_ENDIAN);
            assertEquals(32000,header.getInt(24));assertEquals(2,header.getShort(22));assertEquals(128000,header.getInt(40));assertEquals(128044,result.length);
            assertTrue(header.getShort(44+7520*4)>1000);assertArrayEquals(original,Files.readAllBytes(dry.toPath()));
            assertTrue(44L+600*32000*4<80L*1024*1024);
        }finally{for(File f:dir.listFiles())f.delete();dir.delete();}
    }
    @Test public void resamplingPreservesFrameCountAndStereo()throws Exception{
        ByteArrayOutputStream out=new ByteArrayOutputStream();PcmFiles.Resampler r=new PcmFiles.Resampler(44100,48000,out);
        for(int i=0;i<44100;i++)r.accept(.1f,-.1f);
        assertTrue(Math.abs(48000-r.frames())<=1);byte[] b=out.toByteArray();assertTrue(PcmFiles.sample(b,40)>0);assertTrue(PcmFiles.sample(b,42)<0);
    }
    @Test public void sessionsCannotSendCookiesToOtherOrigins(){
        assertTrue(KaraokeApi.trustedOrigin("https://aifect.co.kr",false));assertTrue(KaraokeApi.trustedOrigin("http://localhost:4186",true));
        for(String origin:new String[]{null,"http://aifect.co.kr","https://aifect.co.kr.evil.test","https://aifect.co.kr@evil.test","https://aifect.co.kr/path","https://aifect.co.kr?x=1","https://aifect.co.kr:444"})assertFalse(origin,KaraokeApi.trustedOrigin(origin,true));
        assertFalse(KaraokeApi.trustedOrigin("http://localhost:4186",false));
    }
}
