package kr.co.aifect.app.karaoke;

import android.content.Context;
import android.graphics.*;
import android.view.*;
import java.io.*;

/** Review-only waveform sampled from the saved dry PCM; no recording callback or file writes. */
final class TakeWaveformView extends View {
 interface Listener{void begin();void preview(double seconds);void end(double seconds);}
 private float[] peaks=new float[96];private final Paint paint=new Paint(3);private double position,duration;private Listener listener;
 TakeWaveformView(Context c){super(c);setContentDescription("녹음 재생 위치");setFocusable(true);}
 void listener(Listener value){listener=value;}
 void peaks(float[] value){peaks=value;invalidate();}
 void position(double seconds,double length){position=seconds;duration=length;invalidate();}
 static float[] read(File pcm)throws IOException{float[] result=new float[96];long samples=pcm.length()/2;if(samples==0)return result;try(RandomAccessFile in=new RandomAccessFile(pcm,"r")){byte[] data=new byte[2048];for(int i=0;i<result.length;i++){long at=Math.min(Math.max(0,samples-1024),samples*i/result.length);in.seek(at*2);int n=in.read(data);float peak=0;for(int j=0;j+1<n;j+=2){int s=(short)((data[j]&255)|(data[j+1]<<8));peak=Math.max(peak,Math.abs(s)/32768f);}result[i]=peak;}}return result;}
 @Override protected void onDraw(Canvas c){super.onDraw(c);float step=getWidth()/(float)peaks.length,mid=getHeight()/2f;for(int i=0;i<peaks.length;i++){paint.setColor(i/(double)peaks.length<=position/Math.max(.01,duration)?0xfff2a1c6:0xff735469);paint.setStrokeWidth(Math.max(1,step*.42f));float h=Math.max(1,peaks[i]*(getHeight()-12)/2);c.drawLine((i+.5f)*step,mid-h,(i+.5f)*step,mid+h,paint);}paint.setColor(0xfff2a1c6);paint.setStrokeWidth(2);float x=(float)Math.max(0,Math.min(getWidth(),getWidth()*position/Math.max(.01,duration)));c.drawLine(x,3,x,getHeight()-3,paint);}
 @Override public boolean onTouchEvent(MotionEvent e){if(!isEnabled()||duration<=0)return false;double at=Math.max(0,Math.min(duration,duration*e.getX()/Math.max(1,getWidth())));if(e.getActionMasked()==MotionEvent.ACTION_DOWN){getParent().requestDisallowInterceptTouchEvent(true);if(listener!=null)listener.begin();}if(listener!=null){listener.preview(at);if(e.getActionMasked()==MotionEvent.ACTION_UP||e.getActionMasked()==MotionEvent.ACTION_CANCEL){listener.end(at);getParent().requestDisallowInterceptTouchEvent(false);performClick();}}return true;}
 @Override public boolean performClick(){super.performClick();return true;}
}
