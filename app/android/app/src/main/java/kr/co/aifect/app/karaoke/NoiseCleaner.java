package kr.co.aifect.app.karaoke;

/** Low-latency handling-noise reduction. No look-ahead, blocking or per-sample allocation. */
public final class NoiseCleaner {
 private static final double[] THRESHOLDS={0,.004,.008,.016,.032};
 private final HighPass[][] filters=new HighPass[4][2];
 private final double attack,release,up,down,lowCoefficient,rumbleAttack,rumbleRelease;
 private double low,lowEnvelope,envelope,gain=1,rumbleGain=1,blend;
 public NoiseCleaner(int rate){
  int[] cutoffs={65,80,100,120};for(int i=0;i<4;i++){filters[i][0]=new HighPass(rate,cutoffs[i]);filters[i][1]=new HighPass(rate,cutoffs[i]);}
  attack=1-Math.exp(-1.0/(rate*.002));release=1-Math.exp(-1.0/(rate*.12));up=1-Math.exp(-1.0/(rate*.003));down=1-Math.exp(-1.0/(rate*.07));
  lowCoefficient=1-Math.exp(-2*Math.PI*90/rate);rumbleAttack=1-Math.exp(-1.0/(rate*.001));rumbleRelease=1-Math.exp(-1.0/(rate*.07));
 }
 public float process(float sample,int level){
  double x=Float.isFinite(sample)?sample:0;level=Math.max(0,Math.min(4,level));double filtered=x;
  for(int i=0;i<4;i++){double y=filters[i][1].process(filters[i][0].process(x));if(i==level-1)filtered=y;}
  low+=(x-low)*lowCoefficient;lowEnvelope+=(Math.abs(low)-lowEnvelope)*attack;
  double a=Math.abs(filtered);envelope+=(a-envelope)*(a>envelope?attack:release);
  double ratio=level==0?1:Math.min(1,envelope/THRESHOLDS[level]),target=.005+.995*ratio*ratio;
  gain+=(target-gain)*(target>gain?up:down);
  double rumble=level>=2&&lowEnvelope>.04&&lowEnvelope>envelope*2.5?Math.max(.16,envelope/(lowEnvelope*.8)):1;
  rumbleGain+=(rumble-rumbleGain)*(rumble<rumbleGain?rumbleAttack:rumbleRelease);blend+=((level>0?1:0)-blend)*up;
  return (float)(x+(filtered*gain*rumbleGain-x)*blend);
 }
 // Butterworth high-pass coefficients from the W3C Audio EQ Cookbook; double state at low cutoffs.
 private static final class HighPass {
  private final double b0,b1,a1,a2;private double z1,z2;
  HighPass(int rate,int hz){double w=2*Math.PI*hz/rate,c=Math.cos(w),alpha=Math.sin(w)/Math.sqrt(2),a0=1+alpha;b0=(1+c)/2/a0;b1=-(1+c)/a0;a1=-2*c/a0;a2=(1-alpha)/a0;}
  double process(double x){double y=b0*x+z1;z1=b1*x-a1*y+z2;z2=b0*x-a2*y;return y;}
 }
}
