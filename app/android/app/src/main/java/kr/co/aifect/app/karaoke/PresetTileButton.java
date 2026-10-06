package kr.co.aifect.app.karaoke;

import android.content.Context;
import android.graphics.*;
import android.text.*;
import androidx.appcompat.widget.AppCompatButton;

/** Two-column effect tiles; the labels and click targets remain native Buttons. */
final class PresetTileButton extends AppCompatButton {
 private final String kind;private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);private final TextPaint label=new TextPaint(Paint.ANTI_ALIAS_FLAG);
 PresetTileButton(Context context,String title,String kind){super(context);this.kind=kind;setText(title);setAllCaps(false);setTextSize(14);setBackground(null);setPadding(0,0,0,0);setMinWidth(0);setMinimumWidth(0);setMinHeight(0);setMinimumHeight(0);}
 @Override protected void onMeasure(int widthSpec,int heightSpec){label.setTextSize(getTextSize());setMeasuredDimension(resolveSize(dp(112),widthSpec),resolveSize(dp(76)+(int)Math.ceil(label.getFontSpacing()*2),heightSpec));}
 @Override protected void onDraw(Canvas canvas){
  int accent=isSelected()?0xfff178b5:0xffd7b5c7,alpha=isEnabled()?255:110;float inset=dp(1);
  paint.setAlpha(alpha);paint.setStyle(Paint.Style.FILL);paint.setColor(isSelected()?0xff382333:isPressed()?0xff352d3c:0xff20222d);canvas.drawRoundRect(inset,inset,getWidth()-inset,getHeight()-inset,dp(14),dp(14),paint);
  paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(dp(isSelected()||isFocused()?2:1));paint.setColor(isSelected()||isFocused()?0xfff178b5:0xff47414e);canvas.drawRoundRect(inset,inset,getWidth()-inset,getHeight()-inset,dp(14),dp(14),paint);
  paint.setColor(accent);paint.setStrokeWidth(dp(2));paint.setStrokeCap(Paint.Cap.ROUND);paint.setStrokeJoin(Paint.Join.ROUND);canvas.save();canvas.translate(getWidth()/2f,dp(34));Path p=new Path();
  if(kind.equals("original")){p.moveTo(-dp(11),0);p.lineTo(dp(11),0);}
  else if(kind.equals("karaoke")){canvas.drawRoundRect(-dp(5),-dp(13),dp(5),dp(3),dp(5),dp(5),paint);canvas.drawArc(-dp(10),-dp(9),dp(10),dp(12),0,180,false,paint);p.moveTo(0,dp(12));p.lineTo(0,dp(17));p.moveTo(-dp(5),dp(17));p.lineTo(dp(5),dp(17));}
  else if(kind.equals("hall")){p.moveTo(-dp(15),-dp(9));p.lineTo(0,-dp(16));p.lineTo(dp(15),-dp(9));p.close();for(int x:new int[]{-10,0,10}){p.moveTo(dp(x),-dp(5));p.lineTo(dp(x),dp(11));}p.moveTo(-dp(16),dp(15));p.lineTo(dp(16),dp(15));}
  else{for(int i=0;i<3;i++){int y=-10+i*10;p.moveTo(-dp(15),dp(y));p.lineTo(dp(15),dp(y));int x=kind.equals("studio")?new int[]{-7,7,-2}[i]:new int[]{7,-7,3}[i];paint.setStyle(Paint.Style.FILL);paint.setColor(isSelected()?0xff382333:0xff20222d);canvas.drawCircle(dp(x),dp(y),dp(4),paint);paint.setColor(accent);paint.setStyle(Paint.Style.STROKE);canvas.drawCircle(dp(x),dp(y),dp(4),paint);}}
  canvas.drawPath(p,paint);canvas.restore();label.setColor(isSelected()?0xffffdeef:0xfff1edf3);label.setAlpha(alpha);label.setTextSize(getTextSize());label.setTypeface(isSelected()?Typeface.DEFAULT_BOLD:Typeface.DEFAULT);
  StaticLayout text=StaticLayout.Builder.obtain(getText(),0,getText().length(),label,Math.max(1,getWidth()-dp(12))).setAlignment(Layout.Alignment.ALIGN_CENTER).setIncludePad(false).setMaxLines(2).setEllipsize(TextUtils.TruncateAt.END).build();canvas.save();canvas.translate(dp(6),dp(66));text.draw(canvas);canvas.restore();
 }
 private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
}
