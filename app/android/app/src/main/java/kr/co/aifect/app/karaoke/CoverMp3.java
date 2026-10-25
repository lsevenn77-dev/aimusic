package kr.co.aifect.app.karaoke;

import java.io.*;
import java.nio.*;
import java.nio.file.*;

/** Final cover export: bounded memory, CBR 256 kbps, gapless Info/LAME timing. */
final class CoverMp3 {
 static { System.loadLibrary("aifect_mp3"); }
 private static native long create(int rate,int frames);
 private static native int encode(long encoder,short[] pcm,int frames,byte[] output);
 private static native int flush(long encoder,byte[] output);
 private static native byte[] tag(long encoder);
 private static native void close(long encoder);
 static void export(File wav,File output)throws IOException {
  File partial=new File(output.getPath()+".part");long encoder=0;
  try(RandomAccessFile source=new RandomAccessFile(wav,"r");RandomAccessFile target=new RandomAccessFile(partial,"rw")){
   byte[] header=new byte[44];source.readFully(header);ByteBuffer h=ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
   if(h.getInt(0)!=0x46464952||h.getInt(8)!=0x45564157||h.getInt(12)!=0x20746d66||h.getInt(16)!=16||h.getShort(20)!=1||h.getShort(22)!=2||h.getShort(34)!=16||h.getInt(36)!=0x61746164)throw new IOException("변환할 녹음 형식을 확인해주세요.");
   int rate=h.getInt(24),bytes=h.getInt(40);if(rate!=32000||bytes<4||bytes%4!=0||bytes/4L>rate*600L||wav.length()!=44L+bytes)throw new IOException("변환할 녹음 길이를 확인해주세요.");
   encoder=create(rate,bytes/4);if(encoder==0)throw new IOException("MP3 변환을 시작하지 못했어요.");
   target.setLength(0);byte[] raw=new byte[4608],encoded=new byte[16384];short[] samples=new short[2304];
   for(int remaining=bytes;remaining>0;){
    if(Thread.currentThread().isInterrupted())throw new InterruptedIOException();int count=Math.min(raw.length,remaining);source.readFully(raw,0,count);
    ByteBuffer.wrap(raw,0,count).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(samples,0,count/2);
    int n=encode(encoder,samples,count/4,encoded);if(n<0)throw new IOException("MP3 변환을 완료하지 못했어요.");target.write(encoded,0,n);remaining-=count;
   }
   int n=flush(encoder,encoded);if(n<0)throw new IOException("MP3 파일을 마무리하지 못했어요.");target.write(encoded,0,n);
   byte[] tag=tag(encoder);if(tag==null)throw new IOException("MP3 재생 시간 정보를 저장하지 못했어요.");target.seek(0);target.write(tag);target.getFD().sync();
  }catch(IOException|RuntimeException e){partial.delete();throw e;}finally{if(encoder!=0)close(encoder);}
  try{Files.move(partial.toPath(),output.toPath(),StandardCopyOption.REPLACE_EXISTING);}finally{partial.delete();}
 }
}
