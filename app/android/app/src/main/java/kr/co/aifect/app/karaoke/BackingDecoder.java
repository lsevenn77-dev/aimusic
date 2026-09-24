package kr.co.aifect.app.karaoke;

import android.media.*;
import java.io.*;
import java.nio.*;

/** Decode downloaded MR to a bounded local PCM file; never buffers the whole song in RAM. */
final class BackingDecoder {
    static void decode(File source,File target)throws Exception{
        MediaExtractor extractor=new MediaExtractor();MediaCodec codec=null;
        try(OutputStream out=new BufferedOutputStream(new FileOutputStream(target))){
            extractor.setDataSource(source.getAbsolutePath());MediaFormat format=null;
            for(int i=0;i<extractor.getTrackCount();i++){
                MediaFormat f=extractor.getTrackFormat(i);
                if(f.getString(MediaFormat.KEY_MIME).startsWith("audio/")){format=f;extractor.selectTrack(i);break;}
            }
            if(format==null)throw new IOException("반주 오디오를 찾을 수 없어요.");
            codec=MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME));codec.configure(format,null,null,0);codec.start();
            MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();boolean inputDone=false,outputDone=false;
            int rate=format.getInteger(MediaFormat.KEY_SAMPLE_RATE),channels=format.getInteger(MediaFormat.KEY_CHANNEL_COUNT),encoding=AudioFormat.ENCODING_PCM_16BIT;
            PcmFiles.Resampler resampler=null;long lastProgress=System.nanoTime();
            while(!outputDone){
                if(Thread.currentThread().isInterrupted())throw new InterruptedIOException();
                if(System.nanoTime()-lastProgress>20_000_000_000L)throw new IOException("반주를 해석하는 시간이 초과됐어요.");
                if(!inputDone){int at=codec.dequeueInputBuffer(10000);if(at>=0){
                    ByteBuffer input=codec.getInputBuffer(at);int n=extractor.readSampleData(input,0);
                    if(n<0){codec.queueInputBuffer(at,0,0,0,MediaCodec.BUFFER_FLAG_END_OF_STREAM);inputDone=true;}
                    else{codec.queueInputBuffer(at,0,n,extractor.getSampleTime(),0);extractor.advance();}
                }}
                int at=codec.dequeueOutputBuffer(info,10000);
                if(at==MediaCodec.INFO_OUTPUT_FORMAT_CHANGED){
                    MediaFormat decoded=codec.getOutputFormat();
                    int newRate=decoded.getInteger(MediaFormat.KEY_SAMPLE_RATE),newChannels=decoded.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                    if(resampler!=null&&(rate!=newRate||channels!=newChannels))throw new IOException("반주 형식이 중간에 바뀌었어요.");
                    rate=newRate;channels=newChannels;encoding=decoded.containsKey(MediaFormat.KEY_PCM_ENCODING)?decoded.getInteger(MediaFormat.KEY_PCM_ENCODING):AudioFormat.ENCODING_PCM_16BIT;
                    if(channels<1||channels>2||!(encoding==AudioFormat.ENCODING_PCM_16BIT||encoding==AudioFormat.ENCODING_PCM_FLOAT))throw new IOException("지원하지 않는 반주 형식이에요.");
                }else if(at>=0){
                    lastProgress=System.nanoTime();
                    ByteBuffer b=codec.getOutputBuffer(at).order(ByteOrder.LITTLE_ENDIAN);b.position(info.offset);b.limit(info.offset+info.size);
                    if(resampler==null)resampler=new PcmFiles.Resampler(rate,PcmFiles.RATE,out);
                    int frameBytes=channels*(encoding==AudioFormat.ENCODING_PCM_FLOAT?4:2);
                    while(b.remaining()>=frameBytes){
                        float l=encoding==AudioFormat.ENCODING_PCM_FLOAT?b.getFloat():b.getShort()/32768f;
                        float r=channels==1?l:encoding==AudioFormat.ENCODING_PCM_FLOAT?b.getFloat():b.getShort()/32768f;
                        resampler.accept(l,r);
                        if(resampler.frames()>(long)PcmFiles.RATE*PcmFiles.MAX_SECONDS)throw new IOException("10분 이하 곡만 부를 수 있어요.");
                    }
                    outputDone=(info.flags&MediaCodec.BUFFER_FLAG_END_OF_STREAM)!=0;codec.releaseOutputBuffer(at,false);
                }
            }
            if(resampler==null||resampler.frames()<PcmFiles.RATE)throw new IOException("반주가 너무 짧거나 비어 있어요.");
        }finally{if(codec!=null){try{codec.stop();}catch(Exception ignored){}codec.release();}extractor.release();}
    }
}
