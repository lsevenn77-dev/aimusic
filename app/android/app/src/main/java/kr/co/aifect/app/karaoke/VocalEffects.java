package kr.co.aifect.app.karaoke;

/** Allocation-free mono vocal DSP. The dry take is kept separately; this same processor is used
 * for headphone monitoring, review and export, so recording never bakes in an irreversible effect. */
public final class VocalEffects {
    public static final class Settings {
        public final float echo, room, size, voice, backing, monitor, tone;
        public final int offsetMs;
        public final int noiseLevel;
        public Settings(float echo, float room, float size, float voice, float backing, float monitor, int offsetMs) {
            this(echo,room,size,voice,backing,monitor,offsetMs,0);
        }
        public Settings(float echo, float room, float size, float voice, float backing, float monitor, int offsetMs,int noiseLevel) {
            this(echo,room,size,voice,backing,monitor,offsetMs,noiseLevel,0);
        }
        public Settings(float echo,float room,float size,float voice,float backing,float monitor,int offsetMs,int noiseLevel,float tone) {
            this.tone=clamp(tone,0,1);
            this.echo=clamp(echo,0,0.65f); this.room=clamp(room,0,1); this.size=clamp(size,0,1);
            this.voice=clamp(voice,0,2); this.backing=clamp(backing,0,1.5f); this.monitor=clamp(monitor,0,0.8f);
            this.offsetMs=Math.max(-300,Math.min(800,offsetMs));
            this.noiseLevel=Math.max(0,Math.min(4,noiseLevel));
        }
        public static Settings defaults() { return new Settings(.18f,.32f,.5f,1,.8f,.3f,80); }
    }
    private final float[] echo;
    private int echoAt;
    private final RoomReverb reverb;
    private float echoLevel, roomLevel;
    private final NoiseCleaner cleaner;
    private final VocalTone tone;
    private final float ramp;private float size=.5f;

    public VocalEffects(int rate) {
        if(rate<8000||rate>192000)throw new IllegalArgumentException("Invalid sample rate");
        cleaner=new NoiseCleaner(rate);tone=new VocalTone(rate);ramp=1-(float)Math.exp(-1.0/(rate*.015));
        echo=new float[Math.round(rate*.235f)];
        reverb=new RoomReverb(rate);
    }
    public float process(float dry, Settings settings) {
        if(!Float.isFinite(dry))dry=0;
        dry=clamp(dry,-1,1);
        dry=tone.process(cleaner.process(dry,settings.noiseLevel),settings.tone);
        echoLevel+=(settings.echo-echoLevel)*ramp;roomLevel+=(RoomReverb.gain(settings.room)-roomLevel)*ramp;size+=(settings.size-size)*ramp;
        float delayed=echo[echoAt];
        echo[echoAt]=dry+delayed*.32f;
        if(++echoAt==echo.length)echoAt=0;
        float room=reverb.process(dry,size);
        return dry+delayed*echoLevel+room*roomLevel;
    }
    public static float limit(float value) {
        if(!Float.isFinite(value))return 0;
        float a=Math.abs(value);
        // Linear below -2 dB, then a smooth bounded knee instead of hard digital clipping.
        return a<=.8f?value:Math.copySign(.8f+.19f*(1-(float)Math.exp(-(a-.8f)/.19f)),value);
    }
    static float clamp(float x,float lo,float hi) { return Float.isFinite(x)?Math.max(lo,Math.min(hi,x)):lo; }
}
