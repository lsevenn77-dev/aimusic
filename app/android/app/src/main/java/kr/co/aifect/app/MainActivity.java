package kr.co.aifect.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import kr.co.aifect.app.karaoke.KaraokePlugin;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KaraokePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
