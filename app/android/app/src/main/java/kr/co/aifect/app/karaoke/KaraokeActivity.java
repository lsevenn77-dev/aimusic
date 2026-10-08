package kr.co.aifect.app.karaoke;

import android.Manifest;
import android.app.AlertDialog;
import android.content.Intent;
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
import kr.co.aifect.app.NativeSession;
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
import java.util.concurrent.*;

/** A native singing room, launched from the signed-in song page. No microphone samples cross JS. */
public class KaraokeActivity extends AppCompatActivity {
    private static final int PINK=Color.rgb(241,120,181),BG=Color.rgb(15,17,23),CARD=Color.rgb(23,25,35),MUTED=Color.rgb(162,163,175);
    private final Handler ui=new Handler(Looper.getMainLooper());
    private final ExecutorService files=Executors.newSingleThreadExecutor();
    private enum State{LOADING,READY,COUNTDOWN,PREROLL,RECORDING,SEEKING,PAUSED,STOPPING,REVIEW,PLAYING,GUIDE,UPLOADING}
    private State state=State.LOADING;
    private volatile boolean destroyed;
    private boolean foreground,hasTake,updatingMonitor,uploadComplete,monitorOptOut;
    private int countdownId;
    private double cursor,guideStart;
    private boolean pauseRequested,guideThenRecord,keepDraft;
    private boolean lyricScrubbing,resumeAfterScrub,resumePlaybackAfterScrub,resumeGuideAfterScrub,audioSettling,reviewPosition;
    private Double pendingSeek;
    private LyricsTimelineView lyricWheel;
    private File original,sessionFile;
    private Button pause,restart,guide,pickLine,soloMode,duetMode;
    private String lyricTextSize="normal";
    private final java.util.ArrayList<Button> lyricSizeButtons=new java.util.ArrayList<>();
    private SeekBar timeline;
    private SwitchCompat autoSync;
    private TextView syncResult;
    private String trackId,draftId,coverMode="solo",duetPart="",duetParent="";
    private File directory,mr,dry;
    private KaraokeApi api;
    private KaraokeEngine engine;
    private JSONArray words=new JSONArray();
    private JSONObject duetGuide=DuetGuide.empty();private LinearLayout duetGuideBox;private Button editParts;private DuetPartEditor partEditor;
    private LinearLayout content;
    private ScrollView scroll;
    private TextView status,title,clock,routeLabel;
    private ProgressBar progress;
    private Button record,stop,preview,previewPause,upload,slower,faster,resetSync;
    private SwitchCompat monitor;
    private SeekBar echo,room,size,voice,backing,hear,offset,noise,effectStrength,toneControl;
    private Button customButton,customMore;private LinearLayout customDetails;private JSONObject customSettings;
    private String presetId="studio";private float toneAmount=.5f;private boolean updatingPreset;
    private final java.util.ArrayList<Button> presetButtons=new java.util.ArrayList<>(),noiseButtons=new java.util.ArrayList<>();
    private TextView presetDescription;
    private EditText description;
    private CheckBox ownVoice,rights;
    private LinearLayout reviewFields,syncFields;
    private AudioManager audioManager;
    private ActivityResultLauncher<String> microphone,saveAudio;
    private final AudioDeviceCallback devices=new AudioDeviceCallback(){
        @Override public void onAudioDevicesAdded(AudioDeviceInfo[] d){updateRoute();}
        @Override public void onAudioDevicesRemoved(AudioDeviceInfo[] d){
            if(engine!=null&&engine.headphones()==null&&monitor.isChecked()){
                setMonitor(false);if(state==State.RECORDING||state==State.PREROLL)engine.interrupt("이어폰 연결이 끊겨 녹음을 멈췄어요. 녹음은 다시 들을 수 있어요.");
            }updateRoute();
        }
    };
    private final Runnable tick=new Runnable(){public void run(){
        if(destroyed)return;
        if(engine!=null&&(state==State.RECORDING||state==State.PREROLL||state==State.PLAYING||state==State.GUIDE)){
            double at=engine.position();drawLyrics(state==State.PREROLL?Math.max(at,engine.recordPosition()):at);
            if(state==State.PREROLL){if(!engine.preRolling()){setState(State.RECORDING);message("녹음 중 · 가사를 밀면 그 구간부터 다시 불러요.");}else message("반주 먼저 듣기 · "+Math.max(1,(int)Math.ceil(engine.recordPosition()-at))+"초 뒤 녹음 시작");}
        }
        ui.postDelayed(this,50);
    }};

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        String origin=getIntent().getStringExtra("origin");trackId=getIntent().getStringExtra("trackId");
        if(!KaraokeApi.trustedOrigin(origin,BuildConfig.DEBUG)||trackId==null||!trackId.matches("[\\w-]{1,80}")){finish();return;}
        coverMode="duet".equals(getIntent().getStringExtra("coverMode"))?"duet":"solo";
        duetPart=getIntent().getStringExtra("duetPart");if(!"male".equals(duetPart)&&!"female".equals(duetPart))duetPart=coverMode.equals("duet")?"male":"";
        duetParent=getIntent().getStringExtra("duetParentId");if(duetParent==null)duetParent="";if(!duetParent.isEmpty()&&!duetParent.matches("[\\w-]{1,80}")){finish();return;}
        microphone=registerForActivityResult(new ActivityResultContracts.RequestPermission(),granted->{
            if(!foreground||destroyed)return;
            if(granted)beginCountdown();else message("마이크 권한이 있어야 노래를 녹음할 수 있어요. 다시 누르거나 앱 설정에서 허용해주세요.");
        });
        saveAudio=registerForActivityResult(new ActivityResultContracts.CreateDocument("audio/wav"),uri->{if(uri==null||engine==null)return;VocalEffects.Settings chosen=engine.settings;setState(State.UPLOADING);message("부른 구간만 저장하고 있어요…");files.execute(()->{try{File wav=new File(directory,"saved-cover.wav");BackingDecoder.export(mr,dry,wav,chosen,coverMode.equals("duet"));try(InputStream in=new FileInputStream(wav);OutputStream out=getContentResolver().openOutputStream(uri)){if(out==null)throw new IOException("저장할 파일을 열 수 없어요.");byte[] bytes=new byte[65536];int n;while((n=in.read(bytes))!=-1)out.write(bytes,0,n);}ui.post(()->{if(!destroyed){setState(State.REVIEW);message("부른 구간을 WAV 파일로 저장했어요.");}});}catch(Exception e){ui.post(()->{if(!destroyed){setState(State.REVIEW);message(friendly(e));}});}});});
        api=new KaraokeApi(origin,NativeSession.cookie(this));
        String account=getIntent().getStringExtra("ownerId");
        String owner=draftOwner(origin,account==null?NativeSession.cookie(this):"user:"+account);
        directory=new File(getFilesDir(),"karaoke-"+trackId+(coverMode.equals("duet")?"-duet-"+duetPart+"-"+(duetParent.isEmpty()?"first":duetParent):"")+"-"+owner);
        boolean restoreDraft=getIntent().getBooleanExtra("resumeDraft",false);
        String chosenFolder=getIntent().getStringExtra("draftFolder");
        String expected=directory.getName();
        if(restoreDraft&&chosenFolder!=null&&!chosenFolder.isEmpty()){
            String base=expected.substring(0,expected.length()-owner.length()-1);
            if(chosenFolder.equals(expected)||chosenFolder.matches(java.util.regex.Pattern.quote(base)+"-take-[a-f0-9-]{36}-"+owner))directory=new File(getFilesDir(),chosenFolder);else{finish();return;}
        }else if(!restoreDraft)directory=new File(getFilesDir(),expected.substring(0,expected.length()-owner.length()-1)+"-take-"+java.util.UUID.randomUUID()+"-"+owner);
        if(!directory.exists()&&!directory.mkdirs()){finish();return;}
        mr=new File(directory,"mr.m4a");dry=new File(directory,"voice.pcm");original=new File(directory,"guide.m4a");sessionFile=new File(directory,"session.json");
        lyricTextSize=validLyricTextSize(getSharedPreferences("karaoke_display",MODE_PRIVATE).getString("lyricTextSize","normal"));
        buildUI();
        audioManager=(AudioManager)getSystemService(AUDIO_SERVICE);audioManager.registerAudioDeviceCallback(devices,ui);
        getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true){public void handleOnBackPressed(){
            if((hasTake||state==State.RECORDING||state==State.PREROLL)&&!uploadComplete)new AlertDialog.Builder(KaraokeActivity.this).setMessage("이 녹음을 임시 저장하고 나갈까요? 초안 목록에서 이어서 편집할 수 있어요.").setNegativeButton("계속하기",null).setNeutralButton("녹음 버리기",(d,w)->{keepDraft=false;finish();}).setPositiveButton("임시 저장 후 닫기",(d,w)->{keepDraft=true;finish();}).show();
            else finish();
        }});
        ui.post(tick);
        if(restoreDraft&&duetParent.isEmpty()&&dry.length()>PcmFiles.RATE/5&&mr.length()>0&&sessionFile.exists())try{
            JSONObject cached=new JSONObject(new String(java.nio.file.Files.readAllBytes(sessionFile.toPath()),java.nio.charset.StandardCharsets.UTF_8));words=cached.optJSONArray("words");if(words==null)words=new JSONArray();title.setText(cached.optString("title","내 임시 녹음"));engine=new KaraokeEngine(this,mr,dry,this::audioFinished);engine.fullLengthMix=coverMode.equals("duet");restoreSession();applySettings();hasTake=true;setState(State.PAUSED);drawLyrics(cursor);message("임시 녹음을 복원했어요. 이어 부르거나 들어보고 편집하세요.");return;
        }catch(Exception ignored){}
        files.execute(()->{
            try{
                JSONObject data=api.json(duetParent.isEmpty()?"/api/karaoke/"+trackId:"/api/duets/"+duetParent,"GET",null);if(!data.getJSONObject("track").optString("id").equals(trackId))throw new IOException("듀엣 원곡을 확인해주세요.");JSONObject song=data.getJSONObject("track");
                if(song.optDouble("duration")>PcmFiles.MAX_SECONDS)throw new IOException("10분 이하 곡만 부를 수 있어요.");
                if(directory.getUsableSpace()<200L*1024*1024)throw new IOException("녹음과 파일 저장을 위해 저장공간을 200MB 이상 비워주세요.");
                if(mr.length()==0)api.download(data.getString("mr"),mr,(done,total)->ui.post(()->{if(!destroyed)message(total>0?"반주 다운로드 "+(done*100/total)+"%":"반주 다운로드 · "+(done/1024)+"KB");}));
                try{BackingDecoder.frames(mr);}catch(IOException error){mr.delete();throw error;}
                mr.setLastModified(System.currentTimeMillis());new File(directory,"mr.pcm").delete();new File(directory,"guide.pcm").delete();trimBackingCache();
                ui.post(()->{
                    if(destroyed)return;
                    words=data.optJSONArray("words");if(words==null)words=new JSONArray();if(!duetParent.isEmpty()){JSONObject duet=data.optJSONObject("duet");duetGuide=duet==null?null:duet.optJSONObject("guide");}
                    title.setText(song.optString("title")+"\n"+song.optString("artist"));loadArtwork(song);
                    engine=new KaraokeEngine(this,mr,dry,this::audioFinished);engine.fullLengthMix=coverMode.equals("duet");if(restoreDraft)restoreSession();else cursor=0;applySettings();updateRoute();hasTake=dry.length()>PcmFiles.RATE/5;setState(hasTake?State.PAUSED:State.READY);
                    message(hasTake?"임시 녹음을 복원했어요. 가사를 밀어 다시 부를 위치를 골라주세요.":"준비됐어요. 가사를 위아래로 밀어 부를 위치를 고르세요.");drawLyrics(cursor);
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
        ImageView top=new ImageView(this);top.setImageResource(kr.co.aifect.app.R.drawable.aifect_wordmark_vector);top.setContentDescription("AIFECT");top.setScaleType(ImageView.ScaleType.FIT_START);header.addView(top,new LinearLayout.LayoutParams(0,dp(30),1));
        Button close=button("닫기",false);close.setOnClickListener(v->getOnBackPressedDispatcher().onBackPressed());header.addView(close);content.addView(header);
        LinearLayout monitoring=box();
        monitor=new SwitchCompat(this);monitor.setText("이어폰으로 내 목소리 듣기");monitor.setTextColor(Color.WHITE);monitor.setTextSize(15);monitor.setPadding(0,dp(14),0,dp(14));
        monitor.setOnCheckedChangeListener((b,enabled)->{
            if(updatingMonitor||engine==null)return;monitorOptOut=!enabled;
            AudioDeviceInfo route=engine.headphones();
            if(enabled&&route==null){setMonitor(false);message("청음은 이어폰을 연결한 뒤 켤 수 있어요.");return;}
            if(enabled&&KaraokeEngine.bluetooth(route)){
                setMonitor(false);
                new AlertDialog.Builder(this).setTitle("블루투스 청음 안내").setMessage("목소리가 늦게 들릴 수 있어요. 실시간 청음에는 유선·USB 이어폰을 권장해요.")
                    .setNegativeButton("끄기",null).setPositiveButton("그래도 켜기",(d,w)->{if(engine.headphones()!=null)setMonitor(true);}).show();
            }else engine.setMonitor(enabled);
        });monitoring.addView(monitor);
        routeLabel=text("이어폰 연결을 확인하고 있어요",13,MUTED);monitoring.addView(routeLabel);
        hear=slider(monitoring,"청음 음량",100,100,"%",0);add(monitoring,12);
        if(duetParent.isEmpty()){
            LinearLayout modes=new LinearLayout(this);soloMode=button("솔로",coverMode.equals("solo"));duetMode=button("듀엣",coverMode.equals("duet"));
            soloMode.setSelected(coverMode.equals("solo"));duetMode.setSelected(coverMode.equals("duet"));
            soloMode.setOnClickListener(v->changeMode("solo"));duetMode.setOnClickListener(v->changeMode("duet"));
            LinearLayout.LayoutParams left=new LinearLayout.LayoutParams(0,-2,1);left.rightMargin=dp(8);modes.addView(soloMode,left);modes.addView(duetMode,new LinearLayout.LayoutParams(0,-2,1));add(modes,18);
        }else add(text("듀엣",17,PINK),18);
        if(coverMode.equals("duet")){duetGuideBox=box();add(duetGuideBox,12);}
        if(coverMode.equals("duet"))add(text(duetParent.isEmpty()?"내 파트만 부르면 다른 사람이 이 녹음을 불러와 빈 파트를 더할 수 있어요.":"먼저 녹음한 목소리를 들으며 내 파트를 더하세요.",14,MUTED),8);
        title=text("노래를 준비하고 있어요",23,Color.WHITE);title.setTypeface(null,Typeface.BOLD);add(title,20);
        LinearLayout lyrics=box();LinearLayout topTransport=new LinearLayout(this);lyrics.addView(topTransport);
        lyrics.addView(text("가사를 위아래로 밀어 이동",16,Color.WHITE));
        lyrics.addView(text("녹음 중 이동하면 선택한 가사 3초 전 반주부터 이어 불러요. 선택 지점 뒤의 녹음은 교체돼요.",12,MUTED));
        lyricWheel=new LyricsTimelineView(this);lyricWheel.setTag("karaoke-lyrics");lyricWheel.setListener(new LyricsTimelineView.Listener(){public void begin(){beginScrub();}public void preview(double seconds){previewScrub(seconds);}public void selected(double seconds){endScrub(seconds);}public void cancelled(){cancelScrub();}});
        lyrics.addView(lyricWheel,new LinearLayout.LayoutParams(-1,dp(380)));add(lyrics,20);
        pickLine=button("가사 펼치기 · 시작 위치 선택",false);pickLine.setOnClickListener(v->chooseLine());add(pickLine,8);
        timeline=new SeekBar(this);timeline.setMax(1000);timeline.setContentDescription("노래 위치");timeline.setMinimumHeight(dp(44));
        timeline.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onStartTrackingTouch(SeekBar b){beginScrub();}public void onStopTrackingTouch(SeekBar b){endScrub(cursor);}public void onProgressChanged(SeekBar b,int n,boolean user){if(user&&engine!=null)previewScrub(displayDuration()*n/1000);}});add(timeline,8);
        progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progress.setMax(1000);progress.setProgressTintList(ColorStateList.valueOf(PINK));add(progress,14);
        clock=text("0:00",13,MUTED);add(clock,4);
        syncFields=box();syncFields.addView(text("들으면서 싱크 맞추기",18,Color.WHITE));
        syncFields.addView(text("들어보며 조절하세요. 목소리가 늦으면 빠르게, 먼저 들리면 느리게 맞춰주세요.",13,MUTED));
        offset=slider(syncFields,"목소리 싱크",400,200,"ms",-200);
        LinearLayout fineSync=new LinearLayout(this);
        slower=button("느리게",false);slower.setContentDescription("목소리를 5ms 느리게");slower.setOnClickListener(v->offset.setProgress(Math.max(0,offset.getProgress()-5)));
        resetSync=button("기본값",false);resetSync.setContentDescription("목소리 싱크 기본값 0ms");resetSync.setOnClickListener(v->offset.setProgress(-syncMinimum));
        faster=button("빠르게",false);faster.setContentDescription("목소리를 5ms 빠르게");faster.setOnClickListener(v->offset.setProgress(Math.min(offset.getMax(),offset.getProgress()+5)));
        for(Button b:new Button[]{slower,resetSync,faster})fineSync.addView(b,new LinearLayout.LayoutParams(0,-2,1));syncFields.addView(fineSync);add(syncFields,18);
        LinearLayout automatic=box();autoSync=new SwitchCompat(this);autoSync.setText("기기 지연 자동 보정");autoSync.setTextColor(Color.WHITE);autoSync.setChecked(true);autoSync.setOnCheckedChangeListener((b,on)->{if(engine!=null)engine.autoSync=on;});automatic.addView(autoSync);
        syncResult=text("녹음 중 마이크와 반주의 기기 시간을 비교해 보정해요. 노래를 부르는 박자 자체를 바꾸지는 않아요. 기기 측정이 불가능하면 기본 80ms를 적용하며 직접 조절할 수 있어요.",13,MUTED);automatic.addView(syncResult);add(automatic,14);
        LinearLayout fx=box();fx.addView(text("목소리 효과",18,Color.WHITE));
        for(int row=0;row<2;row++){LinearLayout choices=new LinearLayout(this);for(int col=0;col<2;col++){final int n=row*2+col;Button choice=new PresetTileButton(this,VocalPreset.NAMES[n],VocalPreset.IDS[n]);choice.setTag("vocal-preset-"+VocalPreset.IDS[n]);choice.setOnClickListener(v->selectPreset(VocalPreset.IDS[n],50));presetButtons.add(choice);LinearLayout.LayoutParams bp=new LinearLayout.LayoutParams(0,-2,1);bp.setMargins(dp(3),dp(4),dp(3),dp(4));choices.addView(choice,bp);}fx.addView(choices);}
        customButton=new PresetTileButton(this,"사용자 설정","custom");customButton.setTag("vocal-preset-custom");customButton.setOnClickListener(v->selectPreset("custom",50));fx.addView(customButton);
        presetDescription=text(VocalPreset.DESCRIPTIONS[2],13,MUTED);fx.addView(presetDescription);
        effectStrength=slider(fx,"효과 강도",100,50,"%",0);
        fx.addView(text("버튼 하나로 목소리와 울림을 함께 맞춰요. 원래 녹음은 보존돼요.",12,MUTED));
        fx.addView(text("잡음 정리",15,Color.WHITE));LinearLayout noiseChoices=new LinearLayout(this);int[] levels={0,2,4};String[] labels={"끔","기본","강하게"};
        for(int i=0;i<3;i++){final int n=levels[i];Button choice=button(labels[i],false);choice.setTag(n);choice.setOnClickListener(v->{noise.setProgress(n);refreshPresets();});noiseButtons.add(choice);LinearLayout.LayoutParams np=new LinearLayout.LayoutParams(0,-2,1);np.setMargins(dp(3),dp(4),dp(3),dp(4));noiseChoices.addView(choice,np);}fx.addView(noiseChoices);
        fx.addView(text("선 마찰로 생기는 저음 진동과 작은 배경 잡음을 줄여요. 직접 부딪치는 큰 소리는 남을 수 있어요.",12,MUTED));
        LinearLayout details=customDetails=new LinearLayout(this);details.setOrientation(LinearLayout.VERTICAL);details.setVisibility(View.GONE);
        Button more=customMore=button("사용자 설정 직접 편집",false);more.setOnClickListener(v->{boolean open=details.getVisibility()!=View.VISIBLE;details.setVisibility(open?View.VISIBLE:View.GONE);more.setText(open?"사용자 설정 접기":"사용자 설정 직접 편집");});fx.addView(more);fx.addView(details);
        echo=slider(details,"에코 크기",65,1,"%",0);room=slider(details,"리버브 강도",100,15,"%",0);size=slider(details,"룸 크기",100,15,"%",0);
        toneControl=slider(details,"음색 보정",100,50,"%",0);
        details.addView(text("직접 맞춘 값은 다른 효과를 듣고 사용자 설정으로 돌아와도 유지돼요.",12,MUTED));
        noise=slider(details,"잡음 제거",4,2,"단계",1);add(fx,18);
        LinearLayout volumes=box();volumes.addView(text("음량",18,Color.WHITE));voice=slider(volumes,"내 목소리",200,100,"%",0);backing=slider(volumes,duetParent.isEmpty()?"반주":"먼저 녹음한 목소리 + 반주",150,duetParent.isEmpty()?80:100,"%",0);add(volumes,14);refreshPresets();
        status=text("반주와 가사를 불러오고 있어요…",13,MUTED);status.setTag("karaoke-status");status.setMinHeight(dp(42));add(status,16);
        record=button("노래 시작",true);record.setOnClickListener(v->{
            if(hasTake&&cursor<dry.length()/2.0/PcmFiles.RATE-.1)new AlertDialog.Builder(this).setMessage(time(cursor)+"부터 다시 부르면 그 뒤의 기존 녹음을 교체해요. 앞부분은 남아요.").setNegativeButton("취소",null).setPositiveButton("여기부터 부르기",(d,w)->requestRecord()).show();else requestRecord();
        });add(record,10);
        stop=button("그만 부르기",false);stop.setOnClickListener(v->{if(state==State.COUNTDOWN){countdownId++;setState(hasTake?State.REVIEW:State.READY);message("시작을 취소했어요.");}else if(engine!=null){returnToRecording=false;pauseRequested=false;pendingSeek=null;resumeAfterScrub=false;resumePlaybackAfterScrub=false;resumeGuideAfterScrub=false;reviewPosition=state==State.PLAYING;if(reviewPosition)cursor=engine.position();setState(State.STOPPING);engine.stop();}});add(stop,8);
        preview=button("녹음 들어보기",false);preview.setOnClickListener(v->playTake());topTransport.addView(preview,new LinearLayout.LayoutParams(0,-2,1));
        previewPause=button("일시정지",false);previewPause.setContentDescription("녹음 다시듣기 일시정지");previewPause.setOnClickListener(v->{cursor=engine.position();reviewPosition=true;pauseRequested=false;setState(State.STOPPING);engine.stop();});topTransport.addView(previewPause,new LinearLayout.LayoutParams(0,-2,1));
        pause=button("일시정지",false);pause.setOnClickListener(v->pauseTake());
        restart=new TransportButton(this,"재시작","restart",false);restart.setTag("recording-restart");restart.setContentDescription("처음부터 다시 녹음");restart.setOnClickListener(v->{
            if(engine==null)return;
            new AlertDialog.Builder(this).setTitle("처음부터 다시 부를까요?").setMessage("처음부터 다시 녹음해요. 새로 부르는 구간의 기존 녹음은 교체돼요.").setNegativeButton("취소",null).setPositiveButton("재시작",(dialog,which)->{if(!restart.isEnabled())return;boolean singing=state==State.RECORDING||state==State.PREROLL;returnToRecording=true;selectPosition(0);if(!singing)requestRecord();}).show();
        });
        guide=button("원곡 가이드 듣기",false);guide.setOnClickListener(v->{if(state==State.GUIDE){guideThenRecord=true;engine.stop();setState(State.STOPPING);}else startGuide();});guide.setVisibility(View.GONE);
        reviewFields=box();reviewFields.addView(text("내 커버곡 공개하기",18,Color.WHITE));
        description=new EditText(this);description.setTextColor(Color.WHITE);description.setHintTextColor(MUTED);description.setHint("커버곡 소개 (선택)");description.setMaxLines(4);description.setFilters(new InputFilter[]{new InputFilter.LengthFilter(1000)});reviewFields.addView(description);
        ownVoice=check("제가 직접 부른 목소리이며 AI 음성 복제가 아닙니다.");rights=check("원곡자의 허용 범위 안에서 이 녹음을 공개할 권리가 있습니다.");reviewFields.addView(ownVoice);reviewFields.addView(rights);
        upload=button("커버곡으로 올리기",true);upload.setOnClickListener(v->upload());reviewFields.addView(upload);
        Button saveLocal=button("부른 구간 파일로 저장",false);saveLocal.setOnClickListener(v->{if(state==State.REVIEW||state==State.PAUSED)checkPremiumExport();});reviewFields.addView(saveLocal);
        reviewFields.addView(text("녹음과 효과는 현재 기기에 계정별로 임시저장돼요. 다른 기기로 동기화되지 않으며 앱 데이터를 지우면 사라져요. 공개할 때만 서버로 전송돼요.",12,MUTED));add(reviewFields,18);
        // Singing controls stay reachable while the lyrics/effect panel scrolls.
        LinearLayout controls=new LinearLayout(this);controls.setOrientation(LinearLayout.VERTICAL);controls.setPadding(dp(16),dp(8),dp(16),dp(12));
        content.removeView(status);content.removeView(record);content.removeView(stop);content.removeView(preview);controls.addView(status,new LinearLayout.LayoutParams(-1,-2));
        LinearLayout actions=new LinearLayout(this);for(Button b:new Button[]{record,pause,stop})actions.addView(b,new LinearLayout.LayoutParams(0,-2,1));controls.addView(actions);root.addView(controls);
        arrangeStudioUI(root,header,monitoring,lyrics,fx,volumes,automatic,controls);
        setState(State.LOADING);
    }
    private LinearLayout recordingPanel,postPanel,bottomControls,soundSettings,reverbSettings,postSound,postReverb;
    private android.app.Dialog settingsDialog;
    private TakeWaveformView waveform;private long waveformStamp=-1;
    private boolean returnToRecording;private LinearLayout songCard,publicationFields;private int syncMinimum=-200;private TextView syncLeft,syncRight,syncValue;
    private android.widget.ImageView songArt;
    private TextView recordingNow,recordingEnd;
    private void attach(View view,LinearLayout host){if(view.getParent()==host)return;if(view.getParent() instanceof android.view.ViewGroup)((android.view.ViewGroup)view.getParent()).removeView(view);host.addView(view,new LinearLayout.LayoutParams(-1,-2));}
    private void moveSlider(SeekBar bar,LinearLayout host){LinearLayout source=(LinearLayout)bar.getParent();View label=source.getChildAt(source.indexOfChild(bar)-1);source.removeView(label);source.removeView(bar);attach(label,host);attach(bar,host);}
    private void styleStep(LinearLayout box,String heading){box.setPadding(dp(10),dp(12),dp(10),dp(12));if(box.getChildCount()>0&&box.getChildAt(0) instanceof TextView){TextView label=(TextView)box.getChildAt(0);label.setText(heading);label.setTextSize(16);label.setTypeface(null,Typeface.BOLD);}GradientDrawable background=new GradientDrawable();background.setColor(CARD);background.setStroke(dp(1),Color.rgb(47,46,55));background.setCornerRadius(dp(12));box.setBackground(background);}
    private void arrangeStudioUI(LinearLayout root,LinearLayout header,LinearLayout monitoring,LinearLayout lyrics,LinearLayout fx,LinearLayout volumes,LinearLayout automatic,LinearLayout controls){
        LinearLayout transport=(LinearLayout)record.getParent();transport.setGravity(Gravity.CENTER_VERTICAL);transport.removeAllViews();record.setTag("recording-primary");pause.setTag("recording-pause");stop.setTag("recording-complete");for(Button b:new Button[]{pause,record,restart,stop})transport.addView(b,b==record?new LinearLayout.LayoutParams(dp(96),-2):new LinearLayout.LayoutParams(0,-2,1));
        bottomControls=controls;content.removeAllViews();content.setPadding(dp(16),dp(12),dp(16),dp(20));content.addView(header);
        songCard=box();LinearLayout songRow=new LinearLayout(this);songRow.setGravity(Gravity.CENTER_VERTICAL);songArt=new ImageView(this);songArt.setScaleType(ImageView.ScaleType.CENTER_CROP);GradientDrawable artBg=new GradientDrawable();artBg.setColor(Color.rgb(42,35,45));artBg.setCornerRadius(dp(8));songArt.setBackground(artBg);songArt.setClipToOutline(true);songArt.setImageResource(android.R.drawable.ic_media_play);songArt.setContentDescription("앨범 표지");songRow.addView(songArt,new LinearLayout.LayoutParams(dp(58),dp(58)));
        title.setTextSize(18);LinearLayout.LayoutParams titleParams=new LinearLayout.LayoutParams(0,-2,1);titleParams.setMargins(dp(14),0,0,0);songRow.addView(title,titleParams);songCard.addView(songRow);Button settings=button("세부 설정",false);settings.setTag("recording-settings");settings.setContentDescription("녹음 소리와 효과 세부 설정");settings.setTextSize(13);settings.setMinHeight(dp(48));settings.setOnClickListener(v->openSettings());LinearLayout.LayoutParams settingsParams=new LinearLayout.LayoutParams(-2,-2);settingsParams.gravity=Gravity.END;settingsParams.topMargin=dp(8);songCard.addView(settings,settingsParams);add(songCard,12);
        recordingPanel=new LinearLayout(this);recordingPanel.setOrientation(LinearLayout.VERTICAL);add(recordingPanel,12);
        if(soloMode!=null)attach((View)soloMode.getParent(),recordingPanel);
        else if(coverMode.equals("duet"))attach(text("듀엣",17,PINK),recordingPanel);
        if(duetGuideBox!=null)attach(duetGuideBox,recordingPanel);
        if(coverMode.equals("duet")){LinearLayout legend=new LinearLayout(this);legend.setTag("duet-legend");legend.setPadding(dp(8),dp(12),0,dp(14));TextView mine=text("● 내 파트",14,PINK),partner=text("● 파트너 파트",14,Color.rgb(69,223,199));legend.addView(mine);LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-2,-2);p.leftMargin=dp(24);legend.addView(partner,p);attach(legend,recordingPanel);
            GradientDrawable background=new GradientDrawable();background.setColor(Color.rgb(75,80,82));background.setCornerRadius(dp(4));background.setSize(dp(200),dp(5));GradientDrawable fill=new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,new int[]{PINK,Color.rgb(69,223,199)});fill.setCornerRadius(dp(4));fill.setSize(dp(200),dp(5));android.graphics.drawable.LayerDrawable bar=new android.graphics.drawable.LayerDrawable(new android.graphics.drawable.Drawable[]{background,new android.graphics.drawable.ClipDrawable(fill,Gravity.LEFT,android.graphics.drawable.ClipDrawable.HORIZONTAL)});bar.setId(0,android.R.id.background);bar.setId(1,android.R.id.progress);timeline.setProgressDrawable(bar);timeline.setProgressTintList(null);timeline.setThumbTintList(ColorStateList.valueOf(Color.rgb(69,223,199)));}

        monitor.setText("모니터링");monitor.setContentDescription("이어폰으로 내 목소리 듣기");monitoring.setPadding(dp(12),0,dp(12),dp(8));attach(monitoring,recordingPanel);View legend=recordingPanel.findViewWithTag("duet-legend");if(legend!=null){recordingPanel.removeView(legend);recordingPanel.addView(legend);}
        soundSettings=volumes;LinearLayout advanced=new LinearLayout(this);advanced.setOrientation(LinearLayout.VERTICAL);moveSlider(hear,advanced);attach(automatic,advanced);moveSlider(noise,soundSettings);
        LinearLayout ticks=new LinearLayout(this);for(String label:new String[]{"1 낮음","2 약","3 보통","4 강","5 최대"}){TextView tick=text(label,12,MUTED);tick.setGravity(Gravity.CENTER);ticks.addView(tick,new LinearLayout.LayoutParams(0,-2,1));}soundSettings.addView(ticks);styleStep(soundSettings,"소리 크기");
        Button moreAudio=button("청음·자동 보정 추가 설정",false);moreAudio.setTextSize(13);moreAudio.setOnClickListener(v->advanced.setVisibility(advanced.getVisibility()==View.VISIBLE?View.GONE:View.VISIBLE));advanced.setVisibility(View.GONE);soundSettings.addView(moreAudio);soundSettings.addView(advanced);
        reverbSettings=fx;styleStep(fx,"목소리 효과");View strengthLabel=fx.getChildAt(fx.indexOfChild(effectStrength)-1);fx.removeAllViews();fx.addView(text("목소리 효과",16,Color.WHITE));
        LinearLayout presetGrid=new LinearLayout(this);presetGrid.setOrientation(LinearLayout.VERTICAL);presetGrid.setTag("vocal-preset-grid");
        for(int row=0;row<3;row++){LinearLayout choices=new LinearLayout(this);for(int col=0;col<2;col++){int index=row*2+col;LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);p.setMargins(dp(3),dp(4),dp(3),dp(4));if(index<5){Button tile=index<4?presetButtons.get(index):customButton;attach(tile,choices);tile.setLayoutParams(p);}else choices.addView(new Space(this),p);}presetGrid.addView(choices);}fx.addView(presetGrid);
        attach(presetDescription,fx);attach(strengthLabel,fx);attach(effectStrength,fx);attach(customDetails,fx);customMore.setVisibility(View.GONE);
        for(int i=customDetails.getChildCount()-1;i>=0;i--){View child=customDetails.getChildAt(i);if(child instanceof TextView&&!(i+1<customDetails.getChildCount()&&customDetails.getChildAt(i+1) instanceof SeekBar))customDetails.removeViewAt(i);}
        moveSlider(size,customDetails);moveSlider(echo,customDetails);moveSlider(room,customDetails);moveSlider(toneControl,customDetails);
        while(lyrics.getChildCount()>0)lyrics.removeViewAt(0);lyrics.setPadding(dp(12),dp(12),dp(12),dp(8));lyrics.addView(text("가사 글자 크기",12,MUTED));LinearLayout sizeChoices=new LinearLayout(this);String[] sizes={"small","normal","large"},sizeNames={"작게","보통","크게"};
        for(int i=0;i<sizes.length;i++){final String choice=sizes[i];Button b=button(sizeNames[i],false);b.setTag("lyric-size-"+choice);b.setTextSize(13);b.setMinWidth(0);b.setMinimumWidth(0);b.setPadding(dp(4),0,dp(4),0);b.setMinHeight(dp(48));b.setOnClickListener(v->chooseLyricTextSize(choice,true));lyricSizeButtons.add(b);LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);p.setMargins(dp(2),0,dp(2),dp(8));sizeChoices.addView(b,p);}lyrics.addView(sizeChoices);TextView current=text("현재 구간",12,PINK);lyrics.addView(current);lyricWheel.setTextSizeChoice(lyricTextSize);refreshLyricTextSizes();lyrics.addView(lyricWheel,new LinearLayout.LayoutParams(-1,dp(410)));attach(lyrics,recordingPanel);attach(pickLine,recordingPanel);attach(timeline,recordingPanel);LinearLayout times=new LinearLayout(this);times.setPadding(dp(12),0,dp(12),dp(8));recordingNow=text("0:00",13,MUTED);recordingEnd=text("0:00",13,MUTED);recordingEnd.setGravity(Gravity.END);times.addView(recordingNow,new LinearLayout.LayoutParams(0,-2,1));times.addView(recordingEnd,new LinearLayout.LayoutParams(0,-2,1));attach(times,recordingPanel);
        Button backToReview=button("후작업으로 돌아가기",false);backToReview.setOnClickListener(v->{if(hasTake){returnToRecording=false;setState(State.REVIEW);}});backToReview.setTag("back-to-review");attach(backToReview,recordingPanel);
        postPanel=box();postPanel.setTag("recording-post");postPanel.addView(text("녹음이 완료되었습니다!",21,Color.WHITE));postPanel.addView(text("후작업을 진행해 주세요.",12,MUTED));add(postPanel,14);
        LinearLayout player=box(),playRow=new LinearLayout(this);player.setPadding(dp(8),dp(8),dp(8),dp(8));playRow.setGravity(Gravity.CENTER_VERTICAL);attach(preview,playRow);((TransportButton)preview).setCompact(true);preview.setLayoutParams(new LinearLayout.LayoutParams(dp(54),dp(54)));preview.setContentDescription("녹음 들어보기");attach(previewPause,playRow);((TransportButton)previewPause).setCompact(true);previewPause.setLayoutParams(new LinearLayout.LayoutParams(dp(54),dp(54)));previewPause.setContentDescription("녹음 다시듣기 일시정지");
        LinearLayout waveColumn=new LinearLayout(this);waveColumn.setOrientation(LinearLayout.VERTICAL);waveform=new TakeWaveformView(this);waveform.listener(new TakeWaveformView.Listener(){public void begin(){beginScrub();}public void preview(double seconds){previewScrub(seconds);}public void end(double seconds){endScrub(seconds);}});waveColumn.addView(waveform,new LinearLayout.LayoutParams(-1,dp(52)));attach(clock,waveColumn);playRow.addView(waveColumn,new LinearLayout.LayoutParams(0,-2,1));player.addView(playRow);postPanel.addView(player);
        styleStep(syncFields,"1. 싱크 조절");syncFields.setBackgroundColor(Color.TRANSPARENT);syncFields.setPadding(0,dp(12),0,0);while(syncFields.getChildCount()>1)syncFields.removeViewAt(1);syncFields.addView(text("내 목소리와 반주의 싱크를 맞춰주세요.",12,MUTED));LinearLayout syncScale=new LinearLayout(this);syncLeft=text("-200ms",12,MUTED);syncRight=text("+200ms",12,MUTED);syncRight.setGravity(Gravity.END);syncScale.addView(syncLeft,new LinearLayout.LayoutParams(0,-2,1));syncValue=text("0ms",12,Color.WHITE);syncValue.setGravity(Gravity.CENTER);syncScale.addView(syncValue,new LinearLayout.LayoutParams(0,-2,1));syncScale.addView(syncRight,new LinearLayout.LayoutParams(0,-2,1));syncFields.addView(syncScale);syncFields.addView(offset,new LinearLayout.LayoutParams(-1,dp(32)));attach(syncFields,postPanel);postSound=new LinearLayout(this);postSound.setOrientation(LinearLayout.VERTICAL);postPanel.addView(text("2. 볼륨 밸런스 확인",17,Color.WHITE));postPanel.addView(postSound);postReverb=new LinearLayout(this);postReverb.setOrientation(LinearLayout.VERTICAL);postPanel.addView(text("3. 리버브 효과",17,Color.WHITE));postPanel.addView(postReverb);
        styleStep(reviewFields,"4. 저장 및 게시");reviewFields.setBackgroundColor(Color.TRANSPARENT);reviewFields.setPadding(0,dp(10),0,0);publicationFields=new LinearLayout(this);publicationFields.setOrientation(LinearLayout.VERTICAL);while(reviewFields.getChildCount()>1){View child=reviewFields.getChildAt(1);reviewFields.removeViewAt(1);publicationFields.addView(child);}reviewFields.addView(text("저장 후 내 노래방에서 확인할 수 있습니다.",12,MUTED));attach(reviewFields,postPanel);Button again=button("다시 부르기",false);again.setOnClickListener(v->{returnToRecording=true;reviewPosition=false;cursor=0;if(state==State.PLAYING){pauseRequested=true;setState(State.STOPPING);engine.stop();}else setState(State.PAUSED);drawLyrics(0);scroll.smoothScrollTo(0,0);});Button draft=button("임시 저장",false);draft.setOnClickListener(v->{saveSession();keepDraft=true;message("임시 저장했어요. 초안 목록에서 이어 편집할 수 있어요.");});LinearLayout saveRow=new LinearLayout(this);for(Button b:new Button[]{again,draft,upload}){attach(b,saveRow);b.setTextSize(13);b.setMinWidth(0);b.setMinimumWidth(0);b.setPadding(dp(4),dp(6),dp(4),dp(6));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);p.setMargins(dp(3),dp(8),dp(3),0);b.setLayoutParams(p);}upload.setText("저장 후 게시");reviewFields.addView(saveRow);Button publication=button("게시 정보 · 권리 확인",false);publication.setTextSize(12);publication.setMinHeight(dp(32));publication.setOnClickListener(v->publicationFields.setVisibility(publicationFields.getVisibility()==View.VISIBLE?View.GONE:View.VISIBLE));reviewFields.addView(publication);Button postSettings=button("잡음 · 세부 설정",false);postSettings.setTag("post-settings");postSettings.setTextSize(12);postSettings.setMinHeight(dp(32));postSettings.setOnClickListener(v->openSettings());reviewFields.addView(postSettings);reviewFields.addView(publicationFields);publicationFields.setVisibility(View.GONE);upload.setOnClickListener(v->{if(!ownVoice.isChecked()||!rights.isChecked()){publicationFields.setVisibility(View.VISIBLE);message("게시 정보를 확인하고 권리 동의 후 저장 후 게시를 눌러주세요.");scroll.post(()->scroll.smoothScrollTo(0,reviewFields.getTop()+postPanel.getTop()));return;}upload();});
        attach(status,content);refreshPresets();
    }
    private void mountStudioSettings(boolean reviewing){
        if(settingsDialog!=null&&settingsDialog.isShowing())return;soundSettings.setBackgroundColor(Color.TRANSPARENT);reverbSettings.setBackgroundColor(Color.TRANSPARENT);soundSettings.setPadding(0,0,0,0);reverbSettings.setPadding(0,0,0,0);
        if(reviewing){attach(soundSettings,postSound);attach(reverbSettings,postReverb);for(int i=0;i<soundSettings.getChildCount();i++){View child=soundSettings.getChildAt(i);child.setVisibility(i==0||i>=5?View.GONE:View.VISIBLE);}reverbSettings.getChildAt(0).setVisibility(View.GONE);if(songCard!=null)songCard.setVisibility(View.GONE);}
        else{for(int i=0;i<soundSettings.getChildCount();i++)soundSettings.getChildAt(i).setVisibility(View.VISIBLE);reverbSettings.getChildAt(0).setVisibility(View.VISIBLE);if(songCard!=null)songCard.setVisibility(View.VISIBLE);if(soundSettings.getParent() instanceof ViewGroup)((ViewGroup)soundSettings.getParent()).removeView(soundSettings);if(reverbSettings.getParent() instanceof ViewGroup)((ViewGroup)reverbSettings.getParent()).removeView(reverbSettings);}
        presetDescription.setVisibility(View.VISIBLE);compactReviewSliders(reviewing);
    }
    private static String validLyricTextSize(String value){return "small".equals(value)||"large".equals(value)?value:"normal";}
    private void chooseLyricTextSize(String value,boolean save){
        lyricTextSize=validLyricTextSize(value);lyricWheel.setTextSizeChoice(lyricTextSize);refreshLyricTextSizes();
        if(state==State.RECORDING||state==State.PREROLL)setState(state);
        getSharedPreferences("karaoke_display",MODE_PRIVATE).edit().putString("lyricTextSize",lyricTextSize).apply();if(save)saveSession();
    }
    private void refreshLyricTextSizes(){
        String[] values={"small","normal","large"};for(int i=0;i<lyricSizeButtons.size();i++){Button b=lyricSizeButtons.get(i);boolean selected=lyricTextSize.equals(values[i]);b.setSelected(selected);b.setBackgroundTintList(ColorStateList.valueOf(selected?PINK:CARD));b.setTextColor(selected?BG:Color.WHITE);b.setContentDescription("가사 글자 크기 "+b.getText()+(selected?" 선택됨":""));}
    }
    private void compactReviewSliders(boolean reviewing){for(SeekBar bar:new SeekBar[]{voice,backing,size,echo,room,toneControl,effectStrength}){bar.setMinimumHeight(dp(reviewing?28:40));bar.setLayoutParams(new LinearLayout.LayoutParams(-1,dp(reviewing?28:40)));View label=((ViewGroup)bar.getParent()).getChildAt(((ViewGroup)bar.getParent()).indexOfChild(bar)-1);label.setPadding(0,dp(reviewing?5:12),0,0);if(bar==toneControl){label.setVisibility(reviewing?View.GONE:View.VISIBLE);bar.setVisibility(reviewing?View.GONE:View.VISIBLE);}}}
    private int[] settingsSnapshot(){return new int[]{echo.getProgress(),room.getProgress(),size.getProgress(),voice.getProgress(),backing.getProgress(),hear.getProgress(),noise.getProgress(),effectStrength.getProgress(),toneControl.getProgress()};}
    private void openSettings(){
        if(engine==null||state==State.LOADING||state==State.UPLOADING||state==State.STOPPING)return;if(settingsDialog!=null&&settingsDialog.isShowing())return;
        int[] before=settingsSnapshot();String previousPreset=presetId;JSONObject previousCustom=customSettings;boolean previousAuto=autoSync.isChecked();boolean[] applied={false};
        android.app.Dialog dialog=new android.app.Dialog(this);settingsDialog=dialog;LinearLayout sheet=box();LinearLayout heading=new LinearLayout(this);TextView name=text("세부 설정",20,Color.WHITE);heading.addView(name,new LinearLayout.LayoutParams(0,-2,1));Button close=button("×",false);close.setContentDescription("세부 설정 닫기");close.setOnClickListener(v->dialog.dismiss());heading.addView(close);sheet.addView(heading);
        LinearLayout tabs=new LinearLayout(this);Button sound=button("소리 조절",true),reverb=button("리버브",false);tabs.addView(sound,new LinearLayout.LayoutParams(0,-2,1));tabs.addView(reverb,new LinearLayout.LayoutParams(0,-2,1));sheet.addView(tabs);ScrollView viewport=new ScrollView(this);LinearLayout body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);viewport.addView(body);mountStudioSettings(false);attach(soundSettings,body);attach(reverbSettings,body);reverbSettings.setVisibility(View.GONE);soundSettings.setVisibility(View.VISIBLE);sheet.addView(viewport,new LinearLayout.LayoutParams(-1,Math.min(dp(430),(int)(getResources().getDisplayMetrics().heightPixels*.55))));
        View.OnClickListener switchTab=v->{boolean first=v==sound;soundSettings.setVisibility(first?View.VISIBLE:View.GONE);reverbSettings.setVisibility(first?View.GONE:View.VISIBLE);sound.setBackgroundTintList(ColorStateList.valueOf(first?PINK:CARD));sound.setTextColor(first?BG:Color.WHITE);reverb.setBackgroundTintList(ColorStateList.valueOf(first?CARD:PINK));reverb.setTextColor(first?Color.WHITE:BG);viewport.scrollTo(0,0);};sound.setOnClickListener(switchTab);reverb.setOnClickListener(switchTab);
        Button apply=button("적용하기",true);apply.setOnClickListener(v->{applied[0]=true;saveSession();dialog.dismiss();});sheet.addView(apply);dialog.setContentView(sheet);dialog.setOnDismissListener(d->{if(!applied[0]){updatingPreset=true;SeekBar[] bars={echo,room,size,voice,backing,hear,noise,effectStrength,toneControl};for(int i=0;i<bars.length;i++)bars[i].setProgress(before[i]);presetId=previousPreset;customSettings=previousCustom;autoSync.setChecked(previousAuto);updatingPreset=false;refreshPresets();applySettings();saveSession();}settingsDialog=null;soundSettings.setVisibility(View.VISIBLE);reverbSettings.setVisibility(View.VISIBLE);mountStudioSettings(postPanel.getVisibility()==View.VISIBLE);});dialog.show();Window window=dialog.getWindow();if(window!=null){window.setBackgroundDrawableResource(android.R.color.transparent);window.setLayout(getResources().getDisplayMetrics().widthPixels-dp(28),-2);window.setGravity(Gravity.BOTTOM);window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);window.setDimAmount(.65f);}
    }
    private void refreshWaveform(){long stamp=dry.lastModified()+dry.length();if(!hasTake||waveform==null||stamp==waveformStamp)return;waveformStamp=stamp;files.execute(()->{try{float[] peaks=TakeWaveformView.read(dry);ui.post(()->{if(!destroyed&&waveformStamp==stamp)waveform.peaks(peaks);});}catch(IOException ignored){}});}
    private void loadArtwork(JSONObject song){if(!song.optBoolean("has_cover"))return;String path="/media/"+trackId+"/cover?v="+song.optString("cover_version","original");files.execute(()->{try{File art=new File(directory,"cover-image");api.download(path,art);android.graphics.BitmapFactory.Options options=new android.graphics.BitmapFactory.Options();options.inSampleSize=2;android.graphics.Bitmap image=android.graphics.BitmapFactory.decodeFile(art.getAbsolutePath(),options);ui.post(()->{if(!destroyed&&image!=null)songArt.setImageBitmap(image);});}catch(Exception ignored){}});}

    private void requestRecord(){
        if(state!=State.READY&&state!=State.REVIEW&&state!=State.PAUSED)return;
        if(!validateDuetParts())return;
        if(ContextCompat.checkSelfPermission(this,Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)beginCountdown();else microphone.launch(Manifest.permission.RECORD_AUDIO);
    }
    private void beginCountdown(){if(!foreground||engine==null)return;if(cursor>0){startRecording();return;}setState(State.COUNTDOWN);countdown(3,++countdownId);}
    private void countdown(int n,int id){
        if(state!=State.COUNTDOWN||!foreground||id!=countdownId)return;
        if(n>0){message(n+" · 준비하세요");ui.postDelayed(()->countdown(n-1,id),1000);return;}
        startRecording();
    }
    private void startRecording(){
        try{reviewPosition=false;AudioDeviceInfo route=engine.headphones();if(route!=null&&!KaraokeEngine.bluetooth(route)&&!monitorOptOut)setMonitor(true);engine.setMonitor(monitor.isChecked());engine.punchIn(cursor);draftId=null;uploadComplete=false;setState(cursor>0?State.PREROLL:State.RECORDING);message(cursor>0?"반주를 먼저 듣고 선택한 가사부터 녹음을 시작해요.":"녹음 중 · 가사를 밀면 그 구간부터 다시 불러요.");}
        catch(Exception e){setState(hasTake?State.REVIEW:State.READY);message(friendly(e));}
    }
    private void playTake(){try{reviewPosition=true;engine.start(false,cursor<(engine.fullLengthMix?engine.duration():dry.length()/2.0/PcmFiles.RATE)?cursor:0);setState(State.PLAYING);message("녹음 들어보기 · 가사를 밀어도 재생이 이어져요.");}catch(Exception e){message(friendly(e));}}
    private void audioFinished(boolean recorded,String error){
        if(destroyed)return;
        hasTake=dry.length()>PcmFiles.RATE/5;
        if(audioSettling){audioSettling=false;if(error!=null){resumeAfterScrub=false;resumePlaybackAfterScrub=false;resumeGuideAfterScrub=false;message(error);}if(!lyricScrubbing&&pendingSeek!=null)finishScrub();return;}
        if(recorded){if(!pauseRequested)returnToRecording=false;refreshVocalGuide();cursor=dry.length()/2.0/PcmFiles.RATE;syncResult.setText(engine.autoSync?(engine.measuredDelay?"기기 측정 "+engine.lastDelayMs+"ms 보정 완료":"기기 시간을 측정할 수 없어 기본 80ms를 적용했어요. 들어보고 조절해주세요."):"자동 보정 꺼짐 · 들어보며 목소리 위치를 조절해주세요.");}
        if(guideThenRecord){guideThenRecord=false;cursor=guideStart;setState(hasTake?State.REVIEW:State.READY);record.performClick();return;}
        setMonitor(false);setState(hasTake?(pauseRequested?State.PAUSED:State.REVIEW):State.READY);saveSession();
        message(error!=null?error:pauseRequested?"일시정지했어요. 이어 부르기를 누르면 같은 위치부터 시작해요.":hasTake?"녹음한 "+time(dry.length()/2.0/PcmFiles.RATE)+"까지만 저장돼요. 들어보고 싱크를 조절해주세요.":"가사를 골라 선택한 위치부터 불러보세요.");pauseRequested=false;drawLyrics(cursor);
    }
    private void setState(State nextState){
        state=nextState;boolean recording=state==State.RECORDING||state==State.PREROLL,playing=state==State.PLAYING,guiding=state==State.GUIDE;
        boolean busy=state==State.LOADING||state==State.UPLOADING||state==State.STOPPING||state==State.SEEKING,active=recording||playing||guiding||state==State.COUNTDOWN;
        if(soloMode!=null){soloMode.setEnabled(!busy&&!active);duetMode.setEnabled(!busy&&!active);}
        if(editParts!=null)editParts.setEnabled(!busy&&!active);
        record.setVisibility(View.VISIBLE);record.setEnabled(!busy&&!active);record.setText(recording?"녹음 중":state==State.COUNTDOWN?"녹음 준비":state==State.PAUSED?"이어 부르기":hasTake?"여기부터 부르기":"녹음 시작");record.setContentDescription(record.getText());((TransportButton)record).setRecordingActive(recording);
        pause.setVisibility(View.VISIBLE);pause.setEnabled(recording&&!busy);pause.setContentDescription("녹음 일시정지");
        restart.setEnabled(!busy&&(recording||!active));
        stop.setVisibility(View.VISIBLE);stop.setEnabled(active&&!busy);stop.setText(playing?"듣기 멈춤":guiding?"가이드 멈춤":state==State.COUNTDOWN?"취소":"녹음 완료");stop.setContentDescription(playing?"녹음 다시 듣기 멈추기":guiding?"원곡 가이드 멈추기":state==State.COUNTDOWN?"녹음 시작 취소":"녹음 완료 후 효과 편집");
        preview.setVisibility(View.VISIBLE);preview.setEnabled(hasTake&&!busy&&!active);previewPause.setEnabled(playing);
        boolean reviewing=hasTake&&!returnToRecording&&(state==State.REVIEW||state==State.PAUSED||playing);
        if(recordingPanel!=null){recordingPanel.setVisibility(reviewing?View.GONE:View.VISIBLE);postPanel.setVisibility(reviewing?View.VISIBLE:View.GONE);bottomControls.setVisibility(reviewing?View.GONE:View.VISIBLE);mountStudioSettings(reviewing);View back=recordingPanel.findViewWithTag("back-to-review");if(back!=null)back.setVisibility(hasTake&&!active?View.VISIBLE:View.GONE);preview.setVisibility(playing?View.GONE:View.VISIBLE);previewPause.setVisibility(playing?View.VISIBLE:View.GONE);if(reviewing&&!busy)refreshWaveform();}
        syncFields.setVisibility(reviewing?View.VISIBLE:View.GONE);offset.setEnabled(reviewing);
        for(Button b:new Button[]{slower,resetSync,faster})b.setEnabled(reviewing);
        reviewFields.setVisibility(reviewing?View.VISIBLE:View.GONE);
        upload.setEnabled(state==State.REVIEW||state==State.PAUSED);description.setEnabled(!busy);ownVoice.setEnabled(!busy);rights.setEnabled(!busy);
        for(SeekBar bar:new SeekBar[]{echo,room,size,voice,backing,hear,noise,effectStrength,toneControl})bar.setEnabled(!busy);
        customButton.setEnabled(!busy);customMore.setEnabled(!busy);for(Button b:presetButtons)b.setEnabled(!busy);for(Button b:noiseButtons)b.setEnabled(!busy);effectStrength.setEnabled(!busy&&!presetId.equals("original")&&!presetId.equals("custom"));
        boolean canSeek=state!=State.LOADING&&state!=State.UPLOADING&&state!=State.STOPPING;
        pickLine.setEnabled(canSeek);timeline.setEnabled(canSeek);lyricWheel.allowSeek(canSeek);
        guide.setEnabled(!busy&&!recording&&!playing&&state!=State.COUNTDOWN);guide.setText(guiding?"이 구간 부르기":"원곡 가이드 듣기");autoSync.setEnabled(!busy&&!active);
        monitor.setEnabled(!busy&&!playing&&!guiding);if(recording||playing||guiding)getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        status.setMaxLines(recording?1:3);
        status.setEllipsize(recording?android.text.TextUtils.TruncateAt.END:null);
        if(recording)scroll.post(()->{
            // Large wrapped duet lyrics need more room, bounded by the actual screen above the controls.
            int desired=dp(lyricTextSize.equals("large")?500:410);
            int height=Math.min(desired,Math.max(dp(240),scroll.getHeight()-dp(24)));
            ViewGroup.LayoutParams params=lyricWheel.getLayoutParams();
            if(params.height!=height){params.height=height;lyricWheel.setLayoutParams(params);}
            scroll.postOnAnimation(this::scrollRecordingLyricsIntoView);
        });
    }
    private void scrollRecordingLyricsIntoView(){
        if(state==State.RECORDING||state==State.PREROLL){
            int top=lyricWheel.getTop();ViewParent parent=lyricWheel.getParent();
            while(parent instanceof View && parent!=content){top+=((View)parent).getTop();parent=parent.getParent();}
            scroll.smoothScrollTo(0,Math.max(0,top-dp(12)));
        }
    }
    private void pauseTake(){if(engine==null)return;returnToRecording=true;pauseRequested=true;setState(State.STOPPING);engine.stop();}
    private void selectPosition(double seconds){
        beginScrub();endScrub(seconds);
    }
    private void beginScrub(){
        if(engine==null||state==State.LOADING||state==State.UPLOADING||state==State.STOPPING)return;
        if(state==State.SEEKING){lyricScrubbing=true;pendingSeek=null;return;}
        lyricScrubbing=true;pendingSeek=null;resumeAfterScrub=state==State.RECORDING||state==State.PREROLL;resumePlaybackAfterScrub=state==State.PLAYING;resumeGuideAfterScrub=state==State.GUIDE;reviewPosition=resumePlaybackAfterScrub;guideThenRecord=false;countdownId++;
        boolean active=resumeAfterScrub||resumePlaybackAfterScrub||resumeGuideAfterScrub;setState(State.SEEKING);
        if(active){audioSettling=true;engine.stop();}
    }
    private void previewScrub(double seconds){if(engine==null)return;cursor=Math.max(0,Math.min((resumePlaybackAfterScrub&&!engine.fullLengthMix?Math.min(engine.duration(),dry.length()/2.0/PcmFiles.RATE):engine.duration())-.1,seconds));clock.setText(time(cursor)+" / "+time(displayDuration()));message(time(cursor)+" · 손을 놓으면 이 위치로 이동해요.");}
    private void endScrub(double seconds){if(engine==null)return;previewScrub(seconds);lyricScrubbing=false;pendingSeek=cursor;if(!audioSettling)finishScrub();}
    private void cancelScrub(){resumeAfterScrub=false;resumePlaybackAfterScrub=false;resumeGuideAfterScrub=false;endScrub(cursor);}
    private void finishScrub(){
        pendingSeek=null;setState(hasTake?State.REVIEW:State.READY);drawLyrics(cursor);saveSession();
        boolean recordAgain=resumeAfterScrub,playAgain=resumePlaybackAfterScrub,guideAgain=resumeGuideAfterScrub;resumeAfterScrub=false;resumePlaybackAfterScrub=false;resumeGuideAfterScrub=false;
        if(foreground){if(recordAgain){startRecording();return;}if(playAgain){playTake();return;}if(guideAgain){startGuide();return;}}
        message(time(cursor)+"부터 부를 수 있어요. 앞부분은 보존하고 이 위치 뒤를 다시 녹음해요.");
    }
    private double displayDuration(){if(engine==null)return 0;return hasTake&&(reviewPosition||state==State.REVIEW||state==State.PAUSED||state==State.PLAYING)?(engine.fullLengthMix?engine.duration():Math.min(engine.duration(),dry.length()/2.0/PcmFiles.RATE)):engine.duration();}
    private void chooseLine(){
        if(words.length()==0){message("싱크 가사가 없어요. 노래 위치 막대로 시작할 곳을 골라주세요.");return;}
        String[] labels=new String[words.length()];for(int i=0;i<labels.length;i++)labels[i]=time(words.optJSONObject(i).optDouble("s"))+"  "+lineText(i);
        new AlertDialog.Builder(this).setTitle("위아래로 넘겨 부를 가사를 골라주세요").setItems(labels,(d,index)->selectPosition(words.optJSONObject(index).optDouble("s"))).setNegativeButton("닫기",null).show();
    }
    private void startGuide(){
        if(engine==null)return;reviewPosition=false;guideStart=cursor;setState(State.LOADING);message("원곡 가이드를 준비하고 있어요…");
        files.execute(()->{try{if(original.length()==0){api.download("/media/"+trackId+"/stream",original);BackingDecoder.frames(original);}
            ui.post(()->{if(destroyed)return;try{if(!foreground){setState(hasTake?State.REVIEW:State.READY);return;}engine.guide(original,guideStart);setState(State.GUIDE);message("원곡을 듣고 ‘이 구간 부르기’를 누르면 선택한 위치부터 녹음해요.");}catch(Exception e){setState(hasTake?State.REVIEW:State.READY);message(friendly(e));}});
        }catch(Exception e){original.delete();ui.post(()->{if(!destroyed){setState(hasTake?State.REVIEW:State.READY);message(friendly(e));}});}});
    }
    private void checkPremiumExport(){
        message("Premium 이용권을 확인하고 있어요…");files.execute(()->{try{JSONObject me=api.json("/api/me","GET",null);boolean premium=me.optJSONObject("membership")!=null&&"premium".equals(me.getJSONObject("membership").optString("plan"));ui.post(()->{if(destroyed)return;if(premium&&(state==State.REVIEW||state==State.PAUSED))saveAudio.launch("AIFECT-cover-"+System.currentTimeMillis()+".wav");else message("커버 파일 저장은 Premium 이용권이 필요해요. 임시저장과 공개는 무료로 이용할 수 있어요.");});}catch(Exception e){ui.post(()->{if(!destroyed)message(friendly(e));});}});
    }
    private void changeMode(String mode){
        if(!duetParent.isEmpty()||mode.equals(coverMode)||state==State.LOADING||state==State.UPLOADING||state==State.RECORDING||state==State.PREROLL||state==State.STOPPING||state==State.COUNTDOWN||state==State.PLAYING||state==State.GUIDE||state==State.SEEKING)return;
        saveSession();keepDraft=true;
        startActivity(new Intent(getIntent()).putExtra("coverMode",mode).putExtra("duetPart",mode.equals("duet")?"male":"").putExtra("duetParentId",""));finish();
    }
    private void saveSession(){
        if(sessionFile==null||engine==null)return;if(presetId.equals("custom"))rememberCustom();
        try{JSONObject data=new JSONObject().put("trackId",trackId).put("coverMode",coverMode).put("duetPart",duetPart).put("duetParent",duetParent).put("cursor",cursor).put("offset",offset.getProgress()+syncMinimum+300).put("echo",echo.getProgress()).put("room",room.getProgress()).put("roomScaleVersion",2).put("customSettings",customSettings).put("preset",presetId).put("strength",effectStrength.getProgress()).put("tone",toneAmount).put("size",size.getProgress()).put("voice",voice.getProgress()).put("backing",backing.getProgress()).put("automatic",autoSync.isChecked()).put("noise",noise.getProgress()).put("description",description.getText().toString()).put("title",title.getText().toString()).put("words",words).put("duetGuide",duetGuide);
            data.put("hear",hear.getProgress()).put("lyricTextSize",lyricTextSize).put("submissionId",draftId==null?JSONObject.NULL:draftId);
            android.util.AtomicFile file=new android.util.AtomicFile(sessionFile);FileOutputStream out=null;try{out=file.startWrite();out.write(data.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));file.finishWrite(out);}catch(Exception e){if(out!=null)file.failWrite(out);}
        }catch(Exception ignored){}
    }
    private void restoreSession(){
        updatingPreset=true;try{JSONObject data=new JSONObject(new String(java.nio.file.Files.readAllBytes(sessionFile.toPath()),java.nio.charset.StandardCharsets.UTF_8));String submission=data.optString("submissionId","");draftId=submission.matches("[\\w-]{1,80}")?submission:null;chooseLyricTextSize(data.optString("lyricTextSize",lyricTextSize),false);if(duetParent.isEmpty()&&data.optJSONObject("duetGuide")!=null)duetGuide=data.optJSONObject("duetGuide");presetId=VocalPreset.index(data.optString("preset"))>=0?data.optString("preset"):"custom";customSettings=data.optJSONObject("customSettings");toneAmount=(float)data.optDouble("tone",0);toneControl.setProgress(Math.round(toneAmount*100));effectStrength.setProgress(data.optInt("strength",50));cursor=Math.min(engine.duration(),data.optDouble("cursor",dry.length()/2.0/PcmFiles.RATE));int savedSync=data.optInt("offset",300)-300;syncMinimum=Math.min(-200,savedSync);offset.setMax(Math.max(200,savedSync)-syncMinimum);offset.setProgress(savedSync-syncMinimum);if(syncLeft!=null){syncLeft.setText(syncMinimum+"ms");syncRight.setText("+"+(offset.getMax()+syncMinimum)+"ms");}echo.setProgress(data.optInt("echo",18));room.setProgress(RoomReverb.restorePercent(data.optInt("room",16),data.optInt("roomScaleVersion",1)));size.setProgress(data.optInt("size",50));hear.setProgress(data.optInt("hear",100));voice.setProgress(data.optInt("voice",100));backing.setProgress(data.optInt("backing",80));autoSync.setChecked(data.optBoolean("automatic",true));noise.setProgress(data.optInt("noise",0));description.setText(data.optString("description"));}catch(Exception ignored){cursor=dry.length()/2.0/PcmFiles.RATE;}finally{updatingPreset=false;refreshPresets();applySettings();}
    }
    private void selectPreset(String id,int amount){
        if(presetId.equals("custom"))rememberCustom();
        if(id.equals("custom")){if(customSettings==null)rememberCustom();updatingPreset=true;presetId="custom";echo.setProgress(customSettings.optInt("echo",echo.getProgress()));room.setProgress(customSettings.optInt("room",room.getProgress()));size.setProgress(customSettings.optInt("size",size.getProgress()));toneControl.setProgress(customSettings.optInt("tone",toneControl.getProgress()));noise.setProgress(customSettings.optInt("noise",noise.getProgress()));updatingPreset=false;refreshPresets();applySettings();return;}
        updatingPreset=true;presetId=id;effectStrength.setProgress(amount);float[] values=VocalPreset.values(id,amount/100f);echo.setProgress(Math.round(values[0]*100));room.setProgress(Math.round(values[1]*100));size.setProgress(Math.round(values[2]*100));toneAmount=values[3];toneControl.setProgress(Math.round(toneAmount*100));updatingPreset=false;refreshPresets();applySettings();
    }
    private void rememberCustom(){try{customSettings=new JSONObject().put("echo",echo.getProgress()).put("room",room.getProgress()).put("size",size.getProgress()).put("tone",toneControl.getProgress()).put("noise",noise.getProgress());}catch(Exception ignored){}}
    private void refreshPresets(){
        if(effectStrength==null||noise==null)return;int selected=VocalPreset.index(presetId);
        for(int i=0;i<presetButtons.size();i++){Button b=presetButtons.get(i);boolean on=i==selected;b.setSelected(on);b.setBackgroundTintList(ColorStateList.valueOf(on?PINK:CARD));b.setTextColor(on?BG:Color.WHITE);b.setContentDescription(VocalPreset.NAMES[i]+(on?" 선택됨":""));}
        for(Button b:noiseButtons){boolean on=(int)b.getTag()==noise.getProgress();b.setSelected(on);b.setBackgroundTintList(ColorStateList.valueOf(on?PINK:CARD));b.setTextColor(on?BG:Color.WHITE);}
        boolean custom=presetId.equals("custom");effectStrength.setVisibility(custom?View.GONE:View.VISIBLE);LinearLayout strengthParent=(LinearLayout)effectStrength.getParent();strengthParent.getChildAt(strengthParent.indexOfChild(effectStrength)-1).setVisibility(custom?View.GONE:View.VISIBLE);customButton.setSelected(custom);customButton.setBackgroundTintList(ColorStateList.valueOf(custom?PINK:CARD));customButton.setTextColor(custom?BG:Color.WHITE);customButton.setContentDescription(custom?"사용자 설정 선택됨":"사용자 설정");customDetails.setVisibility(custom?View.VISIBLE:View.GONE);customMore.setText(custom?"사용자 설정 접기":"사용자 설정 직접 편집");
        presetDescription.setText(selected<0?"사용자 설정 · 직접 조절한 효과를 사용하고 있어요.":VocalPreset.DESCRIPTIONS[selected]);effectStrength.setEnabled(selected>0);
    }
    private void applySettings(){
        if(updatingPreset||engine==null||offset==null||noise==null||backing==null)return;
        float e=echo.getProgress()/100f,r=room.getProgress()/100f,z=size.getProgress()/100f;if(presetId.equals("custom"))toneAmount=toneControl.getProgress()/100f;
        if(VocalPreset.index(presetId)>=0){float[] values=VocalPreset.values(presetId,effectStrength.getProgress()/100f);e=values[0];r=values[1];z=values[2];toneAmount=values[3];}
        if(syncValue!=null)syncValue.setText((offset.getProgress()+syncMinimum)+"ms");engine.settings=new VocalEffects.Settings(e,r,z,voice.getProgress()/100f,backing.getProgress()/100f,hear.getProgress()/100f,offset.getProgress()+syncMinimum,noise.getProgress(),toneAmount);
    }
    private static JSONArray activityJson(double[][] ranges)throws JSONException{JSONArray result=new JSONArray();for(double[] r:ranges)result.put(new JSONObject().put("s",r[0]).put("e",r[1]));return result;}
    private void refreshVocalGuide(){
        if(!coverMode.equals("duet")||!duetParent.isEmpty()||duetGuide==null||!duetGuide.optString("mode").equals("free")||!hasTake)return;JSONObject chosen=duetGuide;int shift=engine.settings.offsetMs;double duration=engine.duration();files.execute(()->{try{JSONArray ranges=activityJson(VocalActivity.detect(dry,shift,duration));ui.post(()->{if(!destroyed&&duetGuide==chosen){try{duetGuide.put("activity",ranges);saveSession();renderDuetGuide();drawLyrics(cursor);}catch(Exception ignored){}}});}catch(Exception ignored){}});
    }
    private void renderDuetGuide(){
        if(duetGuideBox==null||engine==null)return;duetGuideBox.removeAllViews();boolean second=!duetParent.isEmpty();
        duetGuideBox.addView(text(second?"파트너와 함께 부르기":"듀엣 파트",16,Color.WHITE));
        String summary=duetGuide==null?"파트너의 목소리를 듣고 원하는 구간을 불러주세요.":duetGuide.optString("mode").equals("lyrics")?"가사별 지정 · "+DuetGuide.assigned(duetGuide,words.length())+" / "+words.length()+"줄":"자유롭게 부르기 · 녹음 후 빈 구간을 추정해요.";
        duetGuideBox.addView(text(summary,13,MUTED));editParts=button(second?"파트 보기":"파트 나누기",false);editParts.setTag("duet-open-editor");editParts.setTextSize(14);editParts.setOnClickListener(v->editPartLines());duetGuideBox.addView(editParts);setState(state);
    }
    private boolean validateDuetParts(){
        if(!coverMode.equals("duet")||!duetParent.isEmpty())return true;
        String problem=DuetGuide.manualProblem(duetGuide,words.length());if(problem.isEmpty())return true;
        message(problem);editPartLines();return false;
    }
    private void editPartLines(){
        if(engine==null||!(state==State.READY||state==State.PAUSED||state==State.REVIEW))return;
        if(partEditor!=null&&partEditor.isShowing())return;
        partEditor=new DuetPartEditor(this,words,duetGuide,!duetParent.isEmpty(),engine.duration(),new DuetPartEditor.Listener(){
            public void changed(){saveSession();renderDuetGuide();drawLyrics(cursor);}
            public void seek(double seconds){selectPosition(seconds);}
        });
        partEditor.setOnDismissListener(dialog->{partEditor=null;if(!destroyed){saveSession();renderDuetGuide();drawLyrics(cursor);refreshVocalGuide();}});partEditor.show();
    }
    private void setMonitor(boolean enabled){updatingMonitor=true;monitor.setChecked(enabled);updatingMonitor=false;if(engine!=null)engine.setMonitor(enabled);}
    private void updateRoute(){
        if(destroyed||routeLabel==null)return;AudioDeviceInfo d=engine==null?null:engine.headphones();
        if(d!=null&&!KaraokeEngine.bluetooth(d)&&!monitorOptOut&&!updatingMonitor)setMonitor(true);
        routeLabel.setText(d==null?"이어폰 미연결 · 청음은 꺼져 있어요":KaraokeEngine.bluetooth(d)?"블루투스 이어폰 · 청음 지연이 있을 수 있어요":"유선 / USB 이어폰 · 실시간 목소리 청음");
    }
    private void drawLyrics(double seconds){
        if(engine==null)return;double duration=displayDuration();progress.setProgress((int)(seconds/Math.max(1,duration)*1000));timeline.setProgress(progress.getProgress());clock.setText(time(seconds)+"  /  "+time(duration));if(recordingNow!=null){recordingNow.setText(time(seconds));recordingEnd.setText(time(duration));}if(waveform!=null)waveform.position(seconds,duration);
        lyricWheel.setLyrics(words);String[] labels=new String[words.length()];for(int i=0;i<labels.length;i++)labels[i]=coverMode.equals("duet")?DuetGuide.label(duetGuide,words,i,!duetParent.isEmpty(),engine.duration()):"";String[] roles=new String[words.length()];for(int i=0;i<roles.length;i++)roles[i]=coverMode.equals("duet")?DuetGuide.role(DuetGuide.part(duetGuide,words,i,engine.duration()),!duetParent.isEmpty()):"";lyricWheel.setPartRoles(roles);lyricWheel.setPartLabels(labels);lyricWheel.showPosition(seconds);if(duetGuideBox!=null&&duetGuideBox.getChildCount()==0)renderDuetGuide();
    }
    private String lineText(int index){JSONObject l=words.optJSONObject(index);if(l==null)return "";JSONArray parts=l.optJSONArray("w");StringBuilder b=new StringBuilder();if(parts!=null)for(int i=0;i<parts.length();i++){if(i>0)b.append(' ');b.append(parts.optJSONObject(i).optString("t"));}return b.toString();}
    private void upload(){
        if(!validateDuetParts())return;
        if(coverMode.equals("duet")&&duetParent.isEmpty()){new AlertDialog.Builder(this).setTitle("듀엣 파트를 공개할까요?").setMessage("다른 사람이 이 녹음을 불러와 빈 파트에 목소리를 더하는 것에 동의합니다.").setNegativeButton("취소",null).setPositiveButton("동의하고 공개",(dialog,which)->uploadConfirmed()).show();return;}uploadConfirmed();
    }
    private void uploadConfirmed(){
        if(state!=State.REVIEW&&state!=State.PAUSED)return;
        if(!ownVoice.isChecked()||!rights.isChecked()){message("직접 부른 목소리와 공개 권한에 동의해주세요.");return;}
        VocalEffects.Settings settings=engine.settings;String note=description.getText().toString();JSONObject guideSnapshot=null;try{if(duetGuide!=null)guideSnapshot=new JSONObject(duetGuide.toString());}catch(Exception ignored){}final JSONObject chosenGuide=guideSnapshot;setState(State.UPLOADING);message("선택한 효과를 반영해 커버곡을 만들고 있어요…");
        files.execute(()->{
            try{
                File wav=new File(directory,"cover.wav");BackingDecoder.export(mr,dry,wav,settings,coverMode.equals("duet"));if(coverMode.equals("duet")&&duetParent.isEmpty()&&chosenGuide!=null&&chosenGuide.optString("mode").equals("free"))chosenGuide.put("activity",activityJson(VocalActivity.detect(dry,settings.offsetMs,engine.duration())));
                boolean retry=draftId!=null;
                if(draftId==null){JSONObject body=new JSONObject().put("original_id",trackId).put("cover_mode",coverMode).put("duet_slot",coverMode.equals("duet")?(duetParent.isEmpty()?"first":"second"):"").put("duet_parent_id",duetParent.isEmpty()?JSONObject.NULL:duetParent).put("duet_consent",coverMode.equals("duet")&&duetParent.isEmpty()).put("duet_guide",duetParent.isEmpty()?chosenGuide:JSONObject.NULL).put("description",note).put("own_voice",true).put("rights",true).put("extension","wav").put("bytes",wav.length());draftId=api.json("/api/covers","POST",body).getString("id");ui.post(()->{if(!destroyed)saveSession();});}
                final String submittedId=draftId;
                ui.post(()->{if(!destroyed)message("커버곡을 업로드하고 있어요…");});
                boolean showAd=CoverSubmission.submit(new CoverSubmission.Transport(){
                    public String status()throws Exception{return api.json("/api/studio/tracks/"+submittedId,"GET",null).getJSONObject("profile").getString("status");}
                    public void upload()throws Exception{api.upload(submittedId,wav);}
                    public boolean complete()throws Exception{return api.json("/api/uploads/"+submittedId+"/complete","POST",new JSONObject()).optBoolean("show_upload_ad",false);}
                    public boolean recoveredUploadAd()throws Exception{JSONObject membership=api.json("/api/me","GET",null).optJSONObject("membership");return membership!=null&&!"premium".equals(membership.optString("plan"));}
                },retry);
                ui.post(()->{if(!destroyed){uploadComplete=true;setResult(RESULT_OK,new Intent().putExtra("uploadedId",submittedId).putExtra("showUploadAd",showAd));finish();}});
            }catch(Exception e){ui.post(()->{if(!destroyed){setState(State.REVIEW);message(friendly(e)+" 녹음은 남아 있어요.");}});}
        });
    }
    @Override protected void onResume(){super.onResume();foreground=true;updateRoute();}
    @Override protected void onStop(){
        foreground=false;lyricScrubbing=false;resumeAfterScrub=false;resumePlaybackAfterScrub=false;resumeGuideAfterScrub=false;pendingSeek=null;audioSettling=false;
        if(engine!=null&&(state==State.RECORDING||state==State.PREROLL||state==State.SEEKING||state==State.PLAYING||state==State.GUIDE||state==State.STOPPING)){
            boolean singing=state==State.RECORDING||state==State.PREROLL||pauseRequested;pauseRequested=singing;guideThenRecord=false;engine.close();
            hasTake=dry.length()>PcmFiles.RATE/5;cursor=singing?dry.length()/2.0/PcmFiles.RATE:engine.position();setMonitor(false);setState(hasTake?State.PAUSED:State.READY);
            message("녹음을 보관하고 일시정지했어요. 돌아와서 이어 부를 수 있어요.");
        }
        if(state==State.COUNTDOWN){countdownId++;setState(hasTake?State.PAUSED:State.READY);}saveSession();super.onStop();
    }
    @Override protected void onSaveInstanceState(Bundle out){out.putString("directory",directory==null?"":directory.getName());saveSession();super.onSaveInstanceState(out);}
    @Override protected void onDestroy(){
        destroyed=true;if(partEditor!=null)partEditor.dismiss();if(settingsDialog!=null)settingsDialog.dismiss();ui.removeCallbacksAndMessages(null);if(audioManager!=null)audioManager.unregisterAudioDeviceCallback(devices);if(api!=null)api.cancel();files.shutdownNow();
        boolean discard=isFinishing()&&(uploadComplete||!keepDraft);
        new Thread(()->{if(engine!=null)engine.close();try{files.awaitTermination(50,TimeUnit.SECONDS);}catch(InterruptedException ignored){}if(discard&&directory!=null){File[] children=directory.listFiles();if(children!=null)for(File f:children)if(f.isFile()&&!f.getName().equals("mr.m4a")&&!f.getName().equals("guide.m4a"))f.delete();directory.delete();}},"KaraokeCleanup").start();
        super.onDestroy();
    }
    /** Evict only backing caches without a saved take; never delete a user's draft to save space. */
    private void trimBackingCache(){
        File[] folders=getFilesDir().listFiles(f->f.isDirectory()&&f.getName().startsWith("karaoke-"));if(folders==null)return;
        java.util.ArrayList<File> cached=new java.util.ArrayList<>();long bytes=0;
        for(File folder:folders)for(String name:new String[]{"mr.m4a","guide.m4a"}){File file=new File(folder,name);if(file.exists()){bytes+=file.length();if(!folder.equals(directory)&&new File(folder,"voice.pcm").length()==0)cached.add(file);}}
        cached.sort(java.util.Comparator.comparingLong(File::lastModified));for(File file:cached){if(bytes<=64L*1024*1024)break;long size=file.length();if(file.delete())bytes-=size;}
    }
    static String draftOwner(String origin,String session){
        try{byte[] digest=java.security.MessageDigest.getInstance("SHA-256").digest((origin+"\n"+session).getBytes(java.nio.charset.StandardCharsets.UTF_8));StringBuilder id=new StringBuilder();for(byte value:digest)id.append(String.format(java.util.Locale.ROOT,"%02x",value&255));return id.toString();}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}
    }
    private void message(String message){status.setText(message);}
    private static String friendly(Exception e){String m=e.getMessage();return m==null||m.isBlank()?"완료하지 못했어요. 다시 시도해주세요.":m;}
    private static String partTime(double seconds){int n=(int)Math.round(Math.max(0,seconds)*10);return String.format(java.util.Locale.ROOT,"%d:%02d.%d",n/600,n%600/10,n%10);}
    private static String time(double s){int n=(int)Math.max(0,s);return String.format(java.util.Locale.ROOT,"%d:%02d",n/60,n%60);}
    private int dp(int x){return Math.round(x*getResources().getDisplayMetrics().density);}
    private TextView text(String value,int sp,int color){TextView v=new TextView(this);v.setText(value);v.setTextSize(Math.max(13,sp+1));v.setTextColor(color);v.setLineSpacing(dp(4),1);return v;}
    private void add(View v,int top){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(top);content.addView(v,p);}
    private LinearLayout box(){LinearLayout v=new LinearLayout(this);v.setOrientation(LinearLayout.VERTICAL);v.setPadding(dp(18),dp(18),dp(18),dp(18));GradientDrawable bg=new GradientDrawable();bg.setColor(CARD);bg.setCornerRadius(dp(18));v.setBackground(bg);return v;}
    private Button button(String label,boolean primary){Button b=(label.equals("노래 시작")||label.equals("일시정지")||label.equals("그만 부르기")||label.equals("녹음 들어보기"))?new TransportButton(this,label,label.equals("노래 시작")?"mic":label.equals("일시정지")?"pause":label.equals("그만 부르기")?"check":"play",primary):new Button(this);b.setText(label);b.setAllCaps(false);b.setTextColor(primary?BG:Color.WHITE);b.setTextSize(17);b.setMinHeight(dp(52));if(!(b instanceof TransportButton))b.setBackgroundTintList(ColorStateList.valueOf(primary?PINK:CARD));return b;}
    private CheckBox check(String label){CheckBox c=new CheckBox(this);c.setText(label);c.setTextColor(MUTED);c.setTextSize(14);c.setButtonTintList(ColorStateList.valueOf(PINK));return c;}
    private SeekBar slider(LinearLayout parent,String name,int max,int initial,String unit,int displayOffset){
        LinearLayout label=new LinearLayout(this);label.setGravity(Gravity.CENTER_VERTICAL);label.setPadding(0,dp(12),0,0);TextView titleLabel=text(name.equals("리버브 강도")?"효과 강도":name,13,Color.WHITE),valueLabel=text((initial+displayOffset)+unit,13,MUTED);String glyph=name.equals("내 목소리")?"voice":name.contains("반주")?"music":name.equals("룸 크기")?"size":name.equals("에코 크기")?"echo":name.equals("리버브 강도")?"effects":null;if(glyph!=null){titleLabel.setCompoundDrawables(new StudioControlIcon(glyph,dp(20)),null,null,null);titleLabel.setCompoundDrawablePadding(dp(12));}label.addView(titleLabel,new LinearLayout.LayoutParams(0,-2,1));label.addView(valueLabel);parent.addView(label);
        SeekBar bar=new SeekBar(this);bar.setMax(max);bar.setProgress(initial);bar.setContentDescription(name);bar.setProgressTintList(ColorStateList.valueOf(PINK));bar.setThumbTintList(ColorStateList.valueOf(PINK));bar.setMinimumHeight(dp(44));parent.addView(bar,new LinearLayout.LayoutParams(-1,dp(44)));
        bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onStartTrackingTouch(SeekBar b){}public void onStopTrackingTouch(SeekBar b){}public void onProgressChanged(SeekBar b,int value,boolean user){valueLabel.setText((value+(b==offset?syncMinimum:displayOffset))+unit);if(!updatingPreset){if(b==effectStrength&&VocalPreset.index(presetId)>0){selectPreset(presetId,value);return;}if(user&&(b==echo||b==room||b==size||b==toneControl)){presetId="custom";refreshPresets();}if(b==noise)refreshPresets();applySettings();}}});return bar;
    }
}
