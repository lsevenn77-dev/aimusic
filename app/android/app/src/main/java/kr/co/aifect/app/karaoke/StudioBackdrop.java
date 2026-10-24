package kr.co.aifect.app.karaoke;

import android.graphics.*;
import android.graphics.drawable.Drawable;

/** An uninterrupted surface keeps the lyrics in focus. */
final class StudioBackdrop extends Drawable {
 private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
 private final float density;
 StudioBackdrop(float density){this.density=density;}
 @Override public void draw(Canvas canvas){
  paint.setShader(null);paint.setStyle(Paint.Style.FILL);paint.setColor(0xff0c121b);canvas.drawRect(getBounds(),paint);
 }
 private Path ball(float x,float y,float r){Path path=new Path();path.addCircle(x,y,r,Path.Direction.CW);return path;}
 @Override public void setAlpha(int alpha){}
 @Override public void setColorFilter(ColorFilter filter){}
 @Override public int getOpacity(){return PixelFormat.OPAQUE;}
}
