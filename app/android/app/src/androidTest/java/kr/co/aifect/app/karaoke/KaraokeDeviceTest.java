package kr.co.aifect.app.karaoke;

import android.Manifest;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import androidx.core.content.ContextCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.*;
import org.junit.runner.RunWith;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.junit.Assert.*;
import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.matcher.ViewMatchers.*;
import static androidx.test.espresso.assertion.ViewAssertions.matches;
import static androidx.test.espresso.action.ViewActions.*;

/** Only synthetic silent audio and local HTTP fixtures. These tests never request or record a mic. */
@RunWith(AndroidJUnit4.class)
public class KaraokeDeviceTest {
    private Context context;private ServerSocket server;private Thread serving;private ActivityScenario<KaraokeActivity> screen;
    @Before public void setup()throws Exception{
        context=InstrumentationRegistry.getInstrumentation().getTargetContext();server=new ServerSocket(0,8,InetAddress.getByName("127.0.0.1"));
        ByteArrayOutputStream wav=new ByteArrayOutputStream();PcmFiles.wavHeader(wav,48000*30,48000,2);wav.write(new byte[48000*30*4]);byte[] audio=wav.toByteArray();
        byte[] json=("{\"track\":{\"title\":\"네이티브 노래방 테스트\",\"artist\":\"AIFECT\",\"duration\":2},\"words\":[{\"s\":0,\"e\":2,\"w\":[{\"t\":\"내 목소리로\",\"s\":0,\"e\":1},{\"t\":\"노래해요\",\"s\":1,\"e\":2}]}]}").getBytes(StandardCharsets.UTF_8);
        serving=new Thread(()->{while(!server.isClosed())try(Socket client=server.accept()){
            BufferedReader in=new BufferedReader(new InputStreamReader(client.getInputStream(),StandardCharsets.US_ASCII));String request=in.readLine(),line;while((line=in.readLine())!=null&&!line.isEmpty()){}
            byte[] body=request.contains("/api/")?json:audio;OutputStream out=client.getOutputStream();out.write(("HTTP/1.1 200 OK\r\nContent-Type: "+(body==json?"application/json":"audio/wav")+"\r\nContent-Length: "+body.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));out.write(body);
        }catch(Exception ignored){}});serving.start();
        screen=ActivityScenario.launch(new Intent(context,KaraokeActivity.class).putExtra("origin","http://127.0.0.1:"+server.getLocalPort()).putExtra("trackId","fixture"));
        long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(60);Throwable last=null;
        while(System.nanoTime()<until){try{onView(withText("노래 시작")).check(matches(isEnabled()));return;}catch(Throwable e){last=e;Thread.sleep(100);}}
        AtomicReference<String> status=new AtomicReference<>();screen.onActivity(a->status.set(((android.widget.TextView)a.getWindow().getDecorView().findViewWithTag("karaoke-status")).getText().toString()));
        throw new AssertionError("Native room did not load: "+status.get(),last);
    }
    @After public void cleanup()throws Exception{if(screen!=null)screen.close();if(server!=null)server.close();if(serving!=null)serving.join(2000);}
    @Test public void nativeControlsLoadWithoutOpeningMicrophone()throws Exception{
        onView(withText("이어폰으로 내 목소리 듣기")).check(matches(isDisplayed()));
        onView(withContentDescription("에코")).check(matches(isEnabled()));onView(withContentDescription("룸 리버브")).check(matches(isEnabled()));
        onView(withText("이어폰으로 내 목소리 듣기")).perform(scrollTo(),click()).check(matches(isNotChecked()));
        assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO));
        onView(withText("네이티브 노래방 테스트\nAIFECT")).perform(scrollTo());
        Bitmap image=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        try(FileOutputStream out=new FileOutputStream(new File(context.getExternalFilesDir(null),"karaoke-native.png"))){image.compress(Bitmap.CompressFormat.PNG,100,out);}image.recycle();
    }
    @Test public void reviewSyncRemainsEditableWhileAudioKeepsPlaying()throws Exception{
        AtomicReference<KaraokeEngine> holder=new AtomicReference<>();
        screen.onActivity(activity->{try{
            java.lang.reflect.Field dryField=KaraokeActivity.class.getDeclaredField("dry");dryField.setAccessible(true);
            try(FileOutputStream out=new FileOutputStream((File)dryField.get(activity))){out.write(new byte[48000*30*2]);}
            java.lang.reflect.Method finished=KaraokeActivity.class.getDeclaredMethod("audioFinished",boolean.class,String.class);finished.setAccessible(true);finished.invoke(activity,true,null);
            java.lang.reflect.Field engineField=KaraokeActivity.class.getDeclaredField("engine");engineField.setAccessible(true);holder.set((KaraokeEngine)engineField.get(activity));
        }catch(Exception e){throw new RuntimeException(e);}});
        onView(withText("녹음 들어보기")).perform(click());
        onView(withContentDescription("목소리 싱크")).perform(scrollTo()).check(matches(isEnabled()));
        onView(withContentDescription("목소리를 5ms 빠르게")).perform(scrollTo(),click());
        assertEquals(85,holder.get().settings.offsetMs);
        onView(withText("다시 듣기 멈추기")).check(matches(isDisplayed()));
        double before=holder.get().position();Thread.sleep(200);assertTrue("Adjusting sync does not stop/restart the MR",holder.get().position()>before);
        onView(withContentDescription("목소리를 5ms 느리게")).perform(click());assertEquals(80,holder.get().settings.offsetMs);
        assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO));
        Bitmap image=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        try(FileOutputStream out=new FileOutputStream(new File(context.getExternalFilesDir(null),"karaoke-live-sync.png"))){image.compress(Bitmap.CompressFormat.PNG,100,out);}image.recycle();
        onView(withText("다시 듣기 멈추기")).perform(click());
    }
    @Test public void nativeReviewStopsAndRestartsWithoutMicrophone()throws Exception{
        File dir=new File(context.getCacheDir(),"engine-test");dir.mkdirs();File mr=new File(dir,"mr"),dry=new File(dir,"dry");
        try(FileOutputStream a=new FileOutputStream(mr);FileOutputStream b=new FileOutputStream(dry)){a.write(new byte[48000*4]);b.write(new byte[48000*2]);}
        AtomicReference<KaraokeEngine> holder=new AtomicReference<>();AtomicReference<String> error=new AtomicReference<>();AtomicInteger completions=new AtomicInteger();CountDownLatch ended=new CountDownLatch(2);
        screen.onActivity(activity->{KaraokeEngine engine=new KaraokeEngine(activity,mr,dry,(recorded,message)->{error.set(message);completions.incrementAndGet();ended.countDown();});holder.set(engine);try{engine.start(false);}catch(Exception e){throw new RuntimeException(e);}});
        Thread.sleep(200);holder.get().stop();long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(3);while(completions.get()<1&&System.nanoTime()<until)Thread.sleep(30);
        assertEquals(1,completions.get());assertNull(error.get());
        screen.onActivity(activity->{try{holder.get().start(false);}catch(Exception e){throw new RuntimeException(e);}});
        assertTrue(ended.await(5,TimeUnit.SECONDS));assertNull(error.get());holder.get().close();for(File f:dir.listFiles())f.delete();dir.delete();
    }
    @Test public void engineRejectsMicWithoutPermissionAndCannotMonitorSpeaker()throws Exception{
        File dir=new File(context.getCacheDir(),"permission-test");dir.mkdirs();File mr=new File(dir,"mr"),dry=new File(dir,"dry");try(FileOutputStream out=new FileOutputStream(mr)){out.write(new byte[48000*4]);}
        CountDownLatch ended=new CountDownLatch(1);AtomicReference<String> error=new AtomicReference<>();AtomicReference<KaraokeEngine> holder=new AtomicReference<>();
        screen.onActivity(activity->{KaraokeEngine engine=new KaraokeEngine(activity,mr,dry,(recorded,message)->{assertFalse(recorded);error.set(message);ended.countDown();});holder.set(engine);engine.setMonitor(true);assertFalse(engine.monitoring());try{engine.start(true);}catch(Exception e){throw new RuntimeException(e);}});
        assertTrue(ended.await(5,TimeUnit.SECONDS));assertTrue(error.get().contains("마이크"));assertEquals(0,dry.length());holder.get().close();for(File f:dir.listFiles())f.delete();dir.delete();
    }
}
