package kr.co.aifect.app.karaoke;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.util.concurrent.*;

public class AudioPipeTest {
 @Test public void partialCodecBlockWakesWaitingReaderWithoutFillingPipe()throws Exception{
  AudioPipe pipe=new AudioPipe(131072);ExecutorService executor=Executors.newSingleThreadExecutor();
  CountDownLatch ready=new CountDownLatch(1);
  try{Future<Integer> read=executor.submit(()->{ready.countDown();return pipe.read(new byte[8192],0,8192);});ready.await();
   // Deliberately leave the reader waiting on an empty pipe, as at a decoder boundary.
   Thread.sleep(40);pipe.write(new byte[4096],0,4096);assertEquals(4096,(int)read.get(400,TimeUnit.MILLISECONDS));
  }finally{pipe.close();executor.shutdownNow();}
 }
 @Test public void wraparoundAndBackpressurePreserveAllFrames()throws Exception{
  AudioPipe pipe=new AudioPipe(1000);byte[] original=new byte[50003];for(int i=0;i<original.length;i++)original[i]=(byte)(i*37);
  ExecutorService executor=Executors.newSingleThreadExecutor();
  try{Future<?> writer=executor.submit(()->{try{pipe.write(original,0,original.length);pipe.finish(null);}catch(IOException e){throw new UncheckedIOException(e);}});
   ByteArrayOutputStream all=new ByteArrayOutputStream();byte[] block=new byte[307];int n;while((n=pipe.read(block))!=-1)all.write(block,0,n);
   writer.get(2,TimeUnit.SECONDS);assertArrayEquals(original,all.toByteArray());
  }finally{pipe.close();executor.shutdownNow();}
 }
 @Test public void closeUnblocksFullProducerAndFailuresFollowBufferedFrames()throws Exception{
  AudioPipe pipe=new AudioPipe(8);ExecutorService executor=Executors.newSingleThreadExecutor();
  try{pipe.write(new byte[8],0,8);Future<Boolean> result=executor.submit(()->{try{pipe.write(new byte[1],0,1);return false;}catch(IOException expected){return true;}});
   pipe.close();assertTrue(result.get(400,TimeUnit.MILLISECONDS));
   AudioPipe failed=new AudioPipe(8);failed.write(new byte[]{3,4},0,2);failed.finish(new IOException("decode failed"));assertEquals(3,failed.read());assertEquals(4,failed.read());
   try{failed.read();fail();}catch(IOException e){assertEquals("decode failed",e.getMessage());}
  }finally{executor.shutdownNow();}
 }
 @Test public void captureDoesNotWaitOnSlowStorageAndFlushesEverySample()throws Exception{
  CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);ByteArrayOutputStream all=new ByteArrayOutputStream();
  OutputStream slow=new OutputStream(){public void write(int b){all.write(b);}public void write(byte[] b,int off,int n)throws IOException{entered.countDown();try{if(!release.await(2,TimeUnit.SECONDS))throw new IOException("test timeout");}catch(InterruptedException e){throw new IOException(e);}all.write(b,off,n);}};
  TakeWriter writer=new TakeWriter(slow);byte[] a=new byte[8192],b=new byte[9600];java.util.Arrays.fill(a,(byte)5);java.util.Arrays.fill(b,(byte)7);
  try{writer.write(a,0,a.length);assertTrue(entered.await(1,TimeUnit.SECONDS));long start=System.nanoTime();writer.write(b,0,b.length);assertTrue("Audio thread must not wait for file I/O",System.nanoTime()-start<100_000_000L);
  }finally{release.countDown();writer.close();}
  byte[] expected=new byte[a.length+b.length];System.arraycopy(a,0,expected,0,a.length);System.arraycopy(b,0,expected,a.length,b.length);assertArrayEquals(expected,all.toByteArray());
 }
 @Test public void captureOverflowIsExplicitAndNeverOverwritesQueuedSamples()throws Exception{
  AudioPipe pipe=new AudioPipe(4);assertTrue(pipe.offer(new byte[]{1,2,3},0,3));assertFalse(pipe.offer(new byte[]{7,8},0,2));pipe.finish(null);
  assertArrayEquals(new byte[]{1,2,3},pipe.readAllBytes());
 }
}
