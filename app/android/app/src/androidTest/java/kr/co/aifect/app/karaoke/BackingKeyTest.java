package kr.co.aifect.app.karaoke;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.*;
import java.nio.*;
import java.nio.file.*;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Verifies pitch, timeline and cancellation with generated audio, no mic or account. */
@RunWith(AndroidJUnit4.class)
public class BackingKeyTest {
 @Test public void transposesBothDirectionsWithoutMovingTheTimeline()throws Exception{
  File dir=Files.createTempDirectory(InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir().toPath(),"key-test").toFile();
  try{
   File original=new File(dir,"original.pcm");ByteBuffer data=ByteBuffer.allocate(PcmFiles.RATE*4*4).order(ByteOrder.LITTLE_ENDIAN);
   for(int f=0;f<PcmFiles.RATE*4;f++){short sample=(short)(Math.sin(f*2*Math.PI*440/PcmFiles.RATE)*10000);data.putShort(sample).putShort(sample);}
   Files.write(original.toPath(),data.array());
   assertEquals(original,BackingKey.prepare(original,dir,0));
   for(int key:new int[]{-6,6}){
    File shifted=BackingKey.prepare(original,dir,key);assertEquals(original.length(),shifted.length());
    byte[] pcm=Files.readAllBytes(shifted.toPath());int crossings=0;
    for(int f=PcmFiles.RATE;f<PcmFiles.RATE*3;f++)if(PcmFiles.sample(pcm,(f-1)*4)<=0&&PcmFiles.sample(pcm,f*4)>0)crossings++;
    assertEquals(440*BackingKey.ratio(key),crossings/2.0,3);
    assertEquals(shifted,BackingKey.prepare(original,dir,key));
   }
   assertArrayEquals(data.array(),Files.readAllBytes(original.toPath()));
   Thread.currentThread().interrupt();try{BackingKey.prepare(original,dir,3);fail("Cancelled job must not publish an output");}catch(InterruptedIOException expected){}finally{Thread.interrupted();}
   assertFalse(new File(dir,"key-3.pcm").exists());assertEquals(0,dir.listFiles(f->f.getName().endsWith(".part")).length);
  }finally{for(File file:dir.listFiles())file.delete();dir.delete();}
 }
 @Test public void compressedBackingKeepsItsOriginalDuration()throws Exception{
  File dir=Files.createTempDirectory(InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir().toPath(),"key-aac-test").toFile();
  try{File source=new File(dir,"mr.m4a");try(InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("backing-test.m4a")){Files.copy(in,source.toPath());}
   File result=BackingKey.prepare(source,dir,2);assertEquals(BackingDecoder.frames(source)*4,result.length());assertTrue(result.length()>0);
  }finally{for(File file:dir.listFiles())file.delete();dir.delete();}
 }
}
