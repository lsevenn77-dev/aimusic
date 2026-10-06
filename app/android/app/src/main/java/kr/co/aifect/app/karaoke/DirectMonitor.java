package kr.co.aifect.app.karaoke;
import java.io.IOException;import java.util.concurrent.locks.LockSupport;
/** AAudio's output callback reads the mic and returns the voice directly to the headset.
 * Java/MR decoding, draft writes and saved-take sync are outside this monitoring path. */
final class DirectMonitor implements AutoCloseable {
 private static final boolean AVAILABLE;static{boolean ready;try{System.loadLibrary("aifect_monitor");ready=true;}catch(UnsatisfiedLinkError e){ready=false;}AVAILABLE=ready;}
 private final long handle;private volatile boolean stopped;private boolean closed;
 static DirectMonitor open(int output,int input,int sdk){if(!AVAILABLE)return null;long handle=create(output,input,sdk);return handle==0?null:new DirectMonitor(handle);}
 private DirectMonitor(long handle){this.handle=handle;}
 synchronized void settings(VocalEffects.Settings s,boolean enabled){if(closed)return;configure(handle,s.echo,s.room,s.size,s.voice,s.monitor,s.tone,s.noiseLevel,enabled);}
 int read(short[] target,int count)throws IOException{long deadline=System.nanoTime()+5_000_000_000L;while(!stopped){int n; synchronized(this){if(closed)return 0;n=pull(handle,target,count);}if(System.nanoTime()>deadline)throw new IOException("마이크 응답 시간이 초과됐어요. 녹음은 보관돼요.");if(n<0)throw new IOException("이어폰 청음 연결이 끊겼어요. 녹음은 보관돼요.");if(n>0)return n;LockSupport.parkNanos(200_000);}return 0;}
 synchronized boolean timestamp(android.media.AudioTimestamp time){if(closed)return false;long[] data=new long[2];if(!stamp(handle,data))return false;time.framePosition=data[0];time.nanoTime=data[1];return true;}
 int performance(){return performance(handle);}int bufferFrames(){return bufferFrames(handle);}
 synchronized void stop(){stopped=true;if(!closed)halt(handle);}
 public synchronized void close(){if(closed)return;stop();closed=true;destroy(handle);}
 private static native long create(int output,int input,int sdk);
 private static native void configure(long handle,float echo,float room,float size,float voice,float hear,float tone,int noise,boolean enabled);
 private static native int pull(long handle,short[] target,int count);
 private static native boolean stamp(long handle,long[] time);
 private static native int performance(long handle);private static native int bufferFrames(long handle);
 private static native void halt(long handle);private static native void destroy(long handle);
}
