package kr.co.aifect.app.karaoke;

import android.Manifest;
import android.app.AlertDialog;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.*;
import android.os.*;
import android.text.*;
import android.text.style.ForegroundColorSpan;
import android.view.*;
import android.webkit.CookieManager;
import android.widget.*;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.SwitchCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.*;
import kr.co.aifect.app.BuildConfig;
import org.json.*;
import java.io.*;
import java.util.UUID;
import java.util.concurrent.*;

/** A native singing room, launched from the signed-in song page. No microphone samples cross JS. */
public class KaraokeActivity extends AppCompatActivity {
    private static final int LIME=Color.rgb(198,247,126),BG=Color.rgb(16,18,19),CARD=Color.rgb(28,32,32),MUTED=Color.rgb(164,178,180);
    private final Handler ui=new Handler(Looper.getMainLooper());
    private final ExecutorService files=Executors.newSingleThreadExecutor();
    private enum State{LOADING,READY,COUNTDOWN,RECORDING,REVIEW,PLAYING,UPLOADING}
    private State state=State.LOADING;
    private volatile boolean destroyed;
    private boolean foreground,hasTake,updatingMonitor,uploadComplete;
    private int countdownId;
    private String trackId,draftId;
    private File directory,mr,dry;
    private KaraokeApi api;
    private KaraokeEngine engine;
    private JSONArray words=new JSONArray();
    private LinearLayout content;
    private ScrollView scroll;
    private TextView status,title,previous,line,next,clock,routeLabel;
    private ProgressBar progress;
    private Button record,stop,preview,upload;
    private SwitchCompat monitor;
    private SeekBar echo,room,size,voice,backing,hear,offset;
    private EditText description;
    private CheckBox ownVoice,rights;
    private LinearLayout reviewFields;
    private AudioManager audioManager;
    private ActivityResultLauncher<String> microphone;
    private final AudioDeviceCallback devices=new AudioDeviceCallback(){
        @Override public void onAudioDevicesAdded(AudioDeviceInfo[] d){updateRoute();}
        @Override public void onAudioDevicesRemoved(AudioDeviceInfo[] d){
            if(engine!=null&&engine.headphones()==null&&monitor.isChecked()){
                setMonitor(false);if(state==State.RECORDING)engine.interrupt("이어폰 연결이 끊겨 녹음을 멈췄어요. 녹음은 다시 들을 수 있어요.");
            }updateRoute();
        }
    };
    private final Runnable tick=new Runnable(){public void run(){
        if(destroyed)return;
        if(engine!=null&&(state==State.RECORDING||state==State.PLAYING))drawLyrics(engine.position());
        ui.postDelayed(this,50);
    }};

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        String origin=getIntent().getStringExtra("origin");trackId=getIntent().getStringExtra("trackId");
        if(!KaraokeApi.trustedOrigin(origin,BuildConfig.DEBUG)||trackId==null||!trackId.matches("[\\w-]{1,80}")){finish();return;}
        microphone=registerForActivityResult(new ActivityResultContracts.RequestPermission(),granted->{
            if(!foreground||destroyed)return;
            if(granted)beginCountdown();else message("마이크 권한이 있어야 노래를 녹음할 수 있어요. 다시 누르거나 앱 설정에서 허용해주세요.");
        });
        api=new KaraokeApi(origin,CookieManager.getInstance().getCookie(origin));
        directory=new File(getCacheDir(),"karaoke-"+UUID.randomUUID());
        if(!directory.mkdirs()){finish();return;}
        mr=new File(directory,"mr.pcm");dry=new File(directory,"voice.pcm");
        buildUI();
        audioManager=(AudioManager)getSystemService(AUDIO_SERVICE);audioManager.registerAudioDeviceCallback(devices,ui);
        getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true){public void handleOnBackPressed(){
            if(hasTake&&!uploadComplete)new AlertDialog.Builder(KaraokeActivity.this).setMessage("이 녹음을 저장하지 않고 나갈까요?").setNegativeButton("계속하기",null).setPositiveButton("나가기",(d,w)->finish()).show();
            else finish();
        }});
        ui.post(tick);
        files.execute(()->{
            try{
                JSONObject data=api.json("/api/karaoke/"+trackId,"GET",null);JSONObject song=data.getJSONObject("track");
                if(song.optDouble("duration")>PcmFiles.MAX_SECONDS)throw new IOException("10분 이하 곡만 부를 수 있어요.");
                File compressed=new File(directory,"mr.m4a");
                if(directory.getUsableSpace()<400L*1024*1024)throw new IOException("노래를 녹음하려면 저장공간을 400MB 이상 비워주세요.");
                api.download("/media/"+trackId+"/mr",compressed);BackingDecoder.decode(compressed,mr);compressed.delete();
                ui.post(()->{
                    if(destroyed)return;
                    words=data.optJSONArray("words");if(words==null)words=new JSONArray();
                    title.setText(song.optString("title")+"\n"+song.optString("artist"));
                    engine=new KaraokeEngine(this,mr,dry,this::audioFinished);applySettings();updateRoute();setState(State.READY);
                    message("에코와 룸을 조절한 뒤 시작하세요. 목소리는 업로드 전까지 이 기기에만 있어요.");drawLyrics(0);
                });
            }catch(Exception e){ui.post(()->{if(!destroyed){message(friendly(e));record.setEnabled(false);}});}
        });
    }

    private void buildUI(){
        getWindow().setStatusBarColor(BG);getWindow().setNavigationBarColor(BG);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(BG);
        scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(BG);
        content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(dp(22),dp(16),dp(22),dp(30));scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root,(v,insets)->{androidx.core.graphics.Insets b=insets.getInsets(WindowInsetsCompat.Type.systemBars());v.setPadding(b.left,b.top,b.right,b.bottom);return insets;});
        LinearLayout header=new LinearLayout(this);header.setGravity(Gravity.CENTER_VERTICAL);
        TextView top=text("aifect  /  노래방",16,LIME);top.setTypeface(null,Typeface.BOLD);header.addView(top,new LinearLayout.LayoutParams(0,-2,1));
        Button close=button("닫기",false);close.setOnClickListener(v->getOnBackPressedDispatcher().onBackPressed());header.addView(close);content.addView(header);
        title=text("노래를 준비하고 있어요",23,Color.WHITE);title.setTypeface(null,Typeface.BOLD);add(title,20);
        routeLabel=text("이어폰 연결을 확인하고 있어요",13,MUTED);add(routeLabel,8);
        LinearLayout lyrics=box();previous=text("",15,MUTED);line=text("♪",29,Color.WHITE);next=text("",15,MUTED);
        line.setTypeface(null,Typeface.BOLD);line.setMinHeight(dp(100));line.setGravity(Gravity.CENTER);previous.setGravity(Gravity.CENTER);next.setGravity(Gravity.CENTER);
        lyrics.addView(previous);lyrics.addView(line);lyrics.addView(next);add(lyrics,20);
        progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progress.setMax(1000);progress.setProgressTintList(ColorStateList.valueOf(LIME));add(progress,14);
        clock=text("0:00",13,MUTED);add(clock,4);
        LinearLayout fx=box();fx.addView(text("내 목소리",18,Color.WHITE));
        echo=slider(fx,"에코",65,18,"%",0);room=slider(fx,"룸 리버브",65,16,"%",0);
        size=slider(fx,"룸 크기 · 작게 → 넓게",100,50,"%",0);
        voice=slider(fx,"목소리",200,100,"%",0);backing=slider(fx,"반주",150,80,"%",0);
        monitor=new SwitchCompat(this);monitor.setText("이어폰으로 내 목소리 듣기");monitor.setTextColor(Color.WHITE);monitor.setTextSize(15);monitor.setPadding(0,dp(14),0,dp(14));
        monitor.setOnCheckedChangeListener((b,enabled)->{
            if(updatingMonitor||engine==null)return;
            AudioDeviceInfo route=engine.headphones();
            if(enabled&&route==null){setMonitor(false);message("청음은 이어폰을 연결한 뒤 켤 수 있어요.");return;}
            if(enabled&&KaraokeEngine.bluetooth(route)){
                setMonitor(false);
                new AlertDialog.Builder(this).setTitle("블루투스 청음 안내").setMessage("목소리가 늦게 들릴 수 있어요. 실시간 청음에는 유선·USB 이어폰을 권장해요.")
                    .setNegativeButton("끄기",null).setPositiveButton("그래도 켜기",(d,w)->{if(engine.headphones()!=null)setMonitor(true);}).show();
            }else engine.setMonitor(enabled);
        });fx.addView(monitor);hear=slider(fx,"청음 음량",80,30,"%",0);add(fx,18);
        status=text("반주와 가사를 불러오고 있어요…",13,MUTED);status.setTag("karaoke-status");status.setMinHeight(dp(42));add(status,16);
        record=button("노래 시작",true);record.setOnClickListener(v->{
            if(hasTake)new AlertDialog.Builder(this).setMessage("기존 녹음 대신 다시 부를까요?").setNegativeButton("취소",null).setPositiveButton("다시 부르기",(d,w)->requestRecord()).show();else requestRecord();
        });add(record,10);
        stop=button("그만 부르기",false);stop.setOnClickListener(v->{if(state==State.COUNTDOWN){setState(hasTake?State.REVIEW:State.READY);message("시작을 취소했어요.");}else if(engine!=null)engine.stop();});add(stop,8);
        preview=button("녹음 들어보기",false);preview.setOnClickListener(v->{try{engine.start(false);setState(State.PLAYING);}catch(Exception e){message(friendly(e));}});add(preview,8);
        reviewFields=box();reviewFields.addView(text("다시 듣고 완성하기",18,Color.WHITE));
        reviewFields.addView(text("목소리가 늦으면 + 방향으로 싱크를 맞춰주세요. 에코·룸·음량은 녹음 후에도 바꿀 수 있어요.",13,MUTED));
        offset=slider(reviewFields,"목소리 싱크",1100,380,"ms",-300);
        description=new EditText(this);description.setTextColor(Color.WHITE);description.setHintTextColor(MUTED);description.setHint("커버곡 소개 (선택)");description.setMaxLines(4);description.setFilters(new InputFilter[]{new InputFilter.LengthFilter(1000)});reviewFields.addView(description);
        ownVoice=check("제가 직접 부른 목소리이며 AI 음성 복제가 아닙니다.");rights=check("원곡자의 허용 범위 안에서 이 녹음을 공개할 권리가 있습니다.");reviewFields.addView(ownVoice);reviewFields.addView(rights);
        upload=button("커버곡으로 올리기",true);upload.setOnClickListener(v->upload());reviewFields.addView(upload);
        reviewFields.addView(text("업로드할 때만 녹음이 서버로 전송됩니다. 나가면 기기의 임시 녹음은 삭제됩니다.",12,MUTED));add(reviewFields,18);
        // Singing controls stay reachable while the lyrics/effect panel scrolls.
        LinearLayout controls=new LinearLayout(this);controls.setOrientation(LinearLayout.VERTICAL);controls.setPadding(dp(22),dp(8),dp(22),dp(12));
        content.removeView(status);content.removeView(record);content.removeView(stop);content.removeView(preview);controls.addView(status,new LinearLayout.LayoutParams(-1,-2));
        LinearLayout actions=new LinearLayout(this);for(Button b:new Button[]{record,stop,preview})actions.addView(b,new LinearLayout.LayoutParams(0,-2,1));controls.addView(actions);root.addView(controls);
        setState(State.LOADING);
    }
    private void requestRecord(){
        if(state!=State.READY&&state!=State.REVIEW)return;
        if(ContextCompat.checkSelfPermission(this,Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)beginCountdown();else microphone.launch(Manifest.permission.RECORD_AUDIO);
    }
    private void beginCountdown(){if(!foreground||engine==null)return;setState(State.COUNTDOWN);countdown(3,++countdownId);}
    private void countdown(int n,int id){
        if(state!=State.COUNTDOWN||!foreground||id!=countdownId)return;
        if(n>0){message(n+" · 준비하세요");ui.postDelayed(()->countdown(n-1,id),1000);return;}
        try{engine.setMonitor(monitor.isChecked());engine.start(true);hasTake=false;draftId=null;setState(State.RECORDING);message("녹음 중 · 효과는 실시간으로 조절할 수 있어요.");}
        catch(Exception e){setState(hasTake?State.REVIEW:State.READY);message(friendly(e));}
    }
    private void audioFinished(boolean recorded,String error){
        if(destroyed)return;
        hasTake=hasTake||recorded;setMonitor(false);setState(hasTake?State.REVIEW:State.READY);
        message(error!=null?error:hasTake?"녹음을 들어보고 효과와 싱크를 맞춰주세요.":"녹음이 너무 짧아요. 다시 불러주세요.");
    }
    private void setState(State nextState){
        state=nextState;boolean recording=state==State.RECORDING,playing=state==State.PLAYING,busy=state==State.LOADING||state==State.UPLOADING;
        record.setVisibility(recording||playing||state==State.COUNTDOWN?View.GONE:View.VISIBLE);record.setEnabled(!busy);record.setText(hasTake?"다시 부르기":"노래 시작");
        stop.setVisibility(recording||playing||state==State.COUNTDOWN?View.VISIBLE:View.GONE);stop.setText(playing?"다시 듣기 멈추기":state==State.COUNTDOWN?"취소":"그만 부르기");
        preview.setVisibility(hasTake&&!recording&&!playing&&state!=State.COUNTDOWN?View.VISIBLE:View.GONE);preview.setEnabled(!busy);
        reviewFields.setVisibility(hasTake&&!recording&&state!=State.COUNTDOWN?View.VISIBLE:View.GONE);offset.setEnabled(state==State.REVIEW);
        upload.setEnabled(state==State.REVIEW);description.setEnabled(!busy);ownVoice.setEnabled(!busy);rights.setEnabled(!busy);
        for(SeekBar bar:new SeekBar[]{echo,room,size,voice,backing,hear})bar.setEnabled(!busy);
        monitor.setEnabled(!busy&&!playing);if(recording||playing)getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if(recording||playing)scroll.post(()->scroll.smoothScrollTo(0,0));
    }
    private void applySettings(){if(engine!=null&&offset!=null)engine.settings=new VocalEffects.Settings(echo.getProgress()/100f,room.getProgress()/100f,size.getProgress()/100f,voice.getProgress()/100f,backing.getProgress()/100f,hear.getProgress()/100f,offset.getProgress()-300);}
    private void setMonitor(boolean enabled){updatingMonitor=true;monitor.setChecked(enabled);updatingMonitor=false;if(engine!=null)engine.setMonitor(enabled);}
    private void updateRoute(){
        if(destroyed||routeLabel==null)return;AudioDeviceInfo d=engine==null?null:engine.headphones();
        routeLabel.setText(d==null?"이어폰 미연결 · 청음은 꺼져 있어요":KaraokeEngine.bluetooth(d)?"블루투스 이어폰 · 청음 지연이 있을 수 있어요":"유선 / USB 이어폰 연결됨");
    }
    private void drawLyrics(double seconds){
        if(engine==null)return;double duration=engine.duration();progress.setProgress((int)(seconds/Math.max(1,duration)*1000));clock.setText(time(seconds)+"  /  "+time(duration));
        int current=-1;for(int i=0;i<words.length();i++){JSONObject l=words.optJSONObject(i);if(l!=null&&l.optDouble("s")<=seconds)current=i;else break;}
        previous.setText(lineText(current-1));next.setText(lineText(current+1));
        if(current<0){line.setText("♪");return;}
        JSONArray parts=words.optJSONObject(current).optJSONArray("w");SpannableStringBuilder shown=new SpannableStringBuilder();
        if(parts!=null)for(int i=0;i<parts.length();i++){
            JSONObject w=parts.optJSONObject(i);if(w==null)continue;if(shown.length()>0)shown.append(' ');int at=shown.length();shown.append(w.optString("t"));
            double start=w.optDouble("s"),end=Math.max(start+.05,w.optDouble("e"));
            int filled=(int)Math.round(Math.max(0,Math.min(1,(seconds-start)/(end-start)))*(shown.length()-at));
            if(filled>0)shown.setSpan(new ForegroundColorSpan(LIME),at,at+filled,Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        line.setText(shown);
    }
    private String lineText(int index){JSONObject l=words.optJSONObject(index);if(l==null)return "";JSONArray parts=l.optJSONArray("w");StringBuilder b=new StringBuilder();if(parts!=null)for(int i=0;i<parts.length();i++){if(i>0)b.append(' ');b.append(parts.optJSONObject(i).optString("t"));}return b.toString();}
    private void upload(){
        if(state!=State.REVIEW)return;
        if(!ownVoice.isChecked()||!rights.isChecked()){message("직접 부른 목소리와 공개 권한에 동의해주세요.");return;}
        VocalEffects.Settings settings=engine.settings;String note=description.getText().toString();setState(State.UPLOADING);message("에코와 룸을 반영해 커버곡을 만들고 있어요…");
        files.execute(()->{
            try{
                File wav=new File(directory,"cover.wav");PcmFiles.export(mr,dry,wav,settings);
                if(draftId==null){JSONObject body=new JSONObject().put("original_id",trackId).put("description",note).put("own_voice",true).put("rights",true).put("extension","wav").put("bytes",wav.length());draftId=api.json("/api/covers","POST",body).getString("id");}
                ui.post(()->{if(!destroyed)message("커버곡을 업로드하고 있어요…");});api.upload(draftId,wav);api.json("/api/uploads/"+draftId+"/complete","POST",new JSONObject());
                ui.post(()->{if(!destroyed){uploadComplete=true;setResult(RESULT_OK,new Intent().putExtra("uploadedId",draftId));finish();}});
            }catch(Exception e){ui.post(()->{if(!destroyed){setState(State.REVIEW);message(friendly(e)+" 녹음은 남아 있어요.");}});}
        });
    }
    @Override protected void onResume(){super.onResume();foreground=true;updateRoute();}
    @Override protected void onStop(){
        foreground=false;if(engine!=null&&(state==State.RECORDING||state==State.PLAYING))engine.interrupt("앱이 백그라운드로 전환되어 마이크와 재생을 멈췄어요.");
        if(state==State.COUNTDOWN)setState(hasTake?State.REVIEW:State.READY);super.onStop();
    }
    @Override protected void onDestroy(){
        destroyed=true;ui.removeCallbacksAndMessages(null);if(audioManager!=null)audioManager.unregisterAudioDeviceCallback(devices);if(api!=null)api.cancel();files.shutdownNow();
        new Thread(()->{if(engine!=null)engine.close();try{files.awaitTermination(50,TimeUnit.SECONDS);}catch(InterruptedException ignored){}if(directory!=null){File[] children=directory.listFiles();if(children!=null)for(File f:children)if(f.isFile())f.delete();directory.delete();}},"KaraokeCleanup").start();
        super.onDestroy();
    }
    private void message(String message){status.setText(message);}
    private static String friendly(Exception e){String m=e.getMessage();return m==null||m.isBlank()?"완료하지 못했어요. 다시 시도해주세요.":m;}
    private static String time(double s){int n=(int)Math.max(0,s);return String.format(java.util.Locale.ROOT,"%d:%02d",n/60,n%60);}
    private int dp(int x){return Math.round(x*getResources().getDisplayMetrics().density);}
    private TextView text(String value,int sp,int color){TextView v=new TextView(this);v.setText(value);v.setTextSize(sp);v.setTextColor(color);v.setLineSpacing(dp(4),1);return v;}
    private void add(View v,int top){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(top);content.addView(v,p);}
    private LinearLayout box(){LinearLayout v=new LinearLayout(this);v.setOrientation(LinearLayout.VERTICAL);v.setPadding(dp(18),dp(18),dp(18),dp(18));GradientDrawable bg=new GradientDrawable();bg.setColor(CARD);bg.setCornerRadius(dp(18));v.setBackground(bg);return v;}
    private Button button(String label,boolean primary){Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextColor(primary?BG:Color.WHITE);b.setTextSize(16);b.setMinHeight(dp(52));b.setBackgroundTintList(ColorStateList.valueOf(primary?LIME:CARD));return b;}
    private CheckBox check(String label){CheckBox c=new CheckBox(this);c.setText(label);c.setTextColor(MUTED);c.setTextSize(13);c.setButtonTintList(ColorStateList.valueOf(LIME));return c;}
    private SeekBar slider(LinearLayout parent,String name,int max,int initial,String unit,int displayOffset){
        TextView label=text(name+"  "+(initial+displayOffset)+unit,14,MUTED);label.setPadding(0,dp(13),0,0);parent.addView(label);
        SeekBar bar=new SeekBar(this);bar.setMax(max);bar.setProgress(initial);bar.setContentDescription(name);bar.setProgressTintList(ColorStateList.valueOf(LIME));bar.setThumbTintList(ColorStateList.valueOf(LIME));bar.setMinimumHeight(dp(44));parent.addView(bar,new LinearLayout.LayoutParams(-1,dp(44)));
        bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onStartTrackingTouch(SeekBar b){}public void onStopTrackingTouch(SeekBar b){}public void onProgressChanged(SeekBar b,int value,boolean user){label.setText(name+"  "+(value+displayOffset)+unit);applySettings();}});return bar;
    }
}
