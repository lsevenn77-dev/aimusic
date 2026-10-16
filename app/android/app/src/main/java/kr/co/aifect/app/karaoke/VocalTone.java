package kr.co.aifect.app.karaoke;
/** Broad, bidirectional EQ. Zero preserves dry samples; no pitch shifting. */
final class VocalTone {
 private double amount,envelope;
 private final double smooth,attack,release;
 private final Band[] bright,deep,extra;
 VocalTone(int rate){attack=1-Math.exp(-1.0/(rate*.008));release=1-Math.exp(-1.0/(rate*.12));smooth=1-Math.exp(-1.0/(rate*.025));bright=bands(rate,-4,6,2);deep=bands(rate,5,-6,-3);extra=bands(rate,-2,4,2);}
 private static Band[] bands(int rate,double body,double presence,double air){return new Band[]{new Band(rate,280,.7,body),new Band(rate,2600,.7,presence),new Band(rate,6200,.8,air)};}
 private static double filter(Band[] bands,double x){for(Band b:bands)x=b.process(x);return x;}
 float process(float x,float strength){
  amount+=(VocalEffects.clamp(strength,-1,2)-amount)*smooth;
  double light=filter(bright,x)*.9,dark=filter(deep,x)*.9,high=filter(extra,light)*.85;
  double shaped=amount<0?dark:amount<=1?light:light+(high-light)*(amount-1);
  double magnitude=Math.max(Math.abs(x),Math.abs(shaped));envelope+=(magnitude-envelope)*(magnitude>envelope?attack:release);
  double gain=envelope>.18?Math.pow(.18/envelope,.6):1;
  return (float)(x+(shaped*gain-x)*Math.min(1,Math.abs(amount)));
 }
 private static final class Band {
  final double b0,b1,b2,a1,a2;double z1,z2;
  Band(int rate,double hz,double q,double db){double a=Math.pow(10,db/40),w=2*Math.PI*Math.min(hz,rate*.4)/rate,c=Math.cos(w),alpha=Math.sin(w)/(2*q),a0=1+alpha/a;b0=(1+alpha*a)/a0;b1=-2*c/a0;b2=(1-alpha*a)/a0;a1=-2*c/a0;a2=(1-alpha/a)/a0;}
  double process(double x){double y=b0*x+z1;z1=b1*x-a1*y+z2;z2=b2*x-a2*y;return y;}
 }
}
