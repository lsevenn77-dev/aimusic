package kr.co.aifect.app.karaoke;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.drawable.Drawable;
import android.graphics.Typeface;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.view.*;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.*;
import androidx.core.widget.TextViewCompat;
import org.json.*;
import java.util.*;

/** A lyric wheel: drag to preview a line, release to seek exactly once. No inertial overwrite. */
final class LyricsTimelineView extends ScrollView {
    interface Listener {void begin();void preview(double seconds);void selected(double seconds);void cancelled();}
    private final LinearLayout rows;
    private final ArrayList<TextView> labels=new ArrayList<>();
    private JSONArray words=new JSONArray();
    private final int minimumRowHeight,slop,pink=Color.rgb(241,120,181),muted=Color.rgb(145,148,161);
    private Listener listener;
    private String[] partLabels=new String[0],partRoles=new String[0];
    private final int mint=Color.rgb(69,223,199);
    void setPartLabels(String[] value){if(java.util.Arrays.equals(partLabels,value))return;partLabels=value;highlighted=-1;for(int i=0;i<labels.size();i++)decorate(i);}
    void setPartRoles(String[] value){if(Arrays.equals(partRoles,value))return;partRoles=value;highlighted=-1;for(int i=0;i<labels.size();i++)decorate(i);}
    private String role(int index){return index<partRoles.length?partRoles[index]:"";}
    private int partColor(int index){return role(index).equals("partner")?mint:pink;}
    private String prefix(int index){return role(index).equals("partial")?"빈 구간 있음 · 추정\n":"";}
    private void decorate(int index){TextView text=labels.get(index);String role=role(index);boolean marked=role.equals("mine")||role.equals("partner")||role.equals("both"),duet=Arrays.stream(partLabels).anyMatch(label->!label.isEmpty());Drawable mic=marked?new PartMic(role):null;text.setCompoundDrawablesRelativeWithIntrinsicBounds(mic,null,null,null);text.setCompoundDrawablePadding(dp(8));text.setPadding(dp(!marked&&duet?56:12),dp(9),dp(12),dp(9));text.setTag("duet-role-"+role);text.setContentDescription((index<partLabels.length?partLabels[index]+" ":"")+plain(index));text.setText(plain(index));text.setTextColor(muted);text.setTypeface(null,Typeface.NORMAL);}
    private final class PartMic extends Drawable {
        private final String role;private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
        PartMic(String value){role=value;}
        @Override public int getIntrinsicWidth(){return dp(36);}
        @Override public int getIntrinsicHeight(){return dp(26);}
        @Override public void draw(Canvas canvas){canvas.save();canvas.translate(getBounds().left,getBounds().top);canvas.scale(getBounds().width()/36f,getBounds().height()/26f);if(role.equals("both")){canvas.save();canvas.scale(.7f,1);mic(canvas,pink);canvas.restore();canvas.translate(18,0);canvas.scale(.7f,1);mic(canvas,mint);}else{canvas.translate(6,0);mic(canvas,role.equals("partner")?mint:pink);}canvas.restore();}
        private void mic(Canvas canvas,int color){paint.setColor(color);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(1.8f);paint.setStrokeCap(Paint.Cap.ROUND);canvas.drawRoundRect(8,3,16,16,4,4,paint);canvas.drawArc(4,8,20,20,0,180,false,paint);canvas.drawLine(12,20,12,24,paint);canvas.drawLine(8,24,16,24,paint);}
        @Override public void setAlpha(int alpha){paint.setAlpha(alpha);}
        @Override public void setColorFilter(android.graphics.ColorFilter filter){paint.setColorFilter(filter);}
        @Override public int getOpacity(){return android.graphics.PixelFormat.TRANSLUCENT;}
    }
    private boolean dragging,available,pointerActive;
    private float down;
    private int highlighted=-1,lastPreview=-1;
    private int alignedIndex=-1,alignedTarget=-1;
    private String textSizeChoice="normal";
    LyricsTimelineView(Context context){
        super(context);minimumRowHeight=dp(62);slop=ViewConfiguration.get(context).getScaledTouchSlop();setVerticalScrollBarEnabled(false);setOverScrollMode(OVER_SCROLL_NEVER);setClipToPadding(false);
        setContentDescription("가사를 위아래로 밀어 녹음 위치 변경");setFocusable(true);
        rows=new LinearLayout(context);rows.setOrientation(LinearLayout.VERTICAL);addView(rows,new LayoutParams(-1,-2));
        getViewTreeObserver().addOnGlobalLayoutListener(this::alignAfterLayout);
    }
    void setListener(Listener value){listener=value;}
    void setTextSizeChoice(String choice){
        String value="small".equals(choice)||"large".equals(choice)?choice:"normal";
        if(value.equals(textSizeChoice))return;textSizeChoice=value;
        for(TextView label:labels)applyTypography(label);
        // Wrapped Korean lines change the real row heights. Re-measure before aligning the wheel.
        alignedIndex=-1;alignedTarget=-1;rows.requestLayout();requestLayout();post(this::alignAfterLayout);
    }
    String textSizeChoice(){return textSizeChoice;}
    private void applyTypography(TextView text){
        text.setTextSize(textSizeChoice.equals("small")?18:textSizeChoice.equals("large")?25:21);
        text.setMinHeight(minimumRowHeight);
        // Keep large, wrapped duet lyrics readable without pushing the next turn below a phone viewport.
        TextViewCompat.setLineHeight(text,Math.round(text.getTextSize()*(textSizeChoice.equals("large")?1.28f:1.42f)));
    }
    void setLyrics(JSONArray value){
        if(words==value)return;words=value;rows.removeAllViews();labels.clear();highlighted=-1;alignedIndex=-1;alignedTarget=-1;scrollTo(0,0);
        for(int i=0;i<words.length();i++){
            final int index=i;TextView text=new TextView(getContext());text.setText(plain(i));text.setTextColor(muted);text.setIncludeFontPadding(false);
            // Android's font-metric multiplier is larger than CSS line-height for Korean fallback fonts.
            if(android.os.Build.VERSION.SDK_INT>=28)text.setFallbackLineSpacing(false);
            applyTypography(text);text.setGravity(Gravity.CENTER_VERTICAL|Gravity.START);
            text.setAccessibilityDelegate(new View.AccessibilityDelegate(){@Override public void onInitializeAccessibilityNodeInfo(View host,AccessibilityNodeInfo info){super.onInitializeAccessibilityNodeInfo(host,info);info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_CLICK);}@Override public boolean performAccessibilityAction(View host,int action,android.os.Bundle args){if(action==AccessibilityNodeInfo.ACTION_CLICK&&available){select(index);return true;}return super.performAccessibilityAction(host,action,args);}});
            labels.add(text);decorate(index);rows.addView(text,new LinearLayout.LayoutParams(-1,LinearLayout.LayoutParams.WRAP_CONTENT));
        }
        if(words.length()==0){TextView empty=new TextView(getContext());empty.setText("싱크 가사가 없어요. 아래 위치 막대를 이용해주세요.");empty.setTextColor(muted);empty.setGravity(Gravity.CENTER);rows.addView(empty,new LinearLayout.LayoutParams(-1,minimumRowHeight));rows.setPadding(0,0,0,0);}
    }
    void allowSeek(boolean value){available=value;}
    private float readingAnchor(int index){
        float anchor=getHeight()*.35f;
        TextView current=labels.get(index);
        // Leave room for the partner line and the next turn when lyrics wrap.
        int next=Math.min(index+2,labels.size()-1);
        int third=Math.min(index+3,labels.size()-1);
        float thirdBelow=labels.get(third).getBottom()-(current.getTop()+current.getHeight()/2f)+dp(6);
        if(thirdBelow<=getHeight()*.65f)next=third;
        float below=labels.get(next).getBottom()-(current.getTop()+current.getHeight()/2f)+dp(6);
        return Math.max(current.getHeight()/2f+dp(6),Math.min(anchor,getHeight()-below));
    }
    private int scrollTarget(int index){TextView line=labels.get(index);return Math.max(0,Math.round(line.getTop()+line.getHeight()/2f-readingAnchor(index)));}
    private void alignAfterLayout(){
        if(pointerActive||dragging||labels.isEmpty()||getHeight()==0||labels.get(0).getHeight()==0)return;
        int last=labels.size()-1;
        int top=Math.max(0,Math.round(readingAnchor(0)-labels.get(0).getHeight()/2f));
        int bottom=Math.max(0,Math.round(getHeight()-readingAnchor(last)-labels.get(last).getHeight()/2f));
        if(rows.getPaddingTop()!=top||rows.getPaddingBottom()!=bottom){rows.setPadding(0,top,0,bottom);return;}
        if(highlighted<0)return;
        int target=scrollTarget(highlighted);
        if(alignedIndex!=highlighted||alignedTarget!=target){alignedIndex=highlighted;alignedTarget=target;smoothScrollTo(0,target);}
    }
    private void alignSelected(){alignedIndex=-1;post(this::alignAfterLayout);}
    @Override public boolean onInterceptTouchEvent(android.view.MotionEvent event){return available&&words.length()>0;}
    @Override public boolean onTouchEvent(android.view.MotionEvent event){
        if(!available||words.length()==0)return false;
        int action=event.getActionMasked();
        if(action==MotionEvent.ACTION_DOWN){pointerActive=true;down=event.getY();dragging=false;lastPreview=-1;getParent().requestDisallowInterceptTouchEvent(true);}
        if(action==MotionEvent.ACTION_MOVE&&!dragging&&Math.abs(event.getY()-down)>slop){dragging=true;if(listener!=null)listener.begin();}
        if(action==MotionEvent.ACTION_UP||action==MotionEvent.ACTION_CANCEL){
            MotionEvent cancel=MotionEvent.obtain(event);cancel.setAction(MotionEvent.ACTION_CANCEL);super.onTouchEvent(cancel);cancel.recycle();
            boolean wasDragging=dragging;dragging=false;pointerActive=false;getParent().requestDisallowInterceptTouchEvent(false);
            if(action==MotionEvent.ACTION_CANCEL){if(wasDragging&&listener!=null)listener.cancelled();return true;}
            int index=wasDragging?nearest():lineAt(getScrollY()+event.getY());
            if(!wasDragging&&listener!=null)listener.begin();
            highlight(index);alignSelected();if(listener!=null)listener.selected(seconds(index));performClick();return true;
        }
        boolean handled=super.onTouchEvent(event);
        if(dragging){int index=nearest();highlight(index);if(index!=lastPreview){lastPreview=index;if(listener!=null)listener.preview(seconds(index));}}
        return handled;
    }
    @Override public boolean performClick(){super.performClick();return true;}
    private void select(int index){if(listener!=null){listener.begin();highlight(index);alignSelected();listener.selected(seconds(index));}}
    private int nearest(){
        int nearest=0;long distance=Long.MAX_VALUE;
        for(int i=0;i<labels.size();i++){long candidate=Math.abs((long)getScrollY()-scrollTarget(i));if(candidate<distance){nearest=i;distance=candidate;}}
        return nearest;
    }
    private int lineAt(float y){for(int i=0;i<labels.size();i++)if(y<labels.get(i).getBottom())return i;return labels.size()-1;}
    private double seconds(int index){return words.optJSONObject(index).optDouble("s");}
    private String plain(int index){JSONArray parts=words.optJSONObject(index).optJSONArray("w");StringBuilder text=new StringBuilder();if(parts!=null)for(int i=0;i<parts.length();i++){JSONObject word=parts.optJSONObject(i);if(word!=null){if(text.length()>0)text.append(' ');text.append(word.optString("t"));}}return prefix(index)+text.toString();}
    private void highlight(int index){
        if(index==highlighted)return;
        if(highlighted>=0&&highlighted<labels.size()){TextView old=labels.get(highlighted);old.setText(plain(highlighted));old.setTextColor(muted);old.setTypeface(null,Typeface.NORMAL);}
        highlighted=index;if(index>=0&&index<labels.size()){TextView current=labels.get(index);current.setTextColor(partColor(index));current.setTypeface(null,Typeface.BOLD);}
    }
    void showPosition(double seconds){
        if(pointerActive||dragging||labels.isEmpty())return;
        int at=0;for(int i=0;i<words.length();i++){if(words.optJSONObject(i).optDouble("s")<=seconds)at=i;else break;}
        if(at!=highlighted){highlight(at);alignSelected();}
        JSONArray parts=words.optJSONObject(at).optJSONArray("w");SpannableStringBuilder text=new SpannableStringBuilder(prefix(at));
        if(parts!=null)for(int i=0;i<parts.length();i++){JSONObject word=parts.optJSONObject(i);if(word==null)continue;if(text.length()>0)text.append(' ');int begin=text.length();text.append(word.optString("t"));double start=word.optDouble("s"),end=Math.max(start+.05,word.optDouble("e"));int filled=(int)Math.round(Math.max(0,Math.min(1,(seconds-start)/(end-start)))*(text.length()-begin));if(filled>0)text.setSpan(new ForegroundColorSpan(partColor(at)),begin,begin+filled,Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);}
        labels.get(at).setTextColor(Color.WHITE);labels.get(at).setText(text);
    }
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
}
