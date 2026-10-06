package kr.co.aifect.app.karaoke;

import android.graphics.*;
import android.graphics.drawable.Drawable;

/** Small stroke icons shared by the sound and post-recording controls. */
final class StudioControlIcon extends Drawable {
 private final String kind;private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
 StudioControlIcon(String kind,int size){this.kind=kind;setBounds(0,0,size,size);paint.setColor(0xffed93bd);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(1.5f);paint.setStrokeCap(Paint.Cap.ROUND);paint.setStrokeJoin(Paint.Join.ROUND);}
 @Override public void draw(Canvas canvas){canvas.save();canvas.translate(getBounds().left,getBounds().top);canvas.scale(getBounds().width()/24f,getBounds().height()/24f);Path p=new Path();
  if(kind.equals("voice")){canvas.drawRoundRect(9,2,15,14,3,3,paint);p.moveTo(5,10);p.lineTo(5,12);p.cubicTo(5,21,19,21,19,12);p.lineTo(19,10);p.moveTo(12,19);p.lineTo(12,23);p.moveTo(8,23);p.lineTo(16,23);}
  else if(kind.equals("music")){p.moveTo(9,18);p.lineTo(9,5);p.lineTo(21,2);p.lineTo(21,15);p.moveTo(9,8);p.lineTo(21,5);canvas.drawCircle(6,18,3,paint);canvas.drawCircle(18,15,3,paint);}
  else if(kind.equals("size")){p.moveTo(12,2);p.lineTo(3,7);p.lineTo(3,17);p.lineTo(12,22);p.lineTo(21,17);p.lineTo(21,7);p.close();p.moveTo(3,7);p.lineTo(12,12);p.lineTo(21,7);p.moveTo(12,12);p.lineTo(12,22);}
  else if(kind.equals("echo")){canvas.drawCircle(12,12,9,paint);canvas.drawCircle(12,12,5,paint);canvas.drawCircle(12,12,1,paint);}
  else{for(int i=0;i<5;i++){int x=4+i*4,h=new int[]{3,7,10,7,3}[i];p.moveTo(x,12-h);p.lineTo(x,12+h);}}
  canvas.drawPath(p,paint);canvas.restore();
 }
 @Override public void setAlpha(int alpha){paint.setAlpha(alpha);}
 @Override public void setColorFilter(ColorFilter filter){paint.setColorFilter(filter);}
 @Override public int getOpacity(){return PixelFormat.TRANSLUCENT;}
}
