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

/** Local silent fixtures. Only the explicit emulator-only capture test opens the virtual microphone. */
@RunWith(AndroidJUnit4.class)
@FixMethodOrder(org.junit.runners.MethodSorters.NAME_ASCENDING)
public class KaraokeDeviceTest {
    private Context context;private ServerSocket server;private Thread serving;private ActivityScenario<KaraokeActivity> screen;
    @Test public void recordingAutoScrollShowsCurrentAndNextTwoWrappedLinesAtEverySize()throws Exception{
        prepareLyricsLayout(false,true,false);
        for(String size:new String[]{"small","normal","large"})assertAutomaticRecordingLyrics(size,"RECORDING",false);
    }
    @Test public void prerollAutoScrollShowsPartnerAndNextOwnWrappedTurnAtEverySize()throws Exception{
        screen.close();screen=ActivityScenario.launch(new Intent(context,KaraokeActivity.class).putExtra("origin","http://127.0.0.1:"+server.getLocalPort()).putExtra("trackId","fixture").putExtra("coverMode","duet"));
        awaitNativeRoom(30);
        prepareLyricsLayout(true,true,false);
        screen.onActivity(a->assertNotNull("Use the actual duet layout including its part legend",a.getWindow().getDecorView().findViewWithTag("duet-legend")));
        for(String size:new String[]{"small","normal","large"})assertAutomaticRecordingLyrics(size,"PREROLL",true);
    }
    /** No Espresso scrolling and no requestRecord/startRecording call: exercise only the real state-driven UI. */
    private void assertAutomaticRecordingLyrics(String size,String stateName,boolean duet)throws Exception{
        int permissionBefore=ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO);
        AtomicLong dryBytesBefore=new AtomicLong();
        screen.onActivity(a->{try{
            setUiState(a,"READY");
            android.view.View sizeChoice=a.getWindow().getDecorView().findViewWithTag("lyric-size-"+size);
            assertNotNull("The actual lyric size selector exists",sizeChoice);assertTrue(sizeChoice.performClick());
            LyricsTimelineView wheel=a.getWindow().getDecorView().findViewWithTag("karaoke-lyrics");assertEquals(size,wheel.textSizeChoice());
            java.lang.reflect.Field scrollField=KaraokeActivity.class.getDeclaredField("scroll"),dryField=KaraokeActivity.class.getDeclaredField("dry");scrollField.setAccessible(true);dryField.setAccessible(true);
            // Reset to the song header, so visibility cannot be inherited from a previous size's auto-scroll.
            ((android.widget.ScrollView)scrollField.get(a)).scrollTo(0,0);dryBytesBefore.set(((File)dryField.get(a)).length());
            java.lang.reflect.Method draw=KaraokeActivity.class.getDeclaredMethod("drawLyrics",double.class);draw.setAccessible(true);draw.invoke(a,6d);assertNoAudioCapture(a);
        }catch(ReflectiveOperationException e){throw new RuntimeException(e);}});
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();Thread.sleep(450);
        screen.onActivity(a->{try{
            java.lang.reflect.Field scrollField=KaraokeActivity.class.getDeclaredField("scroll");scrollField.setAccessible(true);assertEquals("Start at the header before invoking the production auto-scroll",0,((android.widget.ScrollView)scrollField.get(a)).getScrollY());
            setUiState(a,stateName);
        }catch(ReflectiveOperationException e){throw new RuntimeException(e);}});
        try{
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();Thread.sleep(650);
            // Save before assertions so an overflow failure also leaves a reviewable screen capture.
            capture("lyrics-auto-"+(duet?"duet-preroll-":"solo-recording-")+size+".png");
            screen.onActivity(a->{try{
                LyricsTimelineView wheel=a.getWindow().getDecorView().findViewWithTag("karaoke-lyrics");
                java.lang.reflect.Field stateField=KaraokeActivity.class.getDeclaredField("state"),scrollField=KaraokeActivity.class.getDeclaredField("scroll"),dryField=KaraokeActivity.class.getDeclaredField("dry");stateField.setAccessible(true);scrollField.setAccessible(true);dryField.setAccessible(true);
                assertEquals("The UI state is simulated without the audio tick advancing it",stateName,stateField.get(a).toString());
                assertTrue("Production setState must scroll away from the header",((android.widget.ScrollView)scrollField.get(a)).getScrollY()>0);
                android.widget.LinearLayout rows=(android.widget.LinearLayout)wheel.getChildAt(0);
                if(duet){assertEquals("duet-role-mine",rows.getChildAt(1).getTag());assertEquals("duet-role-partner",rows.getChildAt(2).getTag());assertEquals("duet-role-mine",rows.getChildAt(3).getTag());assertTrue(rows.getChildAt(3).getContentDescription().toString().contains("내 파트"));}
                assertLyricsGloballyVisible(wheel,1,3,size+" "+stateName);
                assertLyricsVisible(wheel,1,3);
                for(int i=1;i<=3;i++){
                    android.widget.TextView line=(android.widget.TextView)rows.getChildAt(i);android.text.Layout layout=line.getLayout();assertTrue("Long fixture must wrap at "+size,layout.getLineCount()>=2);
                    assertEquals("All text remains laid out at "+size,line.getText().length(),layout.getLineEnd(layout.getLineCount()-1));assertTrue("Wrapped glyphs fit inside the measured row",layout.getHeight()<=line.getHeight()-line.getCompoundPaddingTop()-line.getCompoundPaddingBottom());
                }
                assertNoAudioCapture(a);assertEquals("UI-only simulation must preserve the dry take",dryBytesBefore.get(),((File)dryField.get(a)).length());
            }catch(ReflectiveOperationException e){throw new RuntimeException(e);}});
            assertEquals("The test never requests microphone permission",permissionBefore,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO));
        }finally{screen.onActivity(a->{try{setUiState(a,"READY");}catch(ReflectiveOperationException e){throw new RuntimeException(e);}});}
    }
    private static void setUiState(KaraokeActivity activity,String value)throws ReflectiveOperationException{
        java.lang.reflect.Field state=KaraokeActivity.class.getDeclaredField("state");Class<?> type=state.getType();Object chosen=null;for(Object candidate:type.getEnumConstants())if(candidate.toString().equals(value)){chosen=candidate;break;}assertNotNull(chosen);
        java.lang.reflect.Method set=KaraokeActivity.class.getDeclaredMethod("setState",type);set.setAccessible(true);set.invoke(activity,chosen);
    }
    private static void assertNoAudioCapture(KaraokeActivity activity)throws ReflectiveOperationException{
        java.lang.reflect.Field engineField=KaraokeActivity.class.getDeclaredField("engine");engineField.setAccessible(true);KaraokeEngine engine=(KaraokeEngine)engineField.get(activity);assertNotNull(engine);
        for(String name:new String[]{"thread","recorder","direct"}){java.lang.reflect.Field field=KaraokeEngine.class.getDeclaredField(name);field.setAccessible(true);assertNull("UI simulation never opens "+name,field.get(engine));}assertEquals("No capture source was opened",0,engine.captureSource);
    }
    private static void assertLyricsGloballyVisible(LyricsTimelineView wheel,int first,int last,String label){
        android.graphics.Rect viewport=new android.graphics.Rect();assertTrue(label+": lyric wheel has a visible screen region",wheel.getGlobalVisibleRect(viewport));
        assertEquals(label+": the parent ScrollView must expose the entire lyric wheel width",wheel.getWidth(),viewport.width());assertEquals(label+": the parent ScrollView must expose the entire lyric wheel height",wheel.getHeight(),viewport.height());
        android.widget.LinearLayout rows=(android.widget.LinearLayout)wheel.getChildAt(0);
        for(int i=first;i<=last;i++){
            android.view.View line=rows.getChildAt(i);android.graphics.Rect visible=new android.graphics.Rect();String row=label+" lyric "+i+" (rowHeight="+line.getHeight()+", topInWheel="+(line.getTop()-wheel.getScrollY())+", wheelHeight="+wheel.getHeight()+")";
            assertTrue(row+": appears on screen without an Espresso scroll",line.getGlobalVisibleRect(visible));assertEquals(row+": horizontal text is not clipped",line.getWidth(),visible.width());assertEquals(row+": the whole current/next lyric row is visible",line.getHeight(),visible.height());assertTrue(row+": stays within the visible lyric wheel",viewport.contains(visible));
        }
    }
    @Test public void compactSoloLyricsShowCurrentAndNextTwoLines()throws Exception{
        prepareLyricsLayout(false,false);
        screen.onActivity(a->{
            LyricsTimelineView wheel=a.getWindow().getDecorView().findViewWithTag("karaoke-lyrics");
            android.widget.LinearLayout rows=(android.widget.LinearLayout)wheel.getChildAt(0);
            android.widget.TextView current=(android.widget.TextView)rows.getChildAt(1);
            float center=current.getTop()+current.getHeight()/2f-wheel.getScrollY();
            assertEquals("Current lyric sits above the middle",wheel.getHeight()*.35f,center,2f);
            assertEquals(62,Math.round(current.getHeight()/a.getResources().getDisplayMetrics().density));
            assertLyricsVisible(wheel,1,3);
        });
        capture("lyrics-solo-compact.png");
    }
    @Test public void wrappedDuetLyricsShowNextOwnTurnAndKeepAllText()throws Exception{
        prepareLyricsLayout(true,true);
        screen.onActivity(a->{
            LyricsTimelineView wheel=a.getWindow().getDecorView().findViewWithTag("karaoke-lyrics");
            android.widget.LinearLayout rows=(android.widget.LinearLayout)wheel.getChildAt(0);
            assertEquals("duet-role-mine",rows.getChildAt(1).getTag());
            assertEquals("duet-role-partner",rows.getChildAt(2).getTag());
            assertEquals("duet-role-mine",rows.getChildAt(3).getTag());
            assertLyricsVisible(wheel,1,3);
            for(int i=1;i<=3;i++){
                android.widget.TextView line=(android.widget.TextView)rows.getChildAt(i);
                android.text.Layout layout=line.getLayout();
                assertTrue("Fixture wraps onto several lines",layout.getLineCount()>=2);
                assertEquals("No lyric text is truncated",line.getText().length(),layout.getLineEnd(layout.getLineCount()-1));
                assertTrue("All wrapped lines fit inside the row",layout.getHeight()<=line.getHeight()-line.getCompoundPaddingTop()-line.getCompoundPaddingBottom());
            }
        });
        capture("lyrics-duet-next-own-turn.png");
    }
    @Test public void variableHeightLyricTapDragAndAccessibilitySeekExactlyOnce()throws Exception{
        prepareLyricsLayout(true,true);
        AtomicInteger began=new AtomicInteger(),selected=new AtomicInteger(),cancelled=new AtomicInteger();
        AtomicReference<Double> position=new AtomicReference<>();
        screen.onActivity(a->{
            LyricsTimelineView wheel=a.getWindow().getDecorView().findViewWithTag("karaoke-lyrics");
            wheel.allowSeek(true);
            wheel.setListener(new LyricsTimelineView.Listener(){public void begin(){began.incrementAndGet();}public void preview(double seconds){}public void selected(double seconds){selected.incrementAndGet();position.set(seconds);}public void cancelled(){cancelled.incrementAndGet();}});
            android.widget.LinearLayout rows=(android.widget.LinearLayout)wheel.getChildAt(0);
            android.view.View next=rows.getChildAt(2);
            float y=next.getTop()+next.getHeight()/2f-wheel.getScrollY();
            lyricTouch(wheel,android.view.MotionEvent.ACTION_DOWN,y);
            lyricTouch(wheel,android.view.MotionEvent.ACTION_UP,y);
        });
        assertEquals(1,began.get());assertEquals(1,selected.get());assertEquals(12d,position.get(),0d);
        Thread.sleep(400);
        screen.onActivity(a->{
            LyricsTimelineView wheel=a.getWindow().getDecorView().findViewWithTag("karaoke-lyrics");
            android.widget.LinearLayout rows=(android.widget.LinearLayout)wheel.getChildAt(0);
            assertTrue(rows.getChildAt(4).performAccessibilityAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK,null));
        });
        Thread.sleep(400);
        assertEquals(2,began.get());assertEquals(2,selected.get());assertEquals(24d,position.get(),0d);
        screen.onActivity(a->{
            LyricsTimelineView wheel=a.getWindow().getDecorView().findViewWithTag("karaoke-lyrics");
            assertLyricsVisible(wheel,4,4);
            lyricTouch(wheel,android.view.MotionEvent.ACTION_DOWN,wheel.getHeight()/2f);
            lyricTouch(wheel,android.view.MotionEvent.ACTION_MOVE,wheel.getHeight()/2f+40);
            lyricTouch(wheel,android.view.MotionEvent.ACTION_CANCEL,wheel.getHeight()/2f+40);
        });
        assertEquals("Cancelled drag never commits a seek",2,selected.get());assertEquals(1,cancelled.get());
        screen.onActivity(a->{
            LyricsTimelineView wheel=a.getWindow().getDecorView().findViewWithTag("karaoke-lyrics");
            wheel.showPosition(0);
        });
        Thread.sleep(400);
        screen.onActivity(a->{
            LyricsTimelineView wheel=a.getWindow().getDecorView().findViewWithTag("karaoke-lyrics");
            lyricTouch(wheel,android.view.MotionEvent.ACTION_DOWN,wheel.getHeight()/2f);
            lyricTouch(wheel,android.view.MotionEvent.ACTION_MOVE,wheel.getHeight()/2f-40);
            android.widget.LinearLayout rows=(android.widget.LinearLayout)wheel.getChildAt(0);
            android.widget.TextView line=(android.widget.TextView)rows.getChildAt(2);
            wheel.scrollTo(0,Math.round(line.getTop()+line.getHeight()/2f-wheel.getHeight()*.35f));
            lyricTouch(wheel,android.view.MotionEvent.ACTION_UP,wheel.getHeight()/2f-40);
        });
        assertEquals("Released drag commits once",3,selected.get());assertEquals(12d,position.get(),0d);
        assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO));
    }
    private void prepareLyricsLayout(boolean duet,boolean wrap)throws Exception{prepareLyricsLayout(duet,wrap,true);}
    private void prepareLyricsLayout(boolean duet,boolean wrap,boolean scrollIntoView)throws Exception{
        screen.onActivity(a->{try{
            if(!scrollIntoView){java.lang.reflect.Field ui=KaraokeActivity.class.getDeclaredField("ui"),tick=KaraokeActivity.class.getDeclaredField("tick");ui.setAccessible(true);tick.setAccessible(true);((android.os.Handler)ui.get(a)).removeCallbacks((Runnable)tick.get(a));}
            String longLine="함께 부르는 이 노래가 우리 마음속에 오래도록 남아 있기를";
            org.json.JSONArray lyrics=new org.json.JSONArray();
            for(int i=0;i<5;i++)lyrics.put(new org.json.JSONObject().put("s",i*6).put("e",i*6+5).put("w",new org.json.JSONArray().put(new org.json.JSONObject().put("t",wrap&&i>0&&i<4?longLine:"다음 가사를 불러요").put("s",i*6).put("e",i*6+5))));
            java.lang.reflect.Field words=KaraokeActivity.class.getDeclaredField("words"),mode=KaraokeActivity.class.getDeclaredField("coverMode"),guide=KaraokeActivity.class.getDeclaredField("duetGuide");
            words.setAccessible(true);mode.setAccessible(true);guide.setAccessible(true);words.set(a,lyrics);mode.set(a,duet?"duet":"solo");
            guide.set(a,new org.json.JSONObject().put("mode","lyrics").put("lines",new org.json.JSONArray().put("B").put("A").put("B").put("A").put("B")));
            java.lang.reflect.Method draw=KaraokeActivity.class.getDeclaredMethod("drawLyrics",double.class);draw.setAccessible(true);draw.invoke(a,6d);
        }catch(Exception e){throw new RuntimeException(e);}});
        if(scrollIntoView)onView(withTagValue(org.hamcrest.Matchers.is("karaoke-lyrics"))).perform(scrollTo());
        Thread.sleep(450);
    }
    private static void assertLyricsVisible(LyricsTimelineView wheel,int first,int last){
        android.widget.LinearLayout rows=(android.widget.LinearLayout)wheel.getChildAt(0);
        for(int i=first;i<=last;i++){
            android.view.View line=rows.getChildAt(i);
            assertTrue("Lyric "+i+" starts inside the viewport",line.getTop()-wheel.getScrollY()>=0);
            assertTrue("Lyric "+i+" ends inside the viewport: "+(line.getBottom()-wheel.getScrollY())+" > "+wheel.getHeight(),line.getBottom()-wheel.getScrollY()<=wheel.getHeight());
        }
    }
    private static void lyricTouch(LyricsTimelineView wheel,int action,float y){
        long now=android.os.SystemClock.uptimeMillis();android.view.MotionEvent event=android.view.MotionEvent.obtain(now,now,action,wheel.getWidth()/2f,y,0);
        try{wheel.onTouchEvent(event);}finally{event.recycle();}
    }
    @Before public void setup()throws Exception{
        context=InstrumentationRegistry.getInstrumentation().getTargetContext();server=new ServerSocket(0,8,InetAddress.getByName("127.0.0.1"));
        ByteArrayOutputStream wav=new ByteArrayOutputStream();PcmFiles.wavHeader(wav,48000*30,48000,2);wav.write(new byte[48000*30*4]);byte[] audio=wav.toByteArray();
        byte[] json=("{\"mr\":\"/media/fixture/mr\",\"track\":{\"id\":\"fixture\",\"title\":\"네이티브 노래방 테스트\",\"artist\":\"AIFECT\",\"duration\":30},\"words\":[{\"s\":0,\"e\":2,\"w\":[{\"t\":\"내 목소리로\",\"s\":0,\"e\":1},{\"t\":\"노래해요\",\"s\":1,\"e\":2}]},{\"s\":6,\"e\":9,\"w\":[{\"t\":\"다음 가사를 불러요\",\"s\":6,\"e\":9}]},{\"s\":12,\"e\":15,\"w\":[{\"t\":\"다시 이어서 노래해요\",\"s\":12,\"e\":15}]},{\"s\":18,\"e\":21,\"w\":[{\"t\":\"마지막 가사예요\",\"s\":18,\"e\":21}]}]}").getBytes(StandardCharsets.UTF_8);
        serving=new Thread(()->{while(!server.isClosed())try(Socket client=server.accept()){
            BufferedReader in=new BufferedReader(new InputStreamReader(client.getInputStream(),StandardCharsets.US_ASCII));String request=in.readLine(),line;while((line=in.readLine())!=null&&!line.isEmpty()){}
            byte[] body=request.contains("/api/")?json:audio;OutputStream out=client.getOutputStream();out.write(("HTTP/1.1 200 OK\r\nContent-Type: "+(body==json?"application/json":"audio/wav")+"\r\nContent-Length: "+body.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));out.write(body);
        }catch(Exception ignored){}});serving.start();
        screen=ActivityScenario.launch(new Intent(context,KaraokeActivity.class).putExtra("origin","http://127.0.0.1:"+server.getLocalPort()).putExtra("trackId","fixture"));
        awaitNativeRoom(60);
    }
    /** Observe this fixture's Activity, not another room or a label that changes when a take is restored. */
    private void awaitNativeRoom(int seconds)throws Exception{
        long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(seconds);AtomicBoolean ready=new AtomicBoolean();AtomicReference<String> details=new AtomicReference<>();Throwable last=null;
        while(System.nanoTime()<until){
            try{screen.onActivity(a->{android.view.View root=a.getWindow().getDecorView();android.widget.Button primary=root.findViewWithTag("recording-primary");android.widget.TextView status=root.findViewWithTag("karaoke-status");ready.set(primary!=null&&primary.isEnabled()&&primary.isShown()&&a.hasWindowFocus()&&!a.isFinishing()&&!a.isDestroyed());details.set((status==null?"no status":status.getText())+"; primary="+(primary==null?"missing":primary.getText()+", enabled="+primary.isEnabled()+", shown="+primary.isShown())+", focus="+a.hasWindowFocus());});if(ready.get())return;}
            catch(Throwable error){last=error;}
            Thread.sleep(100);
        }
        throw new AssertionError("Native room did not load: "+details.get(),last);
    }
    @After public void cleanup()throws Exception{if(screen!=null)screen.close();if(server!=null)server.close();if(serving!=null)serving.join(2000);}
    @Test public void duetGuideEditsPersistWithoutMicrophone()throws Exception{
        screen.close();screen=ActivityScenario.launch(new Intent(context,KaraokeActivity.class).putExtra("origin","http://127.0.0.1:"+server.getLocalPort()).putExtra("trackId","fixture").putExtra("coverMode","duet"));
        awaitNativeRoom(30);
        screen.onActivity(a->{try{java.lang.reflect.Field field=KaraokeActivity.class.getDeclaredField("duetGuide");field.setAccessible(true);field.set(a,DuetGuide.empty());}catch(Exception e){throw new RuntimeException(e);}});
        onView(withTagValue(org.hamcrest.Matchers.is("duet-open-editor"))).perform(scrollTo(),click());
        onView(withTagValue(org.hamcrest.Matchers.is("duet-method-lyrics"))).perform(click());
        onView(withTagValue(org.hamcrest.Matchers.is("duet-editor-done"))).perform(click());
        onView(withTagValue(org.hamcrest.Matchers.is("duet-editor-status"))).check(matches(withText("아직 지정하지 않은 가사가 4줄 있어요.")));
        onView(withTagValue(org.hamcrest.Matchers.is("duet-line-0-A"))).perform(scrollTo(),click());
        onView(withTagValue(org.hamcrest.Matchers.is("duet-line-0-A"))).check(matches(isSelected())).perform(click()).check(matches(org.hamcrest.Matchers.not(isSelected()))).perform(click());
        onView(withTagValue(org.hamcrest.Matchers.is("duet-fill-partner"))).perform(click());
        onView(withTagValue(org.hamcrest.Matchers.is("duet-editor-status"))).check(matches(withText("4 / 4줄 지정 · 내 파트와 파트너를 나눠주세요.")));
        capture("duet-editor-native.png");onView(withTagValue(org.hamcrest.Matchers.is("duet-editor-done"))).perform(click());
        screen.recreate();awaitNativeRoom(30);
        screen.onActivity(a->{try{java.lang.reflect.Field field=KaraokeActivity.class.getDeclaredField("duetGuide");field.setAccessible(true);org.json.JSONObject saved=(org.json.JSONObject)field.get(a);assertEquals("A",DuetGuide.explicitPart(saved,0));for(int i=1;i<4;i++)assertEquals("B",DuetGuide.explicitPart(saved,i));assertEquals("",DuetGuide.manualProblem(saved,4));assertNoAudioCapture(a);}catch(Exception e){throw new RuntimeException(e);}});
        onView(withTagValue(org.hamcrest.Matchers.is("duet-open-editor"))).perform(scrollTo(),click());
        onView(withTagValue(org.hamcrest.Matchers.is("duet-line-0-A"))).check(matches(isSelected()));
        onView(withTagValue(org.hamcrest.Matchers.is("duet-method-free"))).perform(click());onView(withTagValue(org.hamcrest.Matchers.is("duet-editor-done"))).perform(click());
        assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO));
    }
    @Test public void duetManualValidationKeepsFreeAndInheritedGuidesUsable()throws Exception{
        org.json.JSONObject guide=DuetGuide.empty();assertEquals("",DuetGuide.manualProblem(guide,4));assertEquals("",DuetGuide.manualProblem(null,4));
        guide.put("mode","lyrics");assertFalse(DuetGuide.manualProblem(guide,4).isEmpty());
        for(int i=0;i<4;i++)DuetGuide.assign(guide,i,"A");assertFalse("Both singers need a part",DuetGuide.manualProblem(guide,4).isEmpty());
        DuetGuide.assign(guide,2,"both");assertEquals("",DuetGuide.manualProblem(guide,4));DuetGuide.assign(guide,3,"");DuetGuide.fillPartner(guide,4);assertEquals("A",DuetGuide.explicitPart(guide,0));assertEquals("both",DuetGuide.explicitPart(guide,2));assertEquals("B",DuetGuide.explicitPart(guide,3));
        String before=guide.toString();AtomicReference<DuetPartEditor> editor=new AtomicReference<>();
        screen.onActivity(a->{try{java.lang.reflect.Field field=KaraokeActivity.class.getDeclaredField("words");field.setAccessible(true);DuetPartEditor dialog=new DuetPartEditor(a,(org.json.JSONArray)field.get(a),guide,true,30,new DuetPartEditor.Listener(){public void changed(){fail("An inherited guide is read-only");}public void seek(double seconds){}});editor.set(dialog);dialog.show();}catch(Exception e){throw new RuntimeException(e);}});
        onView(withTagValue(org.hamcrest.Matchers.is("duet-method-lyrics"))).check(androidx.test.espresso.assertion.ViewAssertions.doesNotExist());
        onView(withTagValue(org.hamcrest.Matchers.is("duet-line-0-A"))).check(androidx.test.espresso.assertion.ViewAssertions.doesNotExist());
        onView(withTagValue(org.hamcrest.Matchers.is("duet-editor-done"))).perform(click());assertEquals(before,guide.toString());
        screen.onActivity(a->{try{assertNoAudioCapture(a);}catch(Exception e){throw new RuntimeException(e);}});
    }
    @Test public void monitoringGainUsesUnityAndKeepsChosenDraftLevel()throws Exception{
        screen.onActivity(a->{try{
            java.lang.reflect.Field field=KaraokeActivity.class.getDeclaredField("hear");field.setAccessible(true);android.widget.SeekBar hear=(android.widget.SeekBar)field.get(a);assertEquals(100,hear.getMax());
            java.lang.reflect.Field engineField=KaraokeActivity.class.getDeclaredField("engine");engineField.setAccessible(true);KaraokeEngine engine=(KaraokeEngine)engineField.get(a);
            hear.setProgress(100);assertEquals(1f,engine.settings.monitor,0);hear.setProgress(63);
            java.lang.reflect.Method save=KaraokeActivity.class.getDeclaredMethod("saveSession"),restore=KaraokeActivity.class.getDeclaredMethod("restoreSession");save.setAccessible(true);restore.setAccessible(true);save.invoke(a);hear.setProgress(100);restore.invoke(a);assertEquals(63,hear.getProgress());assertEquals(.63f,engine.settings.monitor,.0001f);assertNoAudioCapture(a);
        }catch(Exception e){throw new RuntimeException(e);}});
    }
    @Test public void duetVisualRolesSwitchForSecondSingerWithoutMicrophone()throws Exception{
        screen.close();screen=ActivityScenario.launch(new Intent(context,KaraokeActivity.class).putExtra("origin","http://127.0.0.1:"+server.getLocalPort()).putExtra("trackId","fixture").putExtra("coverMode","duet"));
        awaitNativeRoom(30);
        screen.onActivity(a->{try{
            java.lang.reflect.Field mode=KaraokeActivity.class.getDeclaredField("coverMode"),parent=KaraokeActivity.class.getDeclaredField("duetParent"),guide=KaraokeActivity.class.getDeclaredField("duetGuide");mode.setAccessible(true);parent.setAccessible(true);guide.setAccessible(true);mode.set(a,"duet");guide.set(a,new org.json.JSONObject().put("mode","lyrics").put("lines",new org.json.JSONArray().put("A").put("B").put("both").put("")));
            java.lang.reflect.Method draw=KaraokeActivity.class.getDeclaredMethod("drawLyrics",double.class);draw.setAccessible(true);draw.invoke(a,0d);
            android.widget.TextView first=a.getWindow().getDecorView().findViewWithTag("duet-role-mine"),second=a.getWindow().getDecorView().findViewWithTag("duet-role-partner"),both=a.getWindow().getDecorView().findViewWithTag("duet-role-both");assertTrue(first.getText().toString().contains("내 목소리로"));assertTrue(second.getText().toString().contains("다음 가사"));assertNotNull(first.getCompoundDrawablesRelative()[0]);assertNotNull(second.getCompoundDrawablesRelative()[0]);assertNotNull(both.getCompoundDrawablesRelative()[0]);
            parent.set(a,"first-take");draw.invoke(a,6d);first=a.getWindow().getDecorView().findViewWithTag("duet-role-partner");second=a.getWindow().getDecorView().findViewWithTag("duet-role-mine");assertTrue(first.getText().toString().contains("내 목소리로"));assertTrue(second.getText().toString().contains("다음 가사"));assertTrue(second.getContentDescription().toString().contains("내 파트"));
        }catch(Exception e){throw new RuntimeException(e);}});
        assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO));onView(withTagValue(org.hamcrest.Matchers.is("karaoke-lyrics"))).perform(scrollTo());Thread.sleep(350);capture("studio-duet.png");
    }
    /** Isolated emulator only, with host mic disabled by the host before this test. */
    @Test public void zzDirectAudioCallbackCapturesWithoutWaitingForMrOrSavedSync()throws Exception{
        org.junit.Assume.assumeTrue(android.os.Build.HARDWARE.contains("ranchu")||android.os.Build.HARDWARE.contains("goldfish"));
        try(android.os.ParcelFileDescriptor result=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("pm grant "+context.getPackageName()+" android.permission.RECORD_AUDIO")){try(InputStream in=new android.os.ParcelFileDescriptor.AutoCloseInputStream(result)){while(in.read()!=-1){}}}
        DirectMonitor live=DirectMonitor.open(0,0,android.os.Build.VERSION.SDK_INT);assertNotNull("AAudio duplex library opens on the virtual device",live);
        try{live.settings(new VocalEffects.Settings(0,0,.5f,1,1,.65f,800),false);short[] samples=new short[192];int frames=0;for(int i=0;i<50;i++)frames+=live.read(samples,samples.length);assertTrue("Dry capture is independent of MR and an 800ms saved sync setting",frames>0);assertTrue(live.bufferFrames()>0);live.stop();assertEquals(0,live.read(samples,samples.length));}finally{live.close();}
    }
    @Test public void nativeControlsLoadWithoutOpeningMicrophone()throws Exception{
        onView(withContentDescription("이어폰으로 내 목소리 듣기")).check(matches(isDisplayed()));
        onView(withTagValue(org.hamcrest.Matchers.is("recording-settings"))).perform(scrollTo(),click()); onView(withText("소리 조절")).check(matches(isDisplayed())); onView(withContentDescription("내 목소리")).perform(scrollTo()).check(matches(isEnabled())); onView(withText("리버브")).perform(click()); onView(withText("사용자 설정")).perform(scrollTo(),click()); onView(withContentDescription("에코 크기")).perform(scrollTo()).check(matches(isEnabled()));onView(withContentDescription("룸 크기")).perform(scrollTo()).check(matches(isEnabled())); onView(withContentDescription("세부 설정 닫기")).perform(click());
        onView(withContentDescription("이어폰으로 내 목소리 듣기")).perform(scrollTo(),click()).check(matches(isNotChecked()));
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
        onView(withContentDescription("목소리 싱크")).perform(adjustSync(5));
        assertEquals(5,holder.get().settings.offsetMs);
        onView(withContentDescription("녹음 다시듣기 일시정지")).check(matches(isDisplayed()));
        double before=holder.get().position();Thread.sleep(200);assertTrue("Adjusting sync does not stop/restart the MR",holder.get().position()>before);
        onView(withContentDescription("목소리 싱크")).perform(adjustSync(-5));assertEquals(0,holder.get().settings.offsetMs);
        assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO));
        Bitmap image=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        try(FileOutputStream out=new FileOutputStream(new File(context.getExternalFilesDir(null),"karaoke-live-sync.png"))){image.compress(Bitmap.CompressFormat.PNG,100,out);}image.recycle();
        onView(withContentDescription("녹음 다시듣기 일시정지")).perform(click());
    }
    private static androidx.test.espresso.ViewAction adjustSync(int delta){return new androidx.test.espresso.ViewAction(){public org.hamcrest.Matcher<android.view.View> getConstraints(){return androidx.test.espresso.matcher.ViewMatchers.isAssignableFrom(android.widget.SeekBar.class);}public String getDescription(){return "Adjust the visible sync slider by "+delta+"ms";}public void perform(androidx.test.espresso.UiController ui,android.view.View view){android.widget.SeekBar bar=(android.widget.SeekBar)view;bar.setProgress(bar.getProgress()+delta);ui.loopMainThreadUntilIdle();}};}
    private void capture(String name)throws Exception{Bitmap image=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();try(FileOutputStream out=new FileOutputStream(new File(context.getExternalFilesDir(null),name))){image.compress(Bitmap.CompressFormat.PNG,100,out);}image.recycle();}
    @Test public void studioSettingsCancelApplyAndAgainPreserveTake()throws Exception{
        File dry=seedTake();byte[] original=java.nio.file.Files.readAllBytes(dry.toPath());
        onView(withTagValue(org.hamcrest.Matchers.is("post-settings"))).perform(scrollTo(),click());capture("studio-sound.png");
        screen.onActivity(a->{try{java.lang.reflect.Field f=KaraokeActivity.class.getDeclaredField("voice");f.setAccessible(true);((android.widget.SeekBar)f.get(a)).setProgress(137);}catch(Exception e){throw new RuntimeException(e);}});
        onView(withContentDescription("세부 설정 닫기")).perform(click());
        screen.onActivity(a->{try{java.lang.reflect.Field f=KaraokeActivity.class.getDeclaredField("voice");f.setAccessible(true);assertEquals(100,((android.widget.SeekBar)f.get(a)).getProgress());}catch(Exception e){throw new RuntimeException(e);}});
        onView(withTagValue(org.hamcrest.Matchers.is("post-settings"))).perform(scrollTo(),click());onView(withText("리버브")).perform(click());onView(withText("사용자 설정")).perform(scrollTo(),click());capture("studio-reverb.png");
        screen.onActivity(a->{try{java.lang.reflect.Field f=KaraokeActivity.class.getDeclaredField("size");f.setAccessible(true);((android.widget.SeekBar)f.get(a)).setProgress(60);}catch(Exception e){throw new RuntimeException(e);}});
        onView(withText("적용하기")).perform(click());screen.recreate();
        onView(withText("녹음이 완료되었습니다!")).perform(scrollTo());capture("studio-post-refined-top.png");
        onView(withContentDescription("룸 크기")).perform(scrollTo()).check(matches(isEnabled()));
        onView(withText("저장 후 게시")).perform(scrollTo()).check(matches(isDisplayed()));capture("studio-post-refined-bottom.png");
        screen.onActivity(a->{try{java.lang.reflect.Field f=KaraokeActivity.class.getDeclaredField("size");f.setAccessible(true);assertEquals(60,((android.widget.SeekBar)f.get(a)).getProgress());}catch(Exception e){throw new RuntimeException(e);}});
        assertArrayEquals(original,java.nio.file.Files.readAllBytes(dry.toPath()));onView(withText("임시 저장")).perform(scrollTo(),click());
        onView(withContentDescription("녹음 들어보기")).perform(scrollTo(),click());onView(withText("다시 부르기")).perform(scrollTo(),click());
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(true){try{onView(withText("이어 부르기")).check(matches(isEnabled()));break;}catch(Throwable e){if(System.nanoTime()>deadline)throw e;Thread.sleep(100);}}
        assertArrayEquals(original,java.nio.file.Files.readAllBytes(dry.toPath()));assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO));
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
    @Test public void submittedSavedDraftIsRemovedButBackingCacheRemains()throws Exception{
        File dry=seedTake(),folder=dry.getParentFile();
        screen.onActivity(a->{try{for(String name:new String[]{"keepDraft","uploadComplete"}){java.lang.reflect.Field field=KaraokeActivity.class.getDeclaredField(name);field.setAccessible(true);field.setBoolean(a,true);}a.finish();}catch(Exception e){throw new RuntimeException(e);}});
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10);while((dry.exists()||new File(folder,"session.json").exists())&&System.nanoTime()<deadline)Thread.sleep(30);
        assertFalse("A successfully submitted recording must leave the draft list even after explicit temporary save",dry.exists());assertFalse(new File(folder,"session.json").exists());assertTrue("Keep the downloaded backing for the next recording",new File(folder,"mr.m4a").isFile());
    }
    @Test public void pendingSubmissionSurvivesRecreationAndExplicitDraftSave()throws Exception{
        File dry=seedTake();byte[] original=java.nio.file.Files.readAllBytes(dry.toPath());
        screen.onActivity(a->{try{java.lang.reflect.Field id=KaraokeActivity.class.getDeclaredField("draftId");id.setAccessible(true);id.set(a,"pending-submission");java.lang.reflect.Method save=KaraokeActivity.class.getDeclaredMethod("saveSession");save.setAccessible(true);save.invoke(a);}catch(Exception e){throw new RuntimeException(e);}});
        screen.recreate();screen.onActivity(a->{try{java.lang.reflect.Field id=KaraokeActivity.class.getDeclaredField("draftId"),keep=KaraokeActivity.class.getDeclaredField("keepDraft");id.setAccessible(true);keep.setAccessible(true);assertEquals("pending-submission",id.get(a));keep.setBoolean(a,true);a.finish();}catch(Exception e){throw new RuntimeException(e);}});
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();assertArrayEquals("A saved, unsubmitted take must not be discarded",original,java.nio.file.Files.readAllBytes(dry.toPath()));assertTrue(new File(dry.getParentFile(),"session.json").isFile());
        // This fixture owns the directory; remove only its retained local take after the assertion.
        new File(dry.getParentFile(),"session.json").delete();dry.delete();
    }
    private File seedTake()throws Exception{
        AtomicReference<File> result=new AtomicReference<>();screen.onActivity(activity->{try{
            java.lang.reflect.Field field=KaraokeActivity.class.getDeclaredField("dry");field.setAccessible(true);File dry=(File)field.get(activity);result.set(dry);
            try(FileOutputStream out=new FileOutputStream(dry)){byte[] samples=new byte[48000*3*2];for(int i=0;i<samples.length/2;i++){short value=(short)(8000*Math.sin(i*2*Math.PI*440/48000)*(.5+.5*Math.sin(i/4000.0)));samples[i*2]=(byte)value;samples[i*2+1]=(byte)(value>>8);}out.write(samples);}
            java.lang.reflect.Method finished=KaraokeActivity.class.getDeclaredMethod("audioFinished",boolean.class,String.class);finished.setAccessible(true);finished.invoke(activity,true,null);
        }catch(Exception e){throw new RuntimeException(e);}});return result.get();
    }
    @Test public void presetButtonsApplyPersistAndPreserveDryRecording()throws Exception{
        File dry=seedTake();byte[] original=java.nio.file.Files.readAllBytes(dry.toPath());
        onView(withText("노래방")).perform(scrollTo(),click());
        screen.onActivity(a->{try{
            java.lang.reflect.Field field=KaraokeActivity.class.getDeclaredField("engine");field.setAccessible(true);KaraokeEngine e=(KaraokeEngine)field.get(a);assertEquals(.12f,e.settings.echo,.0001f);assertEquals(.325f,e.settings.room,.0001f);assertEquals(2,e.settings.noiseLevel);
        }catch(Exception e){throw new RuntimeException(e);}});
        onView(withText("홀")).perform(scrollTo(),click());
        screen.onActivity(a->{try{
            java.lang.reflect.Field f=KaraokeActivity.class.getDeclaredField("effectStrength");f.setAccessible(true);((android.widget.SeekBar)f.get(a)).setProgress(63);java.lang.reflect.Field noise=KaraokeActivity.class.getDeclaredField("noise");noise.setAccessible(true);((android.widget.SeekBar)noise.get(a)).setProgress(4);
            java.lang.reflect.Method save=KaraokeActivity.class.getDeclaredMethod("saveSession");save.setAccessible(true);save.invoke(a);
        }catch(Exception e){throw new RuntimeException(e);}});
        screen.recreate();onView(withContentDescription("홀 선택됨")).check(matches(isSelected()));
        screen.onActivity(a->{try{java.lang.reflect.Field field=KaraokeActivity.class.getDeclaredField("engine");field.setAccessible(true);KaraokeEngine e=(KaraokeEngine)field.get(a);assertEquals(.567f,e.settings.room,.0001f);assertEquals(4,e.settings.noiseLevel);}catch(Exception e){throw new RuntimeException(e);}});
        assertArrayEquals(original,java.nio.file.Files.readAllBytes(dry.toPath()));
        onView(withText("원음")).perform(scrollTo(),click());onView(withContentDescription("효과 강도")).check(matches(org.hamcrest.Matchers.not(isEnabled())));
        onView(withText("스튜디오")).perform(scrollTo(),click());Bitmap image=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();try(FileOutputStream out=new FileOutputStream(new File(context.getExternalFilesDir(null),"karaoke-presets.png"))){image.compress(Bitmap.CompressFormat.PNG,100,out);}image.recycle();
    }
    @Test public void customSettingsSurvivePresetSwitchAndActivityRecreation()throws Exception{
        File dry=seedTake();byte[] original=java.nio.file.Files.readAllBytes(dry.toPath());
        onView(withText("사용자 설정")).perform(scrollTo(),click());onView(withContentDescription("음색 보정")).perform(scrollTo()).check(matches(isDisplayed()));
        screen.onActivity(a->{try{
            for(String name:new String[]{"echo","room","size","toneControl","noise"}){java.lang.reflect.Field f=KaraokeActivity.class.getDeclaredField(name);f.setAccessible(true);((android.widget.SeekBar)f.get(a)).setProgress(name.equals("echo")?41:name.equals("room")?67:name.equals("size")?81:name.equals("toneControl")?23:4);}
            java.lang.reflect.Method select=KaraokeActivity.class.getDeclaredMethod("selectPreset",String.class,int.class);select.setAccessible(true);select.invoke(a,"hall",50);
            java.lang.reflect.Method save=KaraokeActivity.class.getDeclaredMethod("saveSession");save.setAccessible(true);save.invoke(a);
        }catch(Exception e){throw new RuntimeException(e);}});
        screen.recreate();long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(10);while(true){try{onView(withContentDescription("홀 선택됨")).check(matches(isSelected()));break;}catch(Throwable e){if(System.nanoTime()>until)throw e;Thread.sleep(100);}}
        onView(withText("사용자 설정")).perform(scrollTo(),click());
        screen.onActivity(a->{try{java.lang.reflect.Field field=KaraokeActivity.class.getDeclaredField("engine");field.setAccessible(true);VocalEffects.Settings s=((KaraokeEngine)field.get(a)).settings;assertEquals(.41f,s.echo,.0001f);assertEquals(.67f,s.room,.0001f);assertEquals(.81f,s.size,.0001f);assertEquals(.23f,s.tone,.0001f);assertEquals(4,s.noiseLevel);}catch(Exception e){throw new RuntimeException(e);}});
        assertArrayEquals(original,java.nio.file.Files.readAllBytes(dry.toPath()));
        onView(withContentDescription("음색 보정")).perform(scrollTo());Bitmap image=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();try(FileOutputStream out=new FileOutputStream(new File(context.getExternalFilesDir(null),"karaoke-custom.png"))){image.compress(Bitmap.CompressFormat.PNG,100,out);}image.recycle();
    }
    @Test public void roomScaleMigratesSavedDraftOnceAndPreservesDryTake()throws Exception{
        File dry=seedTake();byte[] original=java.nio.file.Files.readAllBytes(dry.toPath());
        screen.onActivity(a->{try{
            java.lang.reflect.Field field=KaraokeActivity.class.getDeclaredField("sessionFile");field.setAccessible(true);File session=(File)field.get(a);
            org.json.JSONObject data=new org.json.JSONObject(new String(java.nio.file.Files.readAllBytes(session.toPath()),StandardCharsets.UTF_8));data.remove("roomScaleVersion");data.remove("preset");data.remove("tone");data.put("room",50);java.nio.file.Files.write(session.toPath(),data.toString().getBytes(StandardCharsets.UTF_8));
            java.lang.reflect.Method restore=KaraokeActivity.class.getDeclaredMethod("restoreSession");restore.setAccessible(true);restore.invoke(a);
            java.lang.reflect.Field roomField=KaraokeActivity.class.getDeclaredField("room");roomField.setAccessible(true);android.widget.SeekBar room=(android.widget.SeekBar)roomField.get(a);assertEquals(100,room.getMax());assertEquals(100,room.getProgress());
            java.lang.reflect.Field engineField=KaraokeActivity.class.getDeclaredField("engine");engineField.setAccessible(true);KaraokeEngine engine=(KaraokeEngine)engineField.get(a);assertEquals(.5f,RoomReverb.gain(engine.settings.room),0);
            room.setProgress(11);assertEquals(.055f,RoomReverb.gain(engine.settings.room),.00001f);
            java.lang.reflect.Method save=KaraokeActivity.class.getDeclaredMethod("saveSession");save.setAccessible(true);save.invoke(a);restore.invoke(a);assertEquals(11,room.getProgress());
            org.json.JSONObject saved=new org.json.JSONObject(new String(java.nio.file.Files.readAllBytes(session.toPath()),StandardCharsets.UTF_8));assertEquals(2,saved.getInt("roomScaleVersion"));assertEquals(11,saved.getInt("room"));
        }catch(Exception e){throw new RuntimeException(e);}});
        assertArrayEquals(original,java.nio.file.Files.readAllBytes(dry.toPath()));
    }
    @Test public void backgroundAndActivityRecreationKeepTakeAndCursor()throws Exception{
        File dry=seedTake();byte[] original=java.nio.file.Files.readAllBytes(dry.toPath());
        screen.onActivity(a->{try{java.lang.reflect.Method select=KaraokeActivity.class.getDeclaredMethod("selectPosition",double.class);select.setAccessible(true);select.invoke(a,1.25);}catch(Exception e){throw new RuntimeException(e);}});
        screen.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);screen.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);screen.recreate();
        onView(withText("이어 부르기")).check(matches(isEnabled()));
        screen.onActivity(a->{try{java.lang.reflect.Field c=KaraokeActivity.class.getDeclaredField("cursor");c.setAccessible(true);assertEquals(1.25,c.getDouble(a),.01);}catch(Exception e){throw new RuntimeException(e);}});
        assertArrayEquals(original,java.nio.file.Files.readAllBytes(dry.toPath()));
        assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO));
    }
    @Test public void lyricSelectionNeverOverwritesTakeAndGuideIsAbsent()throws Exception{
        File dry=seedTake();byte[] original=java.nio.file.Files.readAllBytes(dry.toPath());
        onView(withText("다시 부르기")).perform(scrollTo(),click());
        onView(withText("가사 펼치기 · 시작 위치 선택")).perform(scrollTo(),click());
        onView(withText("0:00  내 목소리로 노래해요")).perform(click());
        onView(withText("원곡 가이드 듣기")).check(androidx.test.espresso.assertion.ViewAssertions.doesNotExist());
        onView(withText("여기부터 부르기")).check(matches(isEnabled()));
        assertArrayEquals(original,java.nio.file.Files.readAllBytes(dry.toPath()));
        assertEquals(PackageManager.PERMISSION_DENIED,ContextCompat.checkSelfPermission(context,Manifest.permission.RECORD_AUDIO));
    }
    /** Run separately on the emulator with host microphone disabled; grants only the isolated test APK. */
    @Test public void zzCapturePausesInBackgroundAndResumesSameTake()throws Exception{
        org.junit.Assume.assumeTrue(android.os.Build.HARDWARE.contains("ranchu")||android.os.Build.HARDWARE.contains("goldfish"));
        try(android.os.ParcelFileDescriptor result=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("pm grant "+context.getPackageName()+" android.permission.RECORD_AUDIO")){try(InputStream in=new android.os.ParcelFileDescriptor.AutoCloseInputStream(result)){while(in.read()!=-1){}}}
        onView(withTagValue(org.hamcrest.Matchers.is("recording-primary"))).perform(click());Thread.sleep(4500);
        onView(org.hamcrest.Matchers.allOf(withText("일시정지"),isEnabled())).check(matches(isDisplayed()));
        screen.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);Thread.sleep(300);screen.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
        onView(withText("이어 부르기")).check(matches(isEnabled()));
        AtomicReference<File> take=new AtomicReference<>();screen.onActivity(a->{try{java.lang.reflect.Field f=KaraokeActivity.class.getDeclaredField("dry");f.setAccessible(true);take.set((File)f.get(a));}catch(Exception e){throw new RuntimeException(e);}});
        long before=take.get().length();assertTrue("Captured audio is saved",before>4800);
        onView(withText("이어 부르기")).perform(click());Thread.sleep(4500);
        screen.onActivity(a->{try{java.lang.reflect.Field f=KaraokeActivity.class.getDeclaredField("state");f.setAccessible(true);assertEquals(((android.widget.TextView)a.getWindow().getDecorView().findViewWithTag("karaoke-status")).getText().toString(),"RECORDING",f.get(a).toString());}catch(ReflectiveOperationException e){throw new RuntimeException(e);}});
        onView(org.hamcrest.Matchers.allOf(withText("일시정지"),isEnabled())).perform(click());Thread.sleep(500);
        assertTrue("Resume appends to the same take",take.get().length()>before);
        byte[] saved=java.nio.file.Files.readAllBytes(take.get().toPath());screen.recreate();onView(withText("이어 부르기")).check(matches(isEnabled()));assertArrayEquals(saved,java.nio.file.Files.readAllBytes(take.get().toPath()));
        Bitmap bitmap=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();try(FileOutputStream out=new FileOutputStream(new File(context.getExternalFilesDir(null),"karaoke-pause.png"))){bitmap.compress(Bitmap.CompressFormat.PNG,100,out);}bitmap.recycle();
    }
    @Test public void shortReviewShowsTakeDurationAndKeepsPlayingAfterSeek()throws Exception{
        seedTake();onView(withText("녹음 들어보기")).perform(scrollTo(),click());
        screen.onActivity(a->{try{java.lang.reflect.Field clock=KaraokeActivity.class.getDeclaredField("clock");clock.setAccessible(true);assertTrue(((android.widget.TextView)clock.get(a)).getText().toString().contains("0:03"));java.lang.reflect.Method select=KaraokeActivity.class.getDeclaredMethod("selectPosition",double.class);select.setAccessible(true);select.invoke(a,.5);}catch(Exception e){throw new RuntimeException(e);}});
        Thread.sleep(350);onView(withContentDescription("녹음 다시듣기 일시정지")).check(matches(isEnabled()));
        onView(withContentDescription("녹음 다시듣기 일시정지")).perform(scrollTo(),click());Thread.sleep(200);
        onView(withText("녹음 들어보기")).check(matches(isEnabled()));
    }
    @Test public void zzzLyricSwipeAutomaticallyPlaysLeadInAndResumesRecording()throws Exception{
        org.junit.Assume.assumeTrue(android.os.Build.HARDWARE.contains("ranchu")||android.os.Build.HARDWARE.contains("goldfish"));
        try(android.os.ParcelFileDescriptor result=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("pm grant "+context.getPackageName()+" android.permission.RECORD_AUDIO")){try(InputStream in=new android.os.ParcelFileDescriptor.AutoCloseInputStream(result)){while(in.read()!=-1){}}}
        File dry=seedTake();byte[] prefix=java.nio.file.Files.readAllBytes(dry.toPath());
        onView(withText("여기부터 부르기")).perform(click());Thread.sleep(3500);
        onView(withContentDescription("가사를 위아래로 밀어 녹음 위치 변경")).perform(scrollTo(),swipeUp());Thread.sleep(200);
        screen.onActivity(a->{try{java.lang.reflect.Field state=KaraokeActivity.class.getDeclaredField("state");state.setAccessible(true);assertEquals("PREROLL",state.get(a).toString());}catch(Exception e){throw new RuntimeException(e);}});
        Thread.sleep(3400);onView(org.hamcrest.Matchers.allOf(withText("일시정지"),isEnabled())).perform(click());Thread.sleep(300);
        byte[] after=java.nio.file.Files.readAllBytes(dry.toPath());assertTrue(after.length>prefix.length);assertArrayEquals(prefix,java.util.Arrays.copyOf(after,prefix.length));
        Bitmap image=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();try(FileOutputStream out=new FileOutputStream(new File(context.getExternalFilesDir(null),"karaoke-lyrics-swipe.png"))){image.compress(Bitmap.CompressFormat.PNG,100,out);}image.recycle();
    }
    @Test public void engineRejectsMicWithoutPermissionAndCannotMonitorSpeaker()throws Exception{
        File dir=new File(context.getCacheDir(),"permission-test");dir.mkdirs();File mr=new File(dir,"mr"),dry=new File(dir,"dry");try(FileOutputStream out=new FileOutputStream(mr)){out.write(new byte[48000*4]);}
        CountDownLatch ended=new CountDownLatch(1);AtomicReference<String> error=new AtomicReference<>();AtomicReference<KaraokeEngine> holder=new AtomicReference<>();
        screen.onActivity(activity->{KaraokeEngine engine=new KaraokeEngine(activity,mr,dry,(recorded,message)->{assertFalse(recorded);error.set(message);ended.countDown();});holder.set(engine);engine.setMonitor(true);assertFalse(engine.monitoring());try{engine.start(true);}catch(Exception e){throw new RuntimeException(e);}});
        assertTrue(ended.await(5,TimeUnit.SECONDS));assertTrue(error.get().contains("마이크"));assertEquals(0,dry.length());holder.get().close();for(File f:dir.listFiles())f.delete();dir.delete();
    }
    @Test public void zzCompressedCaptureKeepsTimeAndSavesEveryFrame()throws Exception{
        org.junit.Assume.assumeTrue(android.os.Build.HARDWARE.contains("ranchu")||android.os.Build.HARDWARE.contains("goldfish"));
        try(android.os.ParcelFileDescriptor grant=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("pm grant "+context.getPackageName()+" android.permission.RECORD_AUDIO")){try(InputStream in=new android.os.ParcelFileDescriptor.AutoCloseInputStream(grant)){while(in.read()!=-1){}}}
        File dir=new File(context.getFilesDir(),"compressed-capture");assertTrue(dir.isDirectory()||dir.mkdirs());File mr=new File(dir,"mr.m4a"),dry=new File(dir,"dry.pcm");
        AtomicReference<KaraokeEngine> holder=new AtomicReference<>();AtomicReference<String> error=new AtomicReference<>();CountDownLatch ended=new CountDownLatch(1);
        try{
            try(InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("backing-test.m4a")){java.nio.file.Files.copy(in,mr.toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);}
            screen.onActivity(a->{KaraokeEngine engine=new KaraokeEngine(a,mr,dry,(recorded,message)->{error.set(message);ended.countDown();});holder.set(engine);engine.settings=new VocalEffects.Settings(.12f,.5f,.9f,1,.8f,.3f,80,4,.7f);try{engine.start(true);}catch(IOException e){throw new RuntimeException(e);}});
            KaraokeEngine engine=holder.get();long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(engine.position()<.1&&System.nanoTime()<deadline)Thread.sleep(20);assertTrue(engine.position()>=.1);
            long began=System.nanoTime(),lastMove=began,maxStall=0;double from=engine.position(),last=from;
            while(System.nanoTime()-began<TimeUnit.SECONDS.toNanos(6)){Thread.sleep(30);long now=System.nanoTime();double next=engine.position();if(next>last+.001){maxStall=Math.max(maxStall,now-lastMove);lastMove=now;last=next;}}
            double elapsed=(System.nanoTime()-began)/1e9,advanced=engine.position()-from;engine.stop();assertTrue(ended.await(5,TimeUnit.SECONDS));assertNull(error.get());
            assertTrue("Playback lost time: "+advanced+" of "+elapsed,advanced>elapsed-.5);
            assertTrue("Sustained PCM output stalled: "+maxStall/1e6+" ms",maxStall<600_000_000L);
            assertTrue("Dry capture survives stop and storage flush",dry.length()>PcmFiles.RATE*2*5);
            assertEquals(android.os.Build.VERSION.SDK_INT>=29?android.media.MediaRecorder.AudioSource.VOICE_PERFORMANCE:engine.captureSource,engine.captureSource);
            android.util.Log.i("AifectContinuityTest","elapsed_s="+elapsed+" advanced_s="+advanced+" longest_progress_gap_ms="+maxStall/1e6+" underruns="+engine.outputUnderruns+" buffer_frames="+engine.outputBufferFrames+" captured_bytes="+dry.length());
        }finally{if(holder.get()!=null)holder.get().close();for(File file:dir.listFiles())file.delete();dir.delete();}
    }
}
