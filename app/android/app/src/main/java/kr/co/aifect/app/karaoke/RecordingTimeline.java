package kr.co.aifect.app.karaoke;

import java.io.*;
import java.nio.file.*;
import java.util.*;

/** A take is on the song timeline. Pauses add no silence; punch-in replaces the selected tail. */
public final class RecordingTimeline {
 private RecordingTimeline(){}
 public static long frames(File dry){return dry.length()/2;}
 public static void commit(File dry,File segment,long start,long count,int advanceMs)throws IOException{
  if(start<0||count<0||start+count>(long)PcmFiles.RATE*PcmFiles.MAX_SECONDS)throw new IOException("녹음 구간을 확인해주세요.");
  if(count==0)return;
  File next=new File(dry.getParentFile(),"voice-next.pcm");
  try(RandomAccessFile old=new RandomAccessFile(dry,"rw");OutputStream out=new BufferedOutputStream(new FileOutputStream(next));PcmFiles.VoiceReader voice=new PcmFiles.VoiceReader(segment,advanceMs)){
   byte[] buffer=new byte[2048];long prefix=start*2;
   while(prefix>0){int size=(int)Math.min(prefix,buffer.length);Arrays.fill(buffer,(byte)0);int read=old.read(buffer,0,size);if(read<0)read=0;out.write(buffer,0,size);prefix-=size;}
   float[] samples=new float[1024];long at=0;
   while(at<count){int n=(int)Math.min(samples.length,count-at);voice.read(at,samples,n);for(int i=0;i<n;i++){int value=Math.round(samples[i]*32768);buffer[i*2]=(byte)value;buffer[i*2+1]=(byte)(value>>8);}out.write(buffer,0,n*2);at+=n;}
  }
  try{Files.move(next.toPath(),dry.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}
  catch(AtomicMoveNotSupportedException e){Files.move(next.toPath(),dry.toPath(),StandardCopyOption.REPLACE_EXISTING);}
 }
 /** Device timestamps share MONOTONIC time. Output start minus input start is the capture advance. */
 public static int delayMs(long outputFrame,long outputNs,long inputFrame,long inputNs){
  double outZero=outputNs-outputFrame*1e9/PcmFiles.RATE,inZero=inputNs-inputFrame*1e9/PcmFiles.RATE;
  return (int)Math.round((outZero-inZero)/1e6);
 }
 public static final class DelayEstimate {
  private final ArrayList<Integer> values=new ArrayList<>();
  public void add(int ms){if(ms>=-300&&ms<=800){values.add(ms);if(values.size()>25)values.remove(0);}}
  public boolean reliable(){if(values.size()<5)return false;ArrayList<Integer> sorted=new ArrayList<>(values);Collections.sort(sorted);return sorted.get(sorted.size()*3/4)-sorted.get(sorted.size()/4)<=15;}
  public int median(){ArrayList<Integer> sorted=new ArrayList<>(values);Collections.sort(sorted);return sorted.isEmpty()?80:sorted.get(sorted.size()/2);}
 }
}
