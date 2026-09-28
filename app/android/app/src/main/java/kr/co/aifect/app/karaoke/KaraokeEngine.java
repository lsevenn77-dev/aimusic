package kr.co.aifect.app.karaoke;

import android.content.Context;
import android.Manifest;
import android.content.pm.PackageManager;
import androidx.core.content.ContextCompat;
import android.media.*;
import android.media.audiofx.*;
import android.os.*;
import android.os.Process;
import java.io.*;
import java.util.ArrayList;

/** Native capture and MR use one frame timeline. There is no WebView bridge on the audio path.
 * The capture thread owns its devices and preallocated buffers; UI changes only immutable settings. */
final class KaraokeEngine {
    interface Listener { void finished(boolean recorded,String error); }
    private final AudioManager manager;
    private final Context context;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final File mr,dry;
    private final Listener listener;
    volatile VocalEffects.Settings settings=VocalEffects.Settings.defaults();
    private volatile boolean running,monitor;
    private volatile AudioTrack track;
    private volatile AudioRecord recorder;
    private volatile long frames,startFrame,recordFrame,sourceFrames,stopFrame=-1;
    private volatile InputStream activeBacking;
    private final long mrFrames;
    volatile boolean autoSync=true;
    volatile int lastDelayMs=80;
    volatile boolean measuredDelay;
    private volatile String interruption;
    private Thread thread;
    private AudioFocusRequest focus;
    private final AudioManager.OnAudioFocusChangeListener focusListener=change->{if(change<0)interrupt("다른 오디오가 시작되어 노래를 멈췄어요. 녹음은 다시 들을 수 있어요.");};

