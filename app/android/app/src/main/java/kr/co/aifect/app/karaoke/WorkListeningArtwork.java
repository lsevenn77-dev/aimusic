package kr.co.aifect.app.karaoke;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.RectF;
import android.os.SystemClock;
import android.view.View;
import kr.co.aifect.app.R;

/** A common square renderer for the recorder preview and the native work page. */
public final class WorkListeningArtwork extends View {
    public static final String BASIC="cover", TURNTABLE="turntable-v1", PROJECTOR="projector-v1";
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);
    private final Rect visible=new Rect();
    private final Bitmap fallback;
    private Bitmap photo,device;
    private String mode=BASIC;
    private boolean playing;
    private long timeMillis,updated;

    public WorkListeningArtwork(Context context){
        super(context);
        fallback=BitmapFactory.decodeResource(getResources(),R.drawable.listening_cover);
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    }
    public static boolean isTemplate(String value){
        return BASIC.equals(value)||TURNTABLE.equals(value)||PROJECTOR.equals(value);
    }
    public void show(String template,Bitmap cover){
        String next=isTemplate(template)?template:BASIC;
        if(!next.equals(mode)){
            mode=next;
            int resource=TURNTABLE.equals(mode)?R.drawable.listening_turntable:PROJECTOR.equals(mode)?R.drawable.listening_projector:0;
            device=resource==0?null:BitmapFactory.decodeResource(getResources(),resource);
        }
        photo=cover;invalidate();
    }
    public void playback(long millis,boolean active){
        timeMillis=millis;updated=SystemClock.uptimeMillis();playing=active;invalidate();
    }
    @Override protected void onDraw(Canvas canvas){
        super.onDraw(canvas);
        float size=Math.min(getWidth(),getHeight());
        if(size<=0)return;
        canvas.save();canvas.translate((getWidth()-size)/2,(getHeight()-size)/2);canvas.scale(size,size);canvas.clipRect(0,0,1,1);
        Bitmap cover=photo==null?fallback:photo;
        if(device==null){drawCrop(canvas,cover,new RectF(0,0,1,1));canvas.restore();return;}

        boolean motion=playing&&isShown()&&getGlobalVisibleRect(visible)&&ValueAnimator.areAnimatorsEnabled();
        double elapsed=(timeMillis+(motion?Math.max(0,SystemClock.uptimeMillis()-updated):0))/1000.0;
        if(TURNTABLE.equals(mode)){
            drawCrop(canvas,device,new RectF(0,0,1,1));
            RectF label=new RectF(.299f,.375f,.558f,.641f);
            Path clip=new Path();clip.addOval(label,Path.Direction.CW);
            canvas.save();canvas.clipPath(clip);
            if(ValueAnimator.areAnimatorsEnabled())canvas.rotate((float)((elapsed%12)*30),label.centerX(),label.centerY());
            drawCrop(canvas,cover,new RectF(.293f,.372f,.564f,.644f));canvas.restore();
            if(motion)drawRain(canvas,elapsed);
        }else{
            canvas.drawColor(0xff0d0905);
            canvas.translate(0,-.02f);
            drawCrop(canvas,device,new RectF(0,0,1,1));
            RectF screen=new RectF(.383f,.155f,.967f,.701f);
            if(motion){
                drawReel(canvas,new RectF(.111f,.146f,.214f,.376f),elapsed);
                drawReel(canvas,new RectF(.177f,.587f,.233f,.747f),elapsed);
                canvas.save();canvas.clipRect(screen);
                canvas.translate((float)Math.sin(elapsed*4)*.0005f,(float)Math.cos(elapsed*3)*.0004f);
                drawCrop(canvas,cover,screen);canvas.restore();
            }else drawCrop(canvas,cover,screen);
            if(motion)drawFilm(canvas,screen,elapsed);
        }
        canvas.restore();
        if(motion)postInvalidateOnAnimation();
    }
    private void drawCrop(Canvas canvas,Bitmap bitmap,RectF area){
        if(bitmap==null)return;
        float target=area.width()/area.height(),original=bitmap.getWidth()/(float)bitmap.getHeight();
        int width=bitmap.getWidth(),height=bitmap.getHeight();
        int w=original>target?Math.round(height*target):width,h=original<target?Math.round(width/target):height;
        paint.setColor(Color.WHITE);
        canvas.drawBitmap(bitmap,new Rect((width-w)/2,(height-h)/2,(width+w)/2,(height+h)/2),area,paint);
    }
    private void drawReel(Canvas canvas, RectF area, double time){
        canvas.save();
        Path boundary=new Path();boundary.addOval(area,Path.Direction.CW);canvas.clipPath(boundary);
        canvas.translate(area.centerX(),area.centerY());canvas.scale(area.width()/area.height(),1);
        canvas.rotate((float)((time%7)*360/7));canvas.scale(area.height()/area.width(),1);
        canvas.translate(-area.centerX(),-area.centerY());drawCrop(canvas,device,new RectF(0,0,1,1));
        canvas.restore();
    }
    private void drawRain(Canvas canvas,double t){
        paint.setColor(0x83e6f5ff);paint.setStrokeWidth(.002f);paint.setStrokeCap(Paint.Cap.ROUND);
        for(int i=0;i<9;i++){
            float x=.07f+.106f*i,y=(float)(((t/(4+i*.27)+i*.27)%1)*.25-.04);
            if(y>=0&&y<.193f)canvas.drawLine(x,y,x-.001f,y+.019f,paint);
        }
    }
    private void drawFilm(Canvas canvas,RectF screen,double t){
        float pulse=(float)(.04+.06*(.5+.5*Math.sin(t*13)));
        paint.setColor(Color.argb((int)(255*pulse),0,0,0));canvas.drawRect(screen,paint);
        paint.setColor(Color.argb((int)(34+18*Math.sin(t*4)),244,158,82));
        Path light=new Path();light.moveTo(.213f,.505f);light.lineTo(.383f,.2f);light.lineTo(.383f,.664f);light.close();
        canvas.drawPath(light,paint);
        if(t%2.8<.13){
            paint.setColor(0x65ffffff);paint.setStrokeWidth(.0016f);
            canvas.drawLine(.787f,.17f,.781f,.68f,paint);
            canvas.drawCircle(.819f,.42f,.002f,paint);
        }
    }
}
