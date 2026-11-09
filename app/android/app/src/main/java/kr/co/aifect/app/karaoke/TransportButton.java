package kr.co.aifect.app.karaoke;

import android.content.Context;
import android.graphics.*;
import android.text.*;
import androidx.appcompat.widget.AppCompatButton;

/** Native click/accessibility semantics with a larger circular recording control. */
final class TransportButton extends AppCompatButton {
 private final String glyph;private final boolean primary;private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);private final TextPaint label=new TextPaint(Paint.ANTI_ALIAS_FLAG);
 private boolean compact,recordingActive;
 TransportButton(Context context,String text,String glyph,boolean primary){super(context);this.glyph=glyph;this.primary=primary;setText(text);setAllCaps(false);setBackground(null);setMinWidth(0);setMinimumWidth(0);setPadding(0,0,0,0);setTextSize(12);setMinHeight(0);setMinimumHeight(0);}
 void setCompact(boolean value){if(compact==value)return;compact=value;requestLayout();invalidate();}
 void setRecordingActive(boolean value){recordingActive=value;invalidate();}
 @Override protected void onMeasure(int widthSpec,int heightSpec){
  label.setTextSize(12*getResources().getDisplayMetrics().scaledDensity);
  // The bottom bar follows the approved recording design: large round controls, a bigger centre record button.
  int height=compact?dp(52):dp(92)+(int)Math.ceil(label.getFontSpacing()*2);
  setMeasuredDimension(resolveSize(dp(primary?104:72),widthSpec),resolveSize(height,heightSpec));
 }
 @Override protected void onDraw(Canvas canvas){
  float cx=getWidth()/2f,cy=compact?getHeight()/2f:dp(44),r=Math.min(dp(primary?40:27),Math.min(getWidth()/2f-dp(2),compact?getHeight()/2f-dp(2):dp(42)));
  boolean bright=isEnabled()||recordingActive;int alpha=bright?255:90;
  paint.setColor(primary?(isPressed()?0xffe4d2ff:0xffd6baff):isSelected()?0xffd6baff:0xff5b5a6a);paint.setAlpha(alpha);paint.setStyle(primary?Paint.Style.FILL:Paint.Style.STROKE);paint.setStrokeWidth(dp(1)*1.5f);canvas.drawCircle(cx,cy,r,paint);
  if(recordingActive||isFocused()){paint.setStyle(Paint.Style.STROKE);paint.setColor(0xffaeebdf);paint.setStrokeWidth(dp(2));canvas.drawCircle(cx,cy,Math.max(1,r-dp(4)),paint);}
  paint.setColor(primary?0xff16151b:0xfff5f2f6);paint.setAlpha(alpha);paint.setStrokeWidth(dp(primary?3:2));paint.setStyle(Paint.Style.STROKE);paint.setStrokeCap(Paint.Cap.ROUND);paint.setStrokeJoin(Paint.Join.ROUND);
  float scale=compact?1:primary?1.5f:1.15f;canvas.save();canvas.translate(cx,cy);canvas.scale(scale,scale);Path path=new Path();
  if(glyph.equals("mic")&&recordingActive){path.moveTo(-dp(4),-dp(7));path.lineTo(-dp(4),dp(7));path.moveTo(dp(4),-dp(7));path.lineTo(dp(4),dp(7));}
  else if(glyph.equals("mic")){canvas.drawRoundRect(-dp(4),-dp(11),dp(4),dp(3),dp(4),dp(4),paint);path.moveTo(-dp(8),-dp(1));path.lineTo(-dp(8),dp(2));path.cubicTo(-dp(8),dp(12),dp(8),dp(12),dp(8),dp(2));path.lineTo(dp(8),-dp(1));path.moveTo(0,dp(9));path.lineTo(0,dp(14));path.moveTo(-dp(4),dp(14));path.lineTo(dp(4),dp(14));}
  else if(glyph.equals("headphones")){canvas.drawArc(-dp(9),-dp(10),dp(9),dp(9),180,180,false,paint);path.moveTo(-dp(9),0);path.lineTo(-dp(9),dp(8));path.lineTo(-dp(5),dp(8));path.lineTo(-dp(5),0);path.close();path.moveTo(dp(9),0);path.lineTo(dp(9),dp(8));path.lineTo(dp(5),dp(8));path.lineTo(dp(5),0);path.close();}
  else if(glyph.equals("settings")){for(int i=0;i<3;i++){float x=dp(-8+i*8);canvas.drawLine(x,-dp(10),x,dp(10),paint);canvas.drawCircle(x,dp(i==1?4:-3),dp(3),paint);}}
  else if(glyph.equals("pause")){path.moveTo(-dp(4),-dp(7));path.lineTo(-dp(4),dp(7));path.moveTo(dp(4),-dp(7));path.lineTo(dp(4),dp(7));}
  else if(glyph.equals("restart")){canvas.drawArc(-dp(10),-dp(10),dp(10),dp(10),-90,300,false,paint);path.moveTo(dp(5),-dp(15));path.lineTo(0,-dp(10));path.lineTo(dp(5),-dp(5));}
  else if(glyph.equals("check")){path.moveTo(-dp(8),0);path.lineTo(-dp(2),dp(6));path.lineTo(dp(9),-dp(6));}
  else {path.moveTo(-dp(5),-dp(8));path.lineTo(dp(8),0);path.lineTo(-dp(5),dp(8));path.close();}
  canvas.drawPath(path,paint);canvas.restore();if(compact)return;
  label.setColor(bright?0xfff4f0f4:0xff96919e);label.setTextSize(12*getResources().getDisplayMetrics().scaledDensity);
  StaticLayout text=StaticLayout.Builder.obtain(getText(),0,getText().length(),label,Math.max(1,getWidth()-dp(4))).setAlignment(Layout.Alignment.ALIGN_CENTER).setIncludePad(false).setMaxLines(2).setEllipsize(TextUtils.TruncateAt.END).build();canvas.save();canvas.translate(dp(2),dp(92));text.draw(canvas);canvas.restore();
 }
 private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
}
