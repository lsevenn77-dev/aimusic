package kr.co.aifect.app.karaoke;

import android.app.Dialog;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.util.ArrayList;

/** One persistent sheet: changing a part never closes the list or loses its scroll position. */
final class DuetPartEditor extends Dialog {
    interface Listener {void changed();void seek(double seconds);}
    private static final int BG=0xff191e29,INK=0xff10131b,PINK=0xfff5a0df,MINT=0xff7cf2df,BLUE=0xffb2c0ea,MUTED=0xffa6adba,RAISED=0xff242c38;
    private final JSONArray words;
    private final JSONObject guide,original;
    private final ArrayList<TextView> lyricLabels=new ArrayList<>();
    private final boolean second;
    private final double duration;
    private final Listener listener;
    private final ArrayList<Button[]> selections=new ArrayList<>();
    private final LinearLayout sheet,body;
    private final ScrollView viewport;
    private final TextView hint;
    private TextView status;
    private Button free,manual,fill;

    DuetPartEditor(Context context,JSONArray words,JSONObject guide,boolean second,double duration,Listener listener){
        super(context);this.words=words;this.original=guide;this.guide=copy(guide);this.second=second;this.duration=duration;this.listener=listener;
        if(!second&&this.guide!=null&&words.length()>0&&!this.guide.has("activity")&&DuetGuide.assigned(this.guide,words.length())==0){try{this.guide.put("mode","lyrics");}catch(JSONException ignored){}}
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        sheet=column();sheet.setPadding(dp(16),dp(16),dp(16),dp(16));
        GradientDrawable background=new GradientDrawable();background.setColor(BG);background.setCornerRadius(dp(24));sheet.setBackground(background);
        LinearLayout header=new LinearLayout(context);header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title=label(second?"듀엣 파트 보기":"듀엣 파트 나누기",20,Color.WHITE);title.setTypeface(null,Typeface.BOLD);header.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        Button close=control("닫기",null);close.setContentDescription("듀엣 파트 닫기");close.setOnClickListener(v->dismiss());header.addView(close);sheet.addView(header);
        if(!second&&guide!=null){
            LinearLayout modes=new LinearLayout(context);free=control("자유롭게 부르기","duet-method-free");manual=control("가사별로 지정","duet-method-lyrics");
            free.setOnClickListener(v->chooseMode("free"));manual.setOnClickListener(v->chooseMode("lyrics"));manual.setEnabled(words.length()>0);addChoice(modes,free);addChoice(modes,manual);sheet.addView(modes);
        }
        LinearLayout legend=new LinearLayout(context);String[] names={"● 내 파트","● 같이","● 상대 파트"};int[] colors={PINK,MINT,BLUE};for(int i=0;i<3;i++){TextView item=label(names[i],13,colors[i]);item.setGravity(Gravity.CENTER);legend.addView(item,new LinearLayout.LayoutParams(0,dp(44),1));}sheet.addView(legend);
        hint=label("",13,MUTED);hint.setPadding(0,dp(10),0,dp(10));sheet.addView(hint);
        if(!second&&guide!=null){fill=control("남은 줄을 파트너로 지정","duet-fill-partner");fill.setOnClickListener(v->{try{DuetGuide.fillPartner(this.guide,words.length());for(int i=0;i<selections.size();i++)updateRow(i);changed();}catch(JSONException e){status.setText("파트를 저장하지 못했어요. 다시 선택해주세요.");}});sheet.addView(fill);}
        viewport=new ScrollView(context);viewport.setFillViewport(true);body=column();viewport.addView(body);sheet.addView(viewport,new LinearLayout.LayoutParams(-1,0,1));
        status=label("",13,MUTED);status.setTag("duet-editor-status");status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);status.setPadding(0,dp(10),0,dp(6));sheet.addView(status);
        LinearLayout footer=new LinearLayout(context);
        if(!second){Button reset=control("전체 초기화","duet-editor-reset");reset.setOnClickListener(v->{try{this.guide.put("mode",words.length()>0?"lyrics":"free").put("lines",new JSONArray());this.guide.remove("activity");renderBody();changed();}catch(JSONException e){status.setText("다시 시도해주세요.");}});addChoice(footer,reset);}
        Button done=control(second?"닫기":"적용하기","duet-editor-done");done.setBackgroundTintList(ColorStateList.valueOf(MINT));done.setTextColor(INK);done.setOnClickListener(v->{String problem=second?"":DuetGuide.manualProblem(this.guide,words.length());if(!problem.isEmpty()){status.setText(problem);return;}if(!second&&original!=null){try{original.put("mode",this.guide.optString("mode")).put("lines",new JSONArray(this.guide.optJSONArray("lines").toString()));if(this.guide.has("activity"))original.put("activity",this.guide.get("activity"));else original.remove("activity");listener.changed();}catch(JSONException e){status.setText("파트를 적용하지 못했어요.");return;}}dismiss();});addChoice(footer,done);sheet.addView(footer);
        setContentView(sheet);renderBody();updateSummary();
    }
    @Override protected void onStart(){super.onStart();Window window=getWindow();if(window!=null){window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));android.util.DisplayMetrics display=getContext().getResources().getDisplayMetrics();window.setLayout(Math.min(dp(560),display.widthPixels-dp(24)),(int)(display.heightPixels*.86));window.setGravity(Gravity.CENTER);}}
    private void chooseMode(String mode){try{guide.put("mode",mode);renderBody();changed();}catch(JSONException e){status.setText("파트 방식을 저장하지 못했어요.");}}
    private void changed(){updateSummary();}
    private void updateSummary(){
        boolean lyrics=guide!=null&&guide.optString("mode").equals("lyrics");
        if(free!=null){style(free,!lyrics,PINK);style(manual,lyrics,PINK);fill.setVisibility(lyrics?View.VISIBLE:View.GONE);fill.setEnabled(DuetGuide.assigned(guide,words.length())<words.length());}
        hint.setText(second?(guide==null?"구간 정보가 없는 녹음이에요. 파트너의 목소리를 들으며 원하는 구간을 불러주세요.":"내 파트는 핑크, 같이 부르면 민트, 상대 파트는 블루예요."):lyrics?"각 가사 줄 오른쪽의 색으로 파트를 선택하세요.":"원하는 구간을 자유롭게 부르세요. 녹음 후 목소리가 없는 구간을 추정해요. 가사별로 직접 바꿀 수도 있어요.");
        status.setText(second?"파트너가 정한 안내를 보고 함께 불러주세요.":lyrics?DuetGuide.assigned(guide,words.length())+" / "+words.length()+"줄 지정 · 내 파트와 파트너를 나눠주세요.":"작은 목소리와 잡음에 따라 빈 구간 추정이 다를 수 있어요.");
    }
    private void renderBody(){
        body.removeAllViews();selections.clear();lyricLabels.clear();
        if(words.length()==0)body.addView(label("싱크 가사가 없어요. 원하는 구간을 자유롭게 불러주세요.",15,MUTED));
        for(int i=0;i<words.length();i++){
            final int index=i;JSONObject line=words.optJSONObject(i);if(line==null){if(!second&&guide!=null)selections.add(null);continue;}
            LinearLayout row=new LinearLayout(getContext());row.setGravity(Gravity.CENTER_VERTICAL);row.setPadding(dp(10),dp(8),dp(6),dp(8));row.setTag("duet-line-"+i);
            GradientDrawable card=new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,new int[]{0xff253343,0xff202b3a});card.setCornerRadius(dp(12));card.setStroke(dp(1),0x5562718b);row.setBackground(card);
            TextView lyric=label(lineText(line),15,Color.WHITE);lyric.setGravity(Gravity.CENTER);lyricLabels.add(lyric);row.addView(lyric,new LinearLayout.LayoutParams(0,-2,1));
            if(second||guide==null){String name=DuetGuide.label(guide,words,i,second,duration);String role=DuetGuide.role(DuetGuide.part(guide,words,i,duration),second);lyric.setTextColor(role.equals("partner")?BLUE:role.equals("both")?MINT:role.equals("mine")?PINK:MUTED);row.addView(label(name.isEmpty()?"파트 안내 없음":name,12,role.equals("partner")?BLUE:role.equals("both")?MINT:role.equals("mine")?PINK:MUTED));}
            else{
                LinearLayout choices=new LinearLayout(getContext());Button[] buttons=new Button[3];String[] names={"내 파트","같이","상대 파트"},values={"A","both","B"};
                for(int j=0;j<3;j++){final String value=values[j];Button button=control("","duet-line-"+i+"-"+value);button.setContentDescription((i+1)+"번째 가사 "+names[j]);buttons[j]=button;button.setOnClickListener(v->{try{guide.put("mode","lyrics");DuetGuide.assign(guide,index,value);updateRow(index);changed();}catch(JSONException e){status.setText("파트를 저장하지 못했어요.");}});choices.addView(button,new LinearLayout.LayoutParams(dp(44),dp(48)));}selections.add(buttons);row.addView(choices);updateRow(i);
            }
            LinearLayout.LayoutParams rowParams=new LinearLayout.LayoutParams(-1,-2);rowParams.bottomMargin=dp(8);body.addView(row,rowParams);
        }
        if(guide!=null&&guide.optString("mode").equals("free")&&guide.has("activity")){
            body.addView(label("아직 부르지 않은 구간 · 추정",15,MINT));ArrayList<double[]> ranges=DuetGuide.remaining(guide,duration);
            for(int i=0;i<Math.min(24,ranges.size());i++){double[] range=ranges.get(i);Button jump=control(time(range[0])+" – "+time(range[1]),null);jump.setOnClickListener(v->{dismiss();listener.seek(range[0]);});body.addView(jump);}
        }
    }
    private void updateRow(int index){
        if(index>=selections.size()||selections.get(index)==null)return;String explicit=DuetGuide.explicitPart(guide,index),part=DuetGuide.part(guide,words,index,duration);Button[] buttons=selections.get(index);String[] values={"A","both","B"};
        String role=DuetGuide.role(part,false);lyricLabels.get(index).setTextColor(role.equals("mine")?PINK:role.equals("both")?MINT:role.equals("partner")?BLUE:MUTED);
        for(int j=0;j<buttons.length;j++){Button button=buttons[j];boolean selected=values[j].equals(part);int color=j==0?PINK:j==1?MINT:BLUE;button.setSelected(selected);button.setBackgroundTintList(null);button.setBackground(new ChoiceCircle(color,selected));button.setContentDescription((index+1)+"번째 가사 "+(j==0?"내 파트":j==1?"같이":"상대 파트")+(selected?" 선택됨":""));}

    }
    private static JSONObject copy(JSONObject value){if(value==null)return null;try{return new JSONObject(value.toString());}catch(JSONException e){throw new IllegalArgumentException(e);}}
    private final class ChoiceCircle extends android.graphics.drawable.Drawable {
        private final android.graphics.Paint paint=new android.graphics.Paint(3);private final int color;private final boolean selected;
        ChoiceCircle(int color,boolean selected){this.color=color;this.selected=selected;}
        public void draw(android.graphics.Canvas canvas){float x=getBounds().exactCenterX(),y=getBounds().exactCenterY();paint.setColor(color);paint.setStyle(android.graphics.Paint.Style.STROKE);paint.setStrokeWidth(dp(1));canvas.drawCircle(x,y,dp(11),paint);if(selected){paint.setStyle(android.graphics.Paint.Style.FILL);canvas.drawCircle(x,y,dp(8),paint);}}
        public void setAlpha(int alpha){paint.setAlpha(alpha);}public void setColorFilter(android.graphics.ColorFilter f){paint.setColorFilter(f);}public int getOpacity(){return android.graphics.PixelFormat.TRANSLUCENT;}
    }
    private void style(Button button,boolean selected,int color){button.setSelected(selected);button.setTextColor(selected?INK:MUTED);button.setBackgroundTintList(ColorStateList.valueOf(selected?color:RAISED));}
    private LinearLayout column(){LinearLayout layout=new LinearLayout(getContext());layout.setOrientation(LinearLayout.VERTICAL);return layout;}
    private TextView label(String text,int size,int color){TextView view=new TextView(getContext());view.setText(text);view.setTextSize(size);view.setTextColor(color);view.setLineSpacing(dp(3),1);return view;}
    private Button control(String text,String tag){Button button=new Button(getContext());button.setText(text);button.setTag(tag);button.setAllCaps(false);button.setTextSize(13);button.setMinWidth(0);button.setMinimumWidth(0);button.setMinHeight(dp(48));button.setPadding(dp(5),dp(6),dp(5),dp(6));button.setBackgroundTintList(ColorStateList.valueOf(RAISED));button.setTextColor(MUTED);return button;}
    private void addChoice(LinearLayout row,Button button){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);p.setMargins(dp(2),dp(4),dp(2),dp(4));row.addView(button,p);}
    private String lineText(JSONObject line){JSONArray words=line.optJSONArray("w");StringBuilder result=new StringBuilder();if(words!=null)for(int i=0;i<words.length();i++){JSONObject word=words.optJSONObject(i);if(word!=null){if(result.length()>0)result.append(' ');result.append(word.optString("t"));}}return result.toString();}
    private String time(double seconds){int value=(int)Math.max(0,seconds);return String.format(java.util.Locale.ROOT,"%d:%02d",value/60,value%60);}
    private int dp(int value){return Math.round(value*getContext().getResources().getDisplayMetrics().density);}
}
