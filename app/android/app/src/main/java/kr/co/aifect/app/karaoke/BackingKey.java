package kr.co.aifect.app.karaoke;

import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.audio.SonicAudioProcessor;
import java.io.*;
import java.nio.*;
import java.nio.file.*;

/** Offline backing-only transposition; microphone PCM and its timeline are untouched. */
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
final class BackingKey {
 static float ratio(int semitones){if(semitones < -6 || semitones > 6)throw new IllegalArgumentException("key");return (float)Math.pow(2,semitones/12.0);}
 static File prepare(File source,File directory,int key)throws Exception{
  checkCancelled();ratio(key);
  if(key==0)return source;
  File target=new File(directory,"key-"+key+".pcm");
  long bytes=BackingDecoder.frames(source)*4;
  if(target.length()==bytes)return target;
  File partial=File.createTempFile("key-render-",".part",directory);
  SonicAudioProcessor processor=new SonicAudioProcessor();processor.setSpeed(1f);processor.setPitch(ratio(key));
  processor.configure(new AudioProcessor.AudioFormat(PcmFiles.RATE,2,C.ENCODING_PCM_16BIT));processor.flush();
  long written=0;
  try(InputStream in=BackingDecoder.open(source,0);OutputStream out=new BufferedOutputStream(new FileOutputStream(partial),65536)){
   byte[] chunk=new byte[32768];ByteBuffer input=ByteBuffer.allocateDirect(chunk.length).order(ByteOrder.nativeOrder());
   int n;
   while((n=PcmFiles.read(in,chunk,chunk.length))>0){
    checkCancelled();input.clear();input.put(chunk,0,n-n%4).flip();processor.queueInput(input);
    written+=drain(processor,out,bytes-written,chunk);
   }
   processor.queueEndOfStream();written+=drain(processor,out,bytes-written,chunk);
   // Preserve exactly the original frame count for seek, lyrics, punch-in and export.
   java.util.Arrays.fill(chunk,(byte)0);
   while(written<bytes){checkCancelled();int count=(int)Math.min(chunk.length,bytes-written);out.write(chunk,0,count);written+=count;}
  }catch(Exception e){partial.delete();throw e;}finally{processor.reset();}
  try{checkCancelled();Files.move(partial.toPath(),target.toPath(),StandardCopyOption.REPLACE_EXISTING);return target;}finally{partial.delete();}
 }
 private static long drain(SonicAudioProcessor processor,OutputStream out,long remaining,byte[] chunk)throws IOException{
  ByteBuffer output=processor.getOutput();long written=0;
  while(output.hasRemaining()){checkCancelled();int n=Math.min(chunk.length,output.remaining());output.get(chunk,0,n);int keep=(int)Math.min(n,Math.max(0,remaining-written));out.write(chunk,0,keep);written+=keep;}
  return written;
 }
 private static void checkCancelled()throws InterruptedIOException{if(Thread.currentThread().isInterrupted())throw new InterruptedIOException("새 키 선택으로 이전 처리를 취소했어요.");}
 private BackingKey(){}
}
