package kr.co.aifect.app.karaoke;

import android.media.*;
import java.io.*;
import java.nio.*;

/** Compressed backing stays on disk. Only a bounded window of PCM is decoded ahead. */
final class BackingDecoder {
    static long frames(File source)throws IOException{
        if(!source.getName().endsWith(".m4a"))return source.length()/4;
        MediaExtractor e=new MediaExtractor();
        try{e.setDataSource(source.getAbsolutePath());MediaFormat f=audio(e);long us=f.getLong(MediaFormat.KEY_DURATION);if(us<=0||us>1_000_000L*PcmFiles.MAX_SECONDS)throw new IOException("반주 길이를 확인해주세요.");return us*PcmFiles.RATE/1_000_000;}
        catch(RuntimeException error){throw new IOException("반주 정보를 읽지 못했어요.",error);}finally{e.release();}
    }
    private static MediaFormat audio(MediaExtractor e)throws IOException{
        for(int i=0;i<e.getTrackCount();i++){MediaFormat f=e.getTrackFormat(i);String mime=f.getString(MediaFormat.KEY_MIME);if(mime!=null&&mime.startsWith("audio/")){e.selectTrack(i);return f;}}
        throw new IOException("반주 오디오를 찾을 수 없어요.");
    }
    static InputStream open(File source,long frame)throws IOException{
        if(!source.getName().endsWith(".m4a")){
            FileInputStream input=new FileInputStream(source);try{input.getChannel().position(frame*4);return new BufferedInputStream(input);}catch(IOException e){input.close();throw e;}
        }
        return new DecodedStream(source,frame);
    }
    static void export(File source,File dry,File target,VocalEffects.Settings settings)throws IOException{
        export(source,dry,target,settings,false);
    }
    static void export(File source,File dry,File target,VocalEffects.Settings settings,boolean fullLength)throws IOException{
        try(InputStream input=open(source,0)){PcmFiles.export(input,fullLength?frames(source):Math.min(frames(source),dry.length()/2),dry,target,settings);}
    }
    /** Explicit per-block wakeup avoids java.io.PipedInputStream's timed empty-pipe waits. */
    private static final class DecodedStream extends InputStream {
        private final AudioPipe input=new AudioPipe(128*1024);
        private final Thread worker;
        private volatile boolean closed;
        DecodedStream(File source,long frame)throws IOException{
            worker=new Thread(()->{IOException failure=null;try{
                OutputStream sink=new OutputStream(){public void write(int b)throws IOException{input.write(new byte[]{(byte)b},0,1);}public void write(byte[] b,int off,int len)throws IOException{input.write(b,off,len);}};
                OutputStream out=new BufferedOutputStream(sink,8192);decodeTo(source,out,frame);out.flush();
            }catch(Exception e){if(!closed)failure=e instanceof IOException?(IOException)e:new IOException("반주를 해석하지 못했어요.",e);}finally{input.finish(failure);}},"AifectBackingDecode");worker.start();
        }
        @Override public int read()throws IOException{byte[] one=new byte[1];return read(one,0,1)<0?-1:one[0]&255;}
        @Override public int read(byte[] b,int offset,int count)throws IOException{return input.read(b,offset,count);}
        @Override public void close()throws IOException{closed=true;input.close();worker.interrupt();}
    }
    static void decode(File source,File target)throws Exception{
        try(OutputStream out=new BufferedOutputStream(new FileOutputStream(target))){decodeTo(source,out,0);}
    }
    private static void decodeTo(File source,OutputStream out,long startFrame)throws Exception{
        MediaExtractor extractor=new MediaExtractor();MediaCodec codec=null;
        try{
            extractor.setDataSource(source.getAbsolutePath());MediaFormat format=audio(extractor);
            long wantedUs=startFrame*1_000_000/PcmFiles.RATE;
            if(startFrame>0){
                extractor.seekTo(Math.max(0,wantedUs-250_000),MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
                if(extractor.getSampleTime()>0){format.setInteger(MediaFormat.KEY_ENCODER_DELAY,0);format.setInteger(MediaFormat.KEY_ENCODER_PADDING,0);}
            }
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
                    if(resampler==null&&info.size>0){
                        long skip=Math.max(0,Math.round((wantedUs-info.presentationTimeUs)*PcmFiles.RATE/1e6))*4;
                        OutputStream trimmed=new OutputStream(){long remaining=skip;public void write(int b)throws IOException{if(remaining>0)remaining--;else out.write(b);}public void write(byte[] b,int off,int len)throws IOException{int drop=(int)Math.min(remaining,len);remaining-=drop;if(len>drop)out.write(b,off+drop,len-drop);}};
                        resampler=new PcmFiles.Resampler(rate,PcmFiles.RATE,trimmed);
                    }
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
            if(resampler==null)throw new IOException("반주가 비어 있어요.");
        }finally{if(codec!=null){try{codec.stop();}catch(Exception ignored){}codec.release();}extractor.release();}
    }
}
