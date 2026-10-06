package kr.co.aifect.app.karaoke;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import java.io.*;
import java.nio.file.*;

/** A generated AAC tone; no network, account, or microphone. */
@RunWith(AndroidJUnit4.class)
public class BackingStreamTest {
 @Test public void compressedBackingSeeksAndExportsWithoutWholePcmFile()throws Exception{
  File dir=new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(),"backing-stream");assertTrue(dir.isDirectory()||dir.mkdirs());File source=new File(dir,"mr.m4a"),dry=new File(dir,"voice.pcm"),saved=new File(dir,"cover.wav");
  try{
   try(InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("backing-test.m4a")){Files.copy(in,source.toPath(),StandardCopyOption.REPLACE_EXISTING);}
   long frames=BackingDecoder.frames(source);assertEquals(12,frames/(double)PcmFiles.RATE,.05);
   ByteArrayOutputStream full=new ByteArrayOutputStream();long begin=System.nanoTime();
   try(InputStream in=BackingDecoder.open(source,0)){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1)full.write(buffer,0,n);}
   byte[] decoded=full.toByteArray();assertEquals(12,decoded.length/4.0/PcmFiles.RATE,.05);
   assertTrue("Only compressed backing is stored",source.length()<decoded.length/5);assertFalse(new File(dir,"mr.pcm").exists());
   for(int second:new int[]{2,7,10})try(InputStream in=BackingDecoder.open(source,(long)second*PcmFiles.RATE)){
    byte[] part=new byte[PcmFiles.RATE/4*4];assertEquals(part.length,PcmFiles.read(in,part,part.length));
    double mse=0;for(int i=1024;i<part.length;i+=2){double difference=(PcmFiles.sample(part,i)-PcmFiles.sample(decoded,second*PcmFiles.RATE*4+i))/32768.0;mse+=difference*difference;}
    assertTrue("Seek matches original timeline at "+second+" seconds: "+Math.sqrt(mse/(part.length/2-512)),Math.sqrt(mse/(part.length/2-512))<.025);
   }
   Files.write(dry.toPath(),new byte[PcmFiles.RATE*2*2]);BackingDecoder.export(source,dry,saved,new VocalEffects.Settings(0,0,.5f,1,1,0,0));assertEquals(44+PcmFiles.EXPORT_RATE*4*2,saved.length());
   android.util.Log.i("AifectBackingTest","compressed_bytes="+source.length()+" decoded_bytes="+decoded.length+" test_ms="+(System.nanoTime()-begin)/1_000_000);
  }finally{for(File file:dir.listFiles())file.delete();dir.delete();}
 }
}
