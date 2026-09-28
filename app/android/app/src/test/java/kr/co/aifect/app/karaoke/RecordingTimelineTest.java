package kr.co.aifect.app.karaoke;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.nio.*;
import java.nio.file.*;

public class RecordingTimelineTest {
 private byte[] pcm(int samples,int value){byte[] b=new byte[samples*2];ByteBuffer buffer=ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN);while(buffer.hasRemaining())buffer.putShort((short)value);return b;}
 @Test public void resumeAppendsWithoutPausedGapAndPunchInOnlyKeepsPrefix()throws Exception{
  File dir=Files.createTempDirectory("take-edit").toFile(),dry=new File(dir,"dry"),segment=new File(dir,"segment");
  try{Files.write(dry.toPath(),pcm(48000,1000));Files.write(segment.toPath(),pcm(24000,2000));
   RecordingTimeline.commit(dry,segment,48000,24000,0);assertEquals(72000,RecordingTimeline.frames(dry));
   byte[] b=Files.readAllBytes(dry.toPath());assertEquals(1000,PcmFiles.sample(b,47999*2));assertEquals(2000,PcmFiles.sample(b,48000*2));
   RecordingTimeline.commit(dry,segment,24000,12000,0);b=Files.readAllBytes(dry.toPath());assertEquals(36000,RecordingTimeline.frames(dry));assertEquals(1000,PcmFiles.sample(b,23999*2));assertEquals(2000,PcmFiles.sample(b,24000*2));
   byte[] previous=b.clone();RecordingTimeline.commit(dry,segment,0,0,80);assertArrayEquals(previous,Files.readAllBytes(dry.toPath()));
  }finally{for(File f:dir.listFiles())f.delete();dir.delete();}
 }
 @Test public void deviceTimestampDifferenceAndConfidenceRejectUnstableClocks(){
  assertEquals(120,RecordingTimeline.delayMs(48000,2_120_000_000L,48000,2_000_000_000L));
  assertEquals(80,RecordingTimeline.delayMs(96000,3_080_000_000L,48000,2_000_000_000L));
  RecordingTimeline.DelayEstimate e=new RecordingTimeline.DelayEstimate();for(int n:new int[]{118,120,119,121,120,800})e.add(n);assertTrue(e.reliable());assertEquals(120,e.median());
  RecordingTimeline.DelayEstimate jitter=new RecordingTimeline.DelayEstimate();for(int n:new int[]{0,200,400,600,800})jitter.add(n);assertFalse(jitter.reliable());
 }
 @Test public void alignmentMovesLateInputAndShortExportStopsAtTakeEnd()throws Exception{
  File dir=Files.createTempDirectory("take-trim").toFile(),dry=new File(dir,"dry"),segment=new File(dir,"segment"),mr=new File(dir,"mr"),wav=new File(dir,"out.wav");
  try{byte[] raw=pcm(48000,0);raw[4800*2+1]=32;Files.write(segment.toPath(),raw);RecordingTimeline.commit(dry,segment,0,24000,100);assertEquals(8192,PcmFiles.sample(Files.readAllBytes(dry.toPath()),0));
   Files.write(mr.toPath(),new byte[48000*4*3]);PcmFiles.export(mr,dry,wav,new VocalEffects.Settings(0,0,.5f,1,1,0,0));
   byte[] result=Files.readAllBytes(wav.toPath());assertEquals(64000,ByteBuffer.wrap(result).order(ByteOrder.LITTLE_ENDIAN).getInt(40));assertEquals(64044,result.length);
   assertArrayEquals(raw,Files.readAllBytes(segment.toPath()));
  }finally{for(File f:dir.listFiles())f.delete();dir.delete();}
 }
}
