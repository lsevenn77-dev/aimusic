package kr.co.aifect.app.karaoke;

import android.graphics.*;
import android.graphics.drawable.Drawable;

/** Quiet mirror-ball lighting, painted once per draw; no flashing or animation. */
final class StudioBackdrop extends Drawable {
 private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
 private final float density;
 StudioBackdrop(float density){this.density=density;}
 @Override public void draw(Canvas canvas){
  Rect b=getBounds();float cx=b.exactCenterX(),cy=b.top+78*density,r=32*density;
  paint.setStyle(Paint.Style.FILL);paint.setColor(Color.WHITE);
  paint.setShader(new LinearGradient(0,b.top,b.right,b.bottom,new int[]{0xff10151e,0xff171723,0xff10131b},null,Shader.TileMode.CLAMP));canvas.drawRect(b,paint);
  paint.setShader(new RadialGradient(cx,cy,180*density,new int[]{0x183f8e95,0x007d508b},null,Shader.TileMode.CLAMP));canvas.drawRect(b,paint);paint.setShader(null);
  paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(density);paint.setColor(0x248eabc4);
  canvas.drawLine(cx,b.top,cx,cy-r,paint);canvas.drawCircle(cx,cy,r,paint);
  canvas.save();canvas.clipPath(ball(cx,cy,r));
  for(int i=-2;i<=2;i++){
   canvas.drawLine(cx-r,cy+i*10*density,cx+r,cy+i*10*density,paint);
   float radius=Math.abs(i)*10*density+5*density;canvas.drawOval(cx-radius,cy-r,cx+radius,cy+r,paint);
  }
  canvas.restore();paint.setStyle(Paint.Style.FILL);paint.setColor(0x188eddd2);
  for(int i=0;i<7;i++)canvas.drawCircle(b.left+(i+1)*b.width()/8f,cy+80*density+(i%3)*24*density,1.5f*density,paint);
 }
 private Path ball(float x,float y,float r){Path path=new Path();path.addCircle(x,y,r,Path.Direction.CW);return path;}
 @Override public void setAlpha(int alpha){}
 @Override public void setColorFilter(ColorFilter filter){}
 @Override public int getOpacity(){return PixelFormat.OPAQUE;}
}
