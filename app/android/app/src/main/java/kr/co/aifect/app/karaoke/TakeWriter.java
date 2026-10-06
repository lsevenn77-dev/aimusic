package kr.co.aifect.app.karaoke;

import java.io.*;

/** Keeps file writes off the audio thread; a bounded two-second queue preserves every sample. */
final class TakeWriter implements AutoCloseable {
    private final AudioPipe queue=new AudioPipe(PcmFiles.RATE*2*2);
    private final Thread worker;
    private volatile IOException failure;
    TakeWriter(File file)throws IOException{this(new BufferedOutputStream(new FileOutputStream(file),32768));}
    TakeWriter(OutputStream output){
        worker=new Thread(()->{
            try(OutputStream out=output){byte[] block=new byte[8192];int n;while((n=queue.read(block))>=0)out.write(block,0,n);}
            catch(IOException e){failure=e;queue.close();}
        },"AifectTakeWriter");worker.start();
    }
    void write(byte[] b,int offset,int length)throws IOException{
        if(failure!=null)throw failure;
        if(!queue.offer(b,offset,length))throw new IOException("저장 장치가 느려 녹음을 멈췄어요. 저장 공간을 확인해주세요.");
    }
    @Override public void close()throws IOException{
        queue.finish(null);
        try{worker.join(3000);}catch(InterruptedException e){Thread.currentThread().interrupt();throw new InterruptedIOException();}
        if(worker.isAlive()){queue.close();worker.interrupt();throw new IOException("녹음 파일 저장 시간이 초과됐어요.");}
        if(failure!=null)throw failure;
    }
}
