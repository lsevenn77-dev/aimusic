package kr.co.aifect.app.karaoke;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.view.*;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.*;
import org.json.*;
import java.util.*;

/** A lyric wheel: drag to preview a line, release to seek exactly once. No inertial overwrite. */
final class LyricsTimelineView extends ScrollView {
    interface Listener {void begin();void preview(double seconds);void selected(double seconds);void cancelled();}
    private final LinearLayout rows;
    private final ArrayList<TextView> labels=new ArrayList<>();
    private JSONArray words=new JSONArray();
    private final int height,slop,pink=Color.rgb(242,161,198),muted=Color.rgb(145,148,161);
    private Listener listener;
    private boolean dragging,available;
    private float down;
    private int highlighted=-1,lastPreview=-1;
    LyricsTimelineView(Context context){
        super(context);height=dp(72);slop=ViewConfiguration.get(context).getScaledTouchSlop();setVerticalScrollBarEnabled(false);setOverScrollMode(OVER_SCROLL_NEVER);setClipToPadding(false);
        setContentDescription("가사를 위아래로 밀어 녹음 위치 변경");setFocusable(true);
        rows=new LinearLayout(context);rows.setOrientation(LinearLayout.VERTICAL);addView(rows,new LayoutParams(-1,-2));
    }
    void setListener(Listener value){listener=value;}
    void setLyrics(JSONArray value){
        if(words==value)return;words=value;rows.removeAllViews();labels.clear();highlighted=-1;
        for(int i=0;i<words.length();i++){
            final int index=i;TextView text=new TextView(getContext());text.setText(plain(i));text.setTextColor(muted);text.setTextSize(18);text.setMaxLines(3);text.setGravity(Gravity.CENTER);text.setPadding(dp(8),0,dp(8),0);
            text.setAccessibilityDelegate(new View.AccessibilityDelegate(){@Override public void onInitializeAccessibilityNodeInfo(View host,AccessibilityNodeInfo info){super.onInitializeAccessibilityNodeInfo(host,info);info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_CLICK);}@Override public boolean performAccessibilityAction(View host,int action,android.os.Bundle args){if(action==AccessibilityNodeInfo.ACTION_CLICK&&available){select(index);return true;}return super.performAccessibilityAction(host,action,args);}});
            labels.add(text);rows.addView(text,new LinearLayout.LayoutParams(-1,height));
        }
        if(words.length()==0){TextView empty=new TextView(getContext());empty.setText("싱크 가사가 없어요. 아래 위치 막대를 이용해주세요.");empty.setTextColor(muted);empty.setGravity(Gravity.CENTER);rows.addView(empty,new LinearLayout.LayoutParams(-1,height));}
        pad();
    }
    void allowSeek(boolean value){available=value;}
    private void pad(){int padding=Math.max(0,(getHeight()-height)/2);rows.setPadding(0,padding,0,padding);}
    @Override protected void onSizeChanged(int w,int h,int oldW,int oldH){super.onSizeChanged(w,h,oldW,oldH);pad();}
    @Override public boolean onInterceptTouchEvent(android.view.MotionEvent event){return available&&words.length()>0;}
    @Override public boolean onTouchEvent(android.view.MotionEvent event){
        if(!available||words.length()==0)return false;
        int action=event.getActionMasked();
        if(action==MotionEvent.ACTION_DOWN){down=event.getY();dragging=false;lastPreview=-1;getParent().requestDisallowInterceptTouchEvent(true);}
        if(action==MotionEvent.ACTION_MOVE&&!dragging&&Math.abs(event.getY()-down)>slop){dragging=true;if(listener!=null)listener.begin();}
        if(action==MotionEvent.ACTION_UP||action==MotionEvent.ACTION_CANCEL){
            MotionEvent cancel=MotionEvent.obtain(event);cancel.setAction(MotionEvent.ACTION_CANCEL);super.onTouchEvent(cancel);cancel.recycle();
            boolean wasDragging=dragging;dragging=false;getParent().requestDisallowInterceptTouchEvent(false);
            if(action==MotionEvent.ACTION_CANCEL){if(wasDragging&&listener!=null)listener.cancelled();return true;}
            int index=wasDragging?nearest():bounded(Math.round((getScrollY()+event.getY()-rows.getPaddingTop()-height/2f)/height));
            if(!wasDragging&&listener!=null)listener.begin();
            highlight(index);smoothScrollTo(0,index*height);if(listener!=null)listener.selected(seconds(index));performClick();return true;
        }
        boolean handled=super.onTouchEvent(event);
        if(dragging){int index=nearest();highlight(index);if(index!=lastPreview){lastPreview=index;if(listener!=null)listener.preview(seconds(index));}}
        return handled;
    }
    @Override public boolean performClick(){super.performClick();return true;}
    private void select(int index){if(listener!=null){listener.begin();highlight(index);smoothScrollTo(0,index*height);listener.selected(seconds(index));}}
    private int nearest(){return bounded(Math.round(getScrollY()/(float)height));}
    private int bounded(int index){return Math.max(0,Math.min(words.length()-1,index));}
    private double seconds(int index){return words.optJSONObject(index).optDouble("s");}
    private String plain(int index){JSONArray parts=words.optJSONObject(index).optJSONArray("w");StringBuilder text=new StringBuilder();if(parts!=null)for(int i=0;i<parts.length();i++){JSONObject word=parts.optJSONObject(i);if(word!=null){if(text.length()>0)text.append(' ');text.append(word.optString("t"));}}return text.toString();}
    private void highlight(int index){
        if(index==highlighted)return;
        if(highlighted>=0&&highlighted<labels.size()){TextView old=labels.get(highlighted);old.setText(plain(highlighted));old.setTextColor(muted);old.setTypeface(null,Typeface.NORMAL);}
        highlighted=index;if(index>=0&&index<labels.size()){TextView current=labels.get(index);current.setTextColor(pink);current.setTypeface(null,Typeface.BOLD);}
    }
    void showPosition(double seconds){
        if(dragging||labels.isEmpty())return;
        int at=0;for(int i=0;i<words.length();i++){if(words.optJSONObject(i).optDouble("s")<=seconds)at=i;else break;}
        if(at!=highlighted){highlight(at);smoothScrollTo(0,at*height);}
        JSONArray parts=words.optJSONObject(at).optJSONArray("w");SpannableStringBuilder text=new SpannableStringBuilder();
        if(parts!=null)for(int i=0;i<parts.length();i++){JSONObject word=parts.optJSONObject(i);if(word==null)continue;if(text.length()>0)text.append(' ');int begin=text.length();text.append(word.optString("t"));double start=word.optDouble("s"),end=Math.max(start+.05,word.optDouble("e"));int filled=(int)Math.round(Math.max(0,Math.min(1,(seconds-start)/(end-start)))*(text.length()-begin));if(filled>0)text.setSpan(new ForegroundColorSpan(pink),begin,begin+filled,Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);}
        labels.get(at).setTextColor(Color.WHITE);labels.get(at).setText(text);
    }
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
}
