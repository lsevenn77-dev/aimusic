package kr.co.aifect.app.karaoke;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.nio.file.Files;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

public class DuetMixTest {
 @Test public void exportKeepsPartnerAndBackingAfterNewVoiceStops()throws Exception{
  File folder=Files.createTempDirectory("aifect-duet-mix").toFile(),dry=new File(folder,"voice.pcm"),out=new File(folder,"duet.wav");
  int frames=PcmFiles.RATE;byte[] backing=new byte[frames*4],voice=new byte[frames];
  for(int i=0;i<frames;i++){short first=(short)(2000*Math.sin(i*2*Math.PI*300/PcmFiles.RATE)+1000*Math.sin(i*2*Math.PI*900/PcmFiles.RATE));backing[i*4]=(byte)first;backing[i*4+1]=(byte)(first>>8);backing[i*4+2]=(byte)first;backing[i*4+3]=(byte)(first>>8);if(i<frames/2){short second=(short)(1200*Math.sin(i*2*Math.PI*600/PcmFiles.RATE));voice[i*2]=(byte)second;voice[i*2+1]=(byte)(second>>8);}}
  try{
   Files.write(dry.toPath(),voice);PcmFiles.export(new ByteArrayInputStream(backing),frames,dry,out,new VocalEffects.Settings(0,0,.5f,1,1,0,0,0,0));
   byte[] wav=Files.readAllBytes(out.toPath());ByteBuffer bytes=ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN);
   assertEquals(PcmFiles.EXPORT_RATE*4,bytes.getInt(40));
   double earlyNew=amplitude(bytes,600,.1,.4),lateNew=amplitude(bytes,600,.6,.9),lateFirst=amplitude(bytes,300,.6,.9),lateMr=amplitude(bytes,900,.6,.9);
   assertTrue(earlyNew>900);assertTrue(lateNew<10);assertTrue(lateFirst>1800);assertTrue(lateMr>800);
  }finally{for(File f:folder.listFiles())f.delete();folder.delete();}
 }
 private double amplitude(ByteBuffer wav,int frequency,double from,double to){int a=(int)(from*PcmFiles.EXPORT_RATE),b=(int)(to*PcmFiles.EXPORT_RATE);double re=0,im=0;for(int i=a;i<b;i++){double sample=wav.getShort(44+i*4);double phase=i*2*Math.PI*frequency/PcmFiles.EXPORT_RATE;re+=sample*Math.cos(phase);im+=sample*Math.sin(phase);}return Math.hypot(re,im)*2/(b-a);}
}