    KaraokeEngine(Context context,File mr,File dry,Listener listener){
        this.context=context.getApplicationContext();manager=(AudioManager)context.getSystemService(Context.AUDIO_SERVICE);this.mr=mr;this.dry=dry;this.listener=listener;
        long length;try{length=BackingDecoder.frames(mr);}catch(IOException e){length=0;}mrFrames=length;
    }
    static boolean headphone(AudioDeviceInfo device){
        if(device==null)return false;
        if(Build.VERSION.SDK_INT>=31&&device.getType()==AudioDeviceInfo.TYPE_BLE_HEADSET)return true;
        switch(device.getType()){
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
            case AudioDeviceInfo.TYPE_USB_HEADSET:case AudioDeviceInfo.TYPE_USB_DEVICE:
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:return true;
            default:return false;
        }
    }
    static boolean bluetooth(AudioDeviceInfo d){return d!=null&&(d.getType()==AudioDeviceInfo.TYPE_BLUETOOTH_A2DP||(Build.VERSION.SDK_INT>=31&&d.getType()==AudioDeviceInfo.TYPE_BLE_HEADSET));}
    AudioDeviceInfo headphones(){for(AudioDeviceInfo d:manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS))if(headphone(d)&&!bluetooth(d))return d;for(AudioDeviceInfo d:manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS))if(headphone(d))return d;return null;}
    void setMonitor(boolean enabled){
        AudioDeviceInfo route=headphones();monitor=enabled&&route!=null;
        AudioTrack t=track;if(t!=null&&monitor)t.setPreferredDevice(route);
    }
    boolean monitoring(){return monitor;}
    double position(){AudioTrack t=track;try{return t==null?frames/(double)PcmFiles.RATE:(startFrame+(t.getPlaybackHeadPosition()&0xffffffffL))/(double)PcmFiles.RATE;}catch(Exception e){return 0;}}
    double duration(){return mrFrames/(double)PcmFiles.RATE;}
    boolean preRolling(){return position()<recordFrame/(double)PcmFiles.RATE;}
    double recordPosition(){return recordFrame/(double)PcmFiles.RATE;}
    synchronized void start(boolean record)throws IOException{start(record,0);}
    synchronized void start(boolean record,double seconds)throws IOException{startAudio(record,false,mr,seconds,seconds);}
    synchronized void punchIn(double seconds)throws IOException{startAudio(true,false,mr,Math.max(0,seconds-3),seconds);}
    synchronized void guide(File original,double seconds)throws IOException{startAudio(false,true,original,seconds,seconds);}
    private synchronized void startAudio(boolean record,boolean guide,File source,double seconds,double recordingAt)throws IOException{
        if(thread!=null&&thread.isAlive())throw new IOException("이전 녹음을 정리하고 있어요. 잠시 뒤 다시 눌러주세요.");
        sourceFrames=source.equals(mr)?mrFrames:BackingDecoder.frames(source);
        if(sourceFrames<=0)throw new IOException("반주 오디오를 확인해주세요.");
        AudioAttributes attributes=new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build();
        int granted;
        if(Build.VERSION.SDK_INT>=26){focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attributes).setOnAudioFocusChangeListener(focusListener,main).build();granted=manager.requestAudioFocus(focus);}
        else granted=manager.requestAudioFocus(focusListener,AudioManager.STREAM_MUSIC,AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        if(granted!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED)throw new IOException("다른 통화나 오디오가 끝난 뒤 다시 시도해주세요.");
        startFrame=Math.max(0,Math.min((long)(seconds*PcmFiles.RATE),sourceFrames));recordFrame=Math.max(startFrame,Math.min((long)(recordingAt*PcmFiles.RATE),sourceFrames));frames=startFrame;stopFrame=-1;interruption=null;running=true;
        thread=new Thread(()->run(record,guide,source,attributes),"AifectKaraokeAudio");thread.start();
    }
    void interrupt(String message){interruption=message;stop();}
    synchronized void stop(){
        if(!running)return;
        stopFrame=Math.max(startFrame,(long)(position()*PcmFiles.RATE));running=false;monitor=false;
        AudioTrack t=track;try{if(t!=null){t.setVolume(0);t.pause();t.flush();}}catch(Exception ignored){}
        AudioRecord r=recorder;try{if(r!=null)r.stop();}catch(Exception ignored){}
        InputStream backing=activeBacking;try{if(backing!=null)backing.close();}catch(IOException ignored){}
    }
    void close(){stop();Thread t=thread;if(t!=null)try{t.join(3000);}catch(InterruptedException e){Thread.currentThread().interrupt();}}
    private void run(boolean record,boolean guide,File source,AudioAttributes attributes){
        Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO);
        AudioTrack output=null;AudioRecord input=null;ArrayList<AudioEffect> automaticEffects=new ArrayList<>();String error=null;
        File segment=new File(dry.getParentFile(),"segment.pcm");
        RecordingTimeline.DelayEstimate estimate=new RecordingTimeline.DelayEstimate();boolean committed=false;
        final boolean correct=autoSync;
        try(BufferedInputStream backing=new BufferedInputStream(BackingDecoder.open(source,startFrame),8192);
            OutputStream take=record?new BufferedOutputStream(new FileOutputStream(segment)):null;
            PcmFiles.LiveVoiceReader saved=record||guide?null:new PcmFiles.LiveVoiceReader(dry,settings.offsetMs)){
            activeBacking=backing;
            // Warm the first decoded block before opening the microphone or playback clock.
            backing.mark(4);if(backing.read(new byte[4])<4)throw new EOFException("반주가 끝났어요.");backing.reset();
            int burst=192;try{burst=Math.max(96,Math.min(1024,Integer.parseInt(manager.getProperty(AudioManager.PROPERTY_OUTPUT_FRAMES_PER_BUFFER))));}catch(Exception ignored){}
            int minOut=AudioTrack.getMinBufferSize(PcmFiles.RATE,AudioFormat.CHANNEL_OUT_STEREO,AudioFormat.ENCODING_PCM_16BIT);
            if(minOut<=0)throw new IOException("이 기기의 오디오 출력을 열 수 없어요.");
            AudioTrack.Builder builder=new AudioTrack.Builder().setAudioAttributes(attributes)
                .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(PcmFiles.RATE).setChannelMask(AudioFormat.CHANNEL_OUT_STEREO).build())
                .setTransferMode(AudioTrack.MODE_STREAM).setBufferSizeInBytes(Math.max(minOut,burst*4*2));
            if(Build.VERSION.SDK_INT>=26)builder.setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY);
            output=builder.build();track=output;
            if(output.getState()!=AudioTrack.STATE_INITIALIZED)throw new IOException("오디오 출력을 시작하지 못했어요.");
            output.setBufferSizeInFrames(burst*2);
            AudioDeviceInfo route=headphones();if(route!=null)output.setPreferredDevice(route);
            output.addOnRoutingChangedListener(router->{
                AudioDeviceInfo routed=((AudioTrack)router).getRoutedDevice();
                if(monitor&&!headphone(routed))interrupt("이어폰 연결이 바뀌어 청음과 녹음을 멈췄어요.");
            },main);
            if(record){
                if(ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)throw new SecurityException("Microphone permission denied");
                int minIn=AudioRecord.getMinBufferSize(PcmFiles.RATE,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT);
                if(minIn<=0)throw new IOException("이 기기의 마이크를 열 수 없어요.");
                boolean raw="true".equals(manager.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED));
                input=new AudioRecord.Builder().setAudioSource(raw?MediaRecorder.AudioSource.UNPROCESSED:MediaRecorder.AudioSource.VOICE_RECOGNITION)
                    .setAudioFormat(new AudioFormat.Builder().setSampleRate(PcmFiles.RATE).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build())
                    .setBufferSizeInBytes(Math.max(minIn,burst*2*2)).build();recorder=input;
                if(input.getState()!=AudioRecord.STATE_INITIALIZED)throw new IOException("마이크를 시작하지 못했어요.");
                // Do not let speech-processing effects remove singing dynamics or musical echo.
                try{if(AcousticEchoCanceler.isAvailable())automaticEffects.add(AcousticEchoCanceler.create(input.getAudioSessionId()));}catch(Exception ignored){}
                try{if(NoiseSuppressor.isAvailable())automaticEffects.add(NoiseSuppressor.create(input.getAudioSessionId()));}catch(Exception ignored){}
                try{if(AutomaticGainControl.isAvailable())automaticEffects.add(AutomaticGainControl.create(input.getAudioSessionId()));}catch(Exception ignored){}
                for(AudioEffect effect:automaticEffects)if(effect!=null)try{effect.setEnabled(false);}catch(Exception ignored){}
                input.startRecording();
            }
            if(!running)return;
            output.play();
            byte[] mrBytes=new byte[burst*4],dryBytes=new byte[burst*2],mixed=new byte[burst*4];
            short[] captured=new short[burst];float[] vocals=new float[burst];VocalEffects fx=new VocalEffects(PcmFiles.RATE);
            long total=record||guide?sourceFrames:Math.min(sourceFrames,dry.length()/2);
            AudioTimestamp inTime=new AudioTimestamp(),outTime=new AudioTimestamp();long nextMeasure=startFrame+PcmFiles.RATE/5;
            while(running&&frames<total){
                int count=(int)Math.min(burst,total-frames);
                VocalEffects.Settings s=settings;
                if(record){int n=input.read(captured,0,count,AudioRecord.READ_BLOCKING);if(n<=0){if(!running)break;throw new IOException("마이크 연결이 끊겼어요.");}count=n;
                    for(int i=0;i<count;i++){vocals[i]=captured[i]/32768f;dryBytes[i*2]=(byte)captured[i];dryBytes[i*2+1]=(byte)(captured[i]>>8);}take.write(dryBytes,0,count*2);
                }else if(!guide)saved.read(frames,vocals,count,s.offsetMs);
                int n=PcmFiles.read(backing,mrBytes,count*4);count=n/4;if(count==0)break;
                // Route is verified on the audio thread too. Never send microphone audio to a speaker.
                boolean hear=!guide&&(!record||(monitor&&headphone(output.getRoutedDevice())));
                for(int i=0;i<count;i++){
                    float vocal=fx.process(record&&frames+i<recordFrame?0:vocals[i],s)*s.voice*(record?s.monitor:1);
                    PcmFiles.put(mixed,i*4,PcmFiles.sample(mrBytes,i*4)/32768f*s.backing+(hear?vocal:0));
                    PcmFiles.put(mixed,i*4+2,PcmFiles.sample(mrBytes,i*4+2)/32768f*s.backing+(hear?vocal:0));
                }
                int sent=0;while(running&&sent<count*4){int written=output.write(mixed,sent,count*4-sent,AudioTrack.WRITE_BLOCKING);if(written<=0){if(!running)break;throw new IOException("이어폰 오디오 연결을 확인해주세요.");}sent+=written;}
                frames+=count;
                if(record&&frames>=nextMeasure){
                    nextMeasure=frames+PcmFiles.RATE/5;
                    if(input.getTimestamp(inTime,AudioTimestamp.TIMEBASE_MONOTONIC)==AudioRecord.SUCCESS&&output.getTimestamp(outTime))estimate.add(RecordingTimeline.delayMs(outTime.framePosition,outTime.nanoTime,inTime.framePosition,inTime.nanoTime));
                }
            }
            // Finish the small queued tail at the natural end, without extending a user-requested stop.
            long deadline=System.nanoTime()+500_000_000L;
            while(running&&(output.getPlaybackHeadPosition()&0xffffffffL)<frames-startFrame&&System.nanoTime()<deadline)Thread.sleep(5);
        }catch(Exception e){if(running)error=e instanceof SecurityException?"마이크 사용 권한을 허용해주세요.":e.getMessage();}
        finally{
            running=false;monitor=false;
            long end=stopFrame>=0?Math.min(frames,stopFrame):frames;
            if(record&&segment.length()>0){
                measuredDelay=estimate.reliable();lastDelayMs=measuredDelay?estimate.median():80;
                try{long count=Math.max(0,end-recordFrame);RecordingTimeline.commit(dry,segment,recordFrame,count,correct?lastDelayMs:0,recordFrame-startFrame);committed=count>PcmFiles.RATE/10;frames=end;}
                catch(IOException e){error="녹음을 저장하지 못했어요. "+e.getMessage();}
            }
            recorder=null;track=null;activeBacking=null;
            if(input!=null){try{input.stop();}catch(Exception ignored){}try{input.release();}catch(Exception ignored){}}
            for(AudioEffect effect:automaticEffects)if(effect!=null)try{effect.release();}catch(Exception ignored){}
            if(output!=null){try{output.pause();output.flush();}catch(Exception ignored){}try{output.release();}catch(Exception ignored){}}
            if(Build.VERSION.SDK_INT>=26&&focus!=null)manager.abandonAudioFocusRequest(focus);else manager.abandonAudioFocus(focusListener);
            String message=interruption!=null?interruption:error;
            if(record)segment.delete();
            synchronized(this){thread=null;}
            boolean recorded=committed;main.post(()->listener.finished(recorded,message));
        }
    }
}
