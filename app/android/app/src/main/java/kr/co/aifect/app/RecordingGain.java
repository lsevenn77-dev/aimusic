package kr.co.aifect.app;

/** Gain on captured PCM, before monitoring, mixing or writing a take. */
public final class RecordingGain {
    private RecordingGain() {}

    public static short scale(short sample, float gain) {
        int scaled = Math.round(sample * gain);
        return (short) Math.max(Short.MIN_VALUE, Math.min(Short.MAX_VALUE, scaled));
    }
}
