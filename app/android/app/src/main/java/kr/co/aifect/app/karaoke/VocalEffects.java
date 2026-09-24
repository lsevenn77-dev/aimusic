package kr.co.aifect.app.karaoke;

/** Allocation-free mono vocal DSP. The dry take is kept separately; this same processor is used
 * for headphone monitoring, review and export, so recording never bakes in an irreversible effect. */
public final class VocalEffects {
    public static final class Settings {
        public final float echo, room, size, voice, backing, monitor;
        public final int offsetMs;
        public Settings(float echo, float room, float size, float voice, float backing, float monitor, int offsetMs) {
            this.echo=clamp(echo,0,0.65f); this.room=clamp(room,0,0.65f); this.size=clamp(size,0,1);
            this.voice=clamp(voice,0,2); this.backing=clamp(backing,0,1.5f); this.monitor=clamp(monitor,0,0.8f);
            this.offsetMs=Math.max(-300,Math.min(800,offsetMs));
        }
        public static Settings defaults() { return new Settings(.18f,.16f,.5f,1,.8f,.3f,80); }
    }
    private final float[] echo;
    private int echoAt;
    private final Comb[] combs;
    private final AllPass[] diffusers;
    private float echoLevel, roomLevel;

    public VocalEffects(int rate) {
        if(rate<8000||rate>192000)throw new IllegalArgumentException("Invalid sample rate");
        echo=new float[Math.round(rate*.235f)];
        combs=new Comb[]{new Comb(rate,.0297f),new Comb(rate,.0371f),new Comb(rate,.0411f),new Comb(rate,.0437f)};
        diffusers=new AllPass[]{new AllPass(rate,.005f),new AllPass(rate,.0017f)};
    }
    public float process(float dry, Settings settings) {
        if(!Float.isFinite(dry))dry=0;
        dry=clamp(dry,-1,1);
        // Short ramps prevent zipper noise while moving the live effect controls.
        echoLevel+=(settings.echo-echoLevel)*.004f; roomLevel+=(settings.room-roomLevel)*.004f;
        float delayed=echo[echoAt];
        echo[echoAt]=dry+delayed*.32f;
        if(++echoAt==echo.length)echoAt=0;
        float room=0;
        for(Comb c:combs)room+=c.process(dry,.57f+settings.size*.2f);
        room*=.25f;
        for(AllPass d:diffusers)room=d.process(room);
        return dry+delayed*echoLevel+room*roomLevel;
    }
    public static float limit(float value) {
        if(!Float.isFinite(value))return 0;
        float a=Math.abs(value);
        // Linear below -2 dB, then a smooth bounded knee instead of hard digital clipping.
        return a<=.8f?value:Math.copySign(.8f+.19f*(1-(float)Math.exp(-(a-.8f)/.19f)),value);
    }
    static float clamp(float x,float lo,float hi) { return Float.isFinite(x)?Math.max(lo,Math.min(hi,x)):lo; }
    private static final class Comb {
        final float[] data; int at; float damp;
        Comb(int rate,float seconds){data=new float[Math.round(rate*seconds)];}
        float process(float x,float feedback){float y=data[at];damp=y*.65f+damp*.35f;data[at]=x+damp*feedback;if(++at==data.length)at=0;return y;}
    }
    private static final class AllPass {
        final float[] data; int at;
        AllPass(int rate,float seconds){data=new float[Math.max(1,Math.round(rate*seconds))];}
        float process(float x){float delayed=data[at],y=delayed-x;data[at]=x+delayed*.5f;if(++at==data.length)at=0;return y;}
    }
}
