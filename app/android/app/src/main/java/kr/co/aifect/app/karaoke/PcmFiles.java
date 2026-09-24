package kr.co.aifect.app.karaoke;

import java.io.*;

/** All cached audio is little-endian PCM16. Disk streaming bounds memory even for ten-minute songs. */
public final class PcmFiles {
    public static final int RATE=48000, EXPORT_RATE=32000, MAX_SECONDS=600;
    private PcmFiles(){}
    public static short sample(byte[] b,int at){return (short)((b[at]&255)|(b[at+1]<<8));}
    public static void put(byte[] b,int at,float v){int s=Math.round(VocalEffects.limit(v)*32767);b[at]=(byte)s;b[at+1]=(byte)(s>>8);}
    public static int read(InputStream in,byte[] b,int count)throws IOException{
        int n=0,k;while(n<count&&(k=in.read(b,n,count-n))!=-1)n+=k;return n;
    }
    public static void wavHeader(OutputStream out,long frames,int rate,int channels)throws IOException{
        long bytes=frames*channels*2;
        if(bytes>0xffffffffL-36)throw new IOException("Audio too large");
        out.write("RIFF".getBytes(java.nio.charset.StandardCharsets.US_ASCII));little(out,bytes+36,4);
        out.write("WAVEfmt ".getBytes(java.nio.charset.StandardCharsets.US_ASCII));little(out,16,4);little(out,1,2);little(out,channels,2);
        little(out,rate,4);little(out,(long)rate*channels*2,4);little(out,channels*2,2);little(out,16,2);
        out.write("data".getBytes(java.nio.charset.StandardCharsets.US_ASCII));little(out,bytes,4);
    }
    private static void little(OutputStream out,long n,int bytes)throws IOException{for(int i=0;i<bytes;i++)out.write((int)(n>>(8*i))&255);}

    /** Streaming linear conversion; every source frame is consumed once, independent of chunking. */
    public static final class Resampler {
        private final double step;
        private final OutputStream out;
        private final byte[] encoded=new byte[4];
        private float prevL,prevR;
        private long index=-1,frames;
        private double next;
        public Resampler(int sourceRate,int targetRate,OutputStream out){
            if(sourceRate<8000||sourceRate>192000||targetRate<8000||targetRate>192000)throw new IllegalArgumentException("Invalid sample rate");
            this.step=(double)sourceRate/targetRate;this.out=out;
        }
        public void accept(float l,float r)throws IOException{
            index++;
            while(next<=index){
                double weight=index==0?1:next-(index-1);
                PcmFiles.put(encoded,0,(float)(prevL+(l-prevL)*weight));PcmFiles.put(encoded,2,(float)(prevR+(r-prevR)*weight));
                out.write(encoded);frames++;next+=step;
            }
            prevL=l;prevR=r;
        }
        public long frames(){return frames;}
    }
    /** Read a dry take on the MR timeline. Positive offset advances a late voice; negative pads it. */
    public static final class VoiceReader implements Closeable {
        private final RandomAccessFile file;
        private final long shift;
        private final byte[] bytes=new byte[2048];
        public VoiceReader(File path,int offsetMs)throws IOException{file=new RandomAccessFile(path,"r");shift=(long)offsetMs*RATE/1000;}
        public void read(long frame,float[] out,int count)throws IOException{
            java.util.Arrays.fill(out,0,count,0);
            long at=frame+shift;int pad=(int)Math.min(count,Math.max(0,-at));at=Math.max(0,at);
            if(at*2>=file.length()||pad==count)return;
            file.seek(at*2);int want=Math.min((count-pad)*2,bytes.length),n=file.read(bytes,0,want);
            for(int i=0;i<n/2;i++)out[pad+i]=sample(bytes,i*2)/32768f;
        }
        public void close()throws IOException{file.close();}
    }
    /** Mixes with exactly the review DSP; output is stereo 32 kHz WAV, <= 76.8 MB for ten minutes. */
    public static void export(File mr,File dry,File dest,VocalEffects.Settings settings)throws IOException{
        long frames=mr.length()/4;
        if(frames<=0||frames>(long)RATE*MAX_SECONDS)throw new IOException("노래 길이를 확인해주세요.");
        File pcm=new File(dest.getParentFile(),"export.pcm");
        long exported;
        try(InputStream backing=new BufferedInputStream(new FileInputStream(mr));VoiceReader voice=new VoiceReader(dry,settings.offsetMs);
            OutputStream out=new BufferedOutputStream(new FileOutputStream(pcm))){
            Resampler resampler=new Resampler(RATE,EXPORT_RATE,out);VocalEffects fx=new VocalEffects(RATE);
            byte[] raw=new byte[1024*4];float[] vocals=new float[1024];long at=0;int n;
            while((n=read(backing,raw,raw.length))>0){
                if(Thread.currentThread().isInterrupted())throw new InterruptedIOException();
                int count=n/4;voice.read(at,vocals,count);
                for(int i=0;i<count;i++){float v=fx.process(vocals[i],settings)*settings.voice;
                    resampler.accept(sample(raw,i*4)/32768f*settings.backing+v,sample(raw,i*4+2)/32768f*settings.backing+v);}
                at+=count;
            }
            exported=resampler.frames();
        }
        try(OutputStream out=new BufferedOutputStream(new FileOutputStream(dest));InputStream in=new BufferedInputStream(new FileInputStream(pcm))){
            wavHeader(out,exported,EXPORT_RATE,2);byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1){if(Thread.currentThread().isInterrupted())throw new InterruptedIOException();out.write(b,0,n);}
        }finally{pcm.delete();}
    }
}
