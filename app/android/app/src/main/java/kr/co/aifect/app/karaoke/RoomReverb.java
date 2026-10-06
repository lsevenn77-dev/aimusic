package kr.co.aifect.app.karaoke;

/** Wet-only room. The direct vocal never passes through a delay or a tone filter. */
public final class RoomReverb {
    private final float[] preDelay;
    private int preAt;
    private float low, high;
    private final float lowCoefficient, highCoefficient;
    private final Comb[] combs;
    private final AllPass[] diffusers;
    public RoomReverb(int rate){
        if(rate<8000||rate>192000)throw new IllegalArgumentException("Invalid sample rate");
        preDelay=new float[Math.round(rate*.012f)];
        lowCoefficient=1-(float)Math.exp(-2*Math.PI*140/rate);
        highCoefficient=1-(float)Math.exp(-2*Math.PI*5500/rate);
        combs=new Comb[]{new Comb(rate,.0297f),new Comb(rate,.0371f),new Comb(rate,.0411f),new Comb(rate,.0437f)};
        diffusers=new AllPass[]{new AllPass(rate,.005f),new AllPass(rate,.0017f)};
    }
    /** New 100% has the wet gain of the previous 50%; 1% steps remain linear. */
    public static float gain(float amount){return VocalEffects.clamp(amount,0,1)*.5f;}
    public static int restorePercent(int saved,int scaleVersion){return Math.max(0,Math.min(100,scaleVersion>=2?saved:saved*2));}
    public float process(float input,float size){
        if(!Float.isFinite(input))input=0;
        // Keep bass rumble and sharp sibilance out of the reflections, preserving the dry voice.
        low+=(input-low)*lowCoefficient;high+=(input-low-high)*highCoefficient;
        float delayed=preDelay[preAt];preDelay[preAt]=high;if(++preAt==preDelay.length)preAt=0;
        float wet=0;for(Comb c:combs)wet+=c.process(delayed,.57f+VocalEffects.clamp(size,0,1)*.2f);
        wet*=.25f;for(AllPass d:diffusers)wet=d.process(wet);return wet;
    }
    private static final class Comb {
        final float[] data;int at;float damp;
        Comb(int rate,float seconds){data=new float[Math.round(rate*seconds)];}
        float process(float x,float feedback){float y=data[at];damp=y*.65f+damp*.35f;data[at]=x+damp*feedback;if(++at==data.length)at=0;return y;}
    }
    private static final class AllPass {
        final float[] data;int at;
        AllPass(int rate,float seconds){data=new float[Math.max(1,Math.round(rate*seconds))];}
        float process(float x){float delayed=data[at],y=delayed-x;data[at]=x+delayed*.5f;if(++at==data.length)at=0;return y;}
    }
}
