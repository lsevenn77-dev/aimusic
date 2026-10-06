package kr.co.aifect.app.karaoke;
/** Gentle tone and dynamics shaping, independent of the room's wet path. */
final class VocalTone {
 private double low,high,envelope,amount;
 private final double lowC,highC,attack,release,smooth;
 VocalTone(int rate){lowC=1-Math.exp(-2*Math.PI*250/rate);highC=1-Math.exp(-2*Math.PI*3500/rate);attack=1-Math.exp(-1.0/(rate*.008));release=1-Math.exp(-1.0/(rate*.12));smooth=1-Math.exp(-1.0/(rate*.015));}
 float process(float x,float strength){
  amount+=(VocalEffects.clamp(strength,0,1)-amount)*smooth;low+=(x-low)*lowC;high+=(x-high)*highC;
  double tone=x-low*.22+(x-high)*.10,a=Math.abs(tone);envelope+=(a-envelope)*(a>envelope?attack:release);
  double gain=envelope>.18?Math.pow(.18/envelope,.6):1;
  return (float)(x+(tone*gain*1.18-x)*amount);
 }
}
