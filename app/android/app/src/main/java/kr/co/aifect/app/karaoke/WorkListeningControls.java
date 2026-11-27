package kr.co.aifect.app.karaoke;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import androidx.core.content.res.ResourcesCompat;
import java.util.Locale;
import kr.co.aifect.app.R;

/** The recorder and published works supply their own transport and media clock. */
public final class WorkListeningControls extends LinearLayout {
    public interface SeekListener {
        void begin();
        void move(long position);
        void end(long position);
    }

    private final TextView caption, elapsed, total;
    private final ImageButton toggle;
    private final SeekBar seek;
    private long length;
    private boolean scrubbing, playing;
    private SeekListener listener;

    public WorkListeningControls(Context context) {
        super(context);
        setOrientation(VERTICAL);
        setPadding(dp(10),dp(10),dp(10),0);
        setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{Color.TRANSPARENT,0x8a0a101b,0xe30a101b}));
        caption = new TextView(context);
        caption.setGravity(Gravity.CENTER);
        caption.setTextColor(Color.WHITE);
        caption.setTextSize(15);
        caption.setMaxLines(2);
        caption.setShadowLayer(dp(3),0,1,Color.BLACK);
        caption.setTypeface(ResourcesCompat.getFont(context,R.font.pretendard_listening));
        addView(caption);
        LinearLayout row = new LinearLayout(context);
        row.setGravity(Gravity.CENTER_VERTICAL);
        toggle = new ImageButton(context);
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(0x32141a24);
        circle.setStroke(dp(1),0x66ffffff);
        toggle.setBackground(circle);
        toggle.setPadding(dp(8),dp(8),dp(8),dp(8));
        toggle.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);
        toggle.setImageTintList(ColorStateList.valueOf(Color.WHITE));
        toggle.setImageResource(android.R.drawable.ic_media_play);
        toggle.setContentDescription("재생");
        LayoutParams playSize = new LayoutParams(dp(34),dp(34));
        playSize.rightMargin = dp(6);
        row.addView(toggle,playSize);
        elapsed = clock(context);
        row.addView(elapsed);
        seek = new SeekBar(context);
        seek.setMax(1000);
        seek.setContentDescription("재생 위치");
        ColorStateList mint = ColorStateList.valueOf(0xff8eddd2);
        seek.setProgressTintList(mint);
        seek.setThumbTintList(mint);
        row.addView(seek,new LayoutParams(0,dp(44),1));
        total = clock(context);
        row.addView(total);
        addView(row,new LayoutParams(-1,dp(46)));
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onStartTrackingTouch(SeekBar bar) { scrubbing=true; if(listener!=null)listener.begin(); }
            public void onProgressChanged(SeekBar bar,int value,boolean user) {
                if(user){long position=length*value/1000; elapsed.setText(format(position)); if(listener!=null)listener.move(position);}
            }
            public void onStopTrackingTouch(SeekBar bar) { scrubbing=false; if(listener!=null)listener.end(length*bar.getProgress()/1000); }
        });
    }
    public void bind(Runnable onPlay,SeekListener onSeek) {
        toggle.setOnClickListener(v->onPlay.run());
        listener=onSeek;
    }
    public void show(long position,long duration,boolean active,String line,boolean enabled) {
        length=Math.max(0,duration);
        if(playing!=active){playing=active; toggle.setImageResource(active?android.R.drawable.ic_media_pause:android.R.drawable.ic_media_play); toggle.setContentDescription(active?"일시정지":"재생");}
        toggle.setEnabled(enabled);
        seek.setEnabled(enabled&&length>0);
        if(!scrubbing){elapsed.setText(format(position)); seek.setProgress(length==0?0:(int)Math.min(1000,Math.max(0,position)*1000/length));}
        total.setText(format(length));
        if(!caption.getText().toString().equals(line))caption.setText(line);
        caption.setVisibility(line.isEmpty()?View.GONE:View.VISIBLE);
    }
    private TextView clock(Context context) {
        TextView view=new TextView(context);view.setTextSize(11);view.setTextColor(Color.WHITE);
        view.setTypeface(Typeface.DEFAULT);view.setFontFeatureSettings("tnum");return view;
    }
    private static String format(long ms) {
        long seconds=Math.max(0,ms)/1000;
        return String.format(Locale.ROOT,"%d:%02d",seconds/60,seconds%60);
    }
    private int dp(int value) { return Math.round(value*getResources().getDisplayMetrics().density); }
}
